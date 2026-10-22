// Lore's backend. Three routes, all POST, all need the app's key in the x-lore-key header:
//   /transcribe   { audio: base64, mime, grammar } or form field "audio" → { raw, text, tidied, via, fixed }
//                 gpt-transcribe, then the fix-the-stutter node, then the fix-the-mishearing node (with grammar unless grammar is false)
//   /tidy         { text }                 → { text, via }        the fix-the-stutter node only: segments tidied while the person talks
//   /fix          { text, grammar }        → { text, via }        the fix-the-mishearing node only: older words, when a day is laid out again
//   /layout       { text, photos: [] }      → { spec }             premium: the layout director
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM, messages, tidy } from '../../core.mjs';
import { fix } from '../../fix.mjs';
import { direct } from '../../director.mjs';

const HINT = '普通话日记，常夹杂英文单词。Mandarin journal with English words mixed in.';
const MAX_AUDIO = 15 * 1024 * 1024, MAX_TEXT = 20000;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function transcribe(env, audio, extra) {
  const fd = new FormData();
  fd.append('model', 'gpt-transcribe');
  fd.append('prompt', extra ? `${HINT} ${extra}` : HINT);
  fd.append('file', audio, audio.type.includes('wav') ? 'entry.wav' : 'entry.m4a');   // OpenAI reads the format from the name
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: fd });
  if (!r.ok) throw new Error(`transcription ${r.status}`);
  return (await r.json()).text ?? '';
}

/* DeepSeek V4.1 Flash answers in about 0.2 s; V4 Flash is slower but keeps to "words only" best (eval/fix.mjs) */
const FAST = 'deepseek-ai/DeepSeek-V4.1-Flash', STEADY = 'deepseek-ai/DeepSeek-V4-Flash-0731';
async function together(env, model, system, msgs) {
  const r = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${env.TOGETHER_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 2000, reasoning: { enabled: false }, messages: [{ role: 'system', content: system }, ...msgs] }),
  });
  if (!r.ok) throw new Error(`together ${r.status}`);
  const j = await r.json();
  return { text: (j.choices?.[0]?.message?.content ?? '').trim() };
}
async function haiku(env, system, msgs) {
  const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const res = await claude.messages.create({ model: 'claude-haiku-5-5', max_tokens: 2000, system, messages: msgs, thinking: { type: 'disabled' }, output_config: { effort: 'low' } });
  return { text: res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() };
}
/* each node: first DeepSeek on Together; if its result fails the node's checks, Claude Haiku 5.5 once */
function tidyCall(env, model) {
  let n = 0;
  return (text) => (n++ === 0 ? together(env, model, SYSTEM, messages(text)) : haiku(env, SYSTEM, messages(text)));
}
function fixCall(env, grammar) {
  let n = 0;
  return (p) => (n++ === 0 ? together(env, grammar ? FAST : STEADY, p.system, p.messages) : haiku(env, p.system, p.messages));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (req.headers.get('x-lore-key') !== env.LORE_APP_KEY) return json({ error: 'unknown app' }, 401);
    const { success } = await env.LIMIT.limit({ key: req.headers.get('cf-connecting-ip') ?? 'anon' });
    if (!success) return json({ error: 'slow down' }, 429);
    try {
      if (url.pathname === '/transcribe') {
        // the app sends { audio: base64, mime } as JSON: m4a from expo-audio, or a 16 kHz WAV from Apple's recogniser in the
        // installed app; a form with an "audio" file works too (curl, the evals)
        let audio, vocabulary = '', grammar = true;
        if ((req.headers.get('content-type') ?? '').includes('application/json')) {
          const body = await req.json();
          grammar = body.grammar !== false;
          if (typeof body.audio !== 'string' || !body.audio) return json({ error: 'no audio' }, 400);
          if (body.audio.length * 0.75 > MAX_AUDIO) return json({ error: 'audio too long' }, 413);
          const bin = atob(body.audio), bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          audio = new File([bytes], 'entry.m4a', { type: body.mime || 'audio/mp4' });
          vocabulary = String(body.vocabulary ?? '');
        } else {
          const form = await req.formData();
          audio = form.get('audio');
          if (!audio || typeof audio === 'string') return json({ error: 'no audio' }, 400);
          if (audio.size > MAX_AUDIO) return json({ error: 'audio too long' }, 413);
          vocabulary = String(form.get('vocabulary') ?? '');
          grammar = form.get('grammar') !== 'false';
        }
        const raw = await transcribe(env, audio, vocabulary.slice(0, 300));
        if (!raw.trim()) return json({ raw: '', text: '', via: 'empty' });
        const out = await tidy(raw, tidyCall(env, FAST));
        const fixed = await fix(out.text, fixCall(env, grammar), grammar);
        return json({ raw, text: fixed.text, tidied: out.text, via: out.via, fixed: fixed.via });
      }
      if (url.pathname === '/tidy') {
        const { text } = await req.json();
        if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return json({ error: 'bad text' }, 400);
        const out = await tidy(text, tidyCall(env, STEADY));      // stretches tidied while talking: nobody waits on them, so the cheaper model
        return json({ text: out.text, via: out.via });
      }
      if (url.pathname === '/fix') {
        const { text, grammar } = await req.json();
        if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return json({ error: 'bad text' }, 400);
        const out = await fix(text, fixCall(env, grammar !== false), grammar !== false);
        return json({ text: out.text, via: out.via });
      }
      if (url.pathname === '/layout') {
        const { text, photos } = await req.json();
        if (typeof text !== 'string' || !Array.isArray(photos) || text.length > MAX_TEXT) return json({ error: 'bad day' }, 400);
        const { spec } = await direct({ text, photos: photos.map(String).slice(0, 60) }, { client: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) });
        return json({ spec });
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e.message ?? e).slice(0, 200) }, 502);
    }
  },
};
