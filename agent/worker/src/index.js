// Lore's backend. The routes, all POST, all need the app's key in the x-lore-key header:
//   /transcribe   { audio: base64, mime, grammar } or form field "audio" → { raw, text, tidied, via, fixed }
//                 gpt-transcribe, then the fix-the-stutter node, then the fix-the-mishearing node (with grammar unless grammar is false)
//   /tidy         { text }                 → { text, via }        the fix-the-stutter node only: segments tidied while the person talks
//   /fix          { text, grammar }        → { text, via }        the fix-the-mishearing node only: older words, when a day is laid out again
//   /sections     { sentences: [] }        → { sections, breaks, via }   the time-heading node: where the day moves to a new time, and where it turns to a new subject
//   /layout       { text, photos: [] }      → { spec }             premium: the layout director
//   /read         { image: base64, mime }  → { text }             the paper-page node: a photo of a handwritten page, read word for word
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM, messages, tidy } from '../../core.mjs';
import { fix } from '../../fix.mjs';
import { sections, topics } from '../../sections.mjs';
import { direct } from '../../director.mjs';
import { read } from '../../read.mjs';

const HINT = '普通话日记，常夹杂英文单词。Mandarin journal with English words mixed in.';
const MAX_AUDIO = 15 * 1024 * 1024, MAX_TEXT = 20000;
/* the names a writer keeps (sent by the app): a short list of short strings */
const cleanNames = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim() && x.length <= 24).slice(0, 80) : []);
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

/* DeepSeek V4.1 Flash answers in about 0.2 s; its 1017 snapshot is the steady one for the jobs nobody waits on.
   V4 Flash 0731, used before, is no longer served by Together. */
const FAST = 'deepseek-ai/DeepSeek-V4.1-Flash', STEADY = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';
async function together(env, model, system, msgs, extra = {}) {
  const r = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${env.TOGETHER_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 2000, reasoning: { enabled: false }, messages: [{ role: 'system', content: system }, ...msgs], ...extra }),
  });
  if (!r.ok) throw new Error(`together ${r.status}`);
  const j = await r.json();
  const text = (j.choices?.[0]?.message?.content ?? '').trim();
  if (text.includes('ds_safety')) throw new Error('together: safety note in the reply');   // V4.1 Flash sometimes cuts its reply short for one; the node tries again
  return { text };
}
async function haiku(env, system, msgs) {
  const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const res = await claude.messages.create({ model: 'claude-haiku-5-5', max_tokens: 2000, system, messages: msgs, thinking: { type: 'disabled' }, output_config: { effort: 'low' } });
  return { text: res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() };
}
/* reading handwriting: Claude Sonnet 5.5 with vision, thinking off (the page is only transcribed) */
async function sonnetSees(env, { system, image, mime }) {
  const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const t0 = Date.now();
  const res = await claude.messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 4000, system, thinking: { type: 'between_tools' }, output_config: { effort: 'low' },
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mime, data: image } },
      { type: 'text', text: 'Transcribe this page.' },
    ] }],
  });
  return { text: res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim(), ms: Date.now() - t0 };
}
/* each node: first DeepSeek on Together; if its result fails the node's checks, Claude Haiku 5.5 once */
function tidyCall(env, model) {
  let n = 0;
  return (text) => (n++ === 0 ? together(env, model, SYSTEM, messages(text)) : haiku(env, SYSTEM, messages(text)));
}
/* the fix node with grammar off goes to Claude Haiku 5.5 first: it leaves the speaker's own grammar alone best (eval/fix.mjs) */
function fixCall(env, grammar) {
  let n = 0;
  if (!grammar) return (p) => (n++ === 0 ? haiku(env, p.system, p.messages) : together(env, STEADY, p.system, p.messages));
  return (p) => (n++ === 0 ? together(env, FAST, p.system, p.messages) : haiku(env, p.system, p.messages));
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
        let audio, vocabulary = '', grammar = true, names = [];
        if ((req.headers.get('content-type') ?? '').includes('application/json')) {
          const body = await req.json();
          grammar = body.grammar !== false;
          if (typeof body.audio !== 'string' || !body.audio) return json({ error: 'no audio' }, 400);
          if (body.audio.length * 0.75 > MAX_AUDIO) return json({ error: 'audio too long' }, 413);
          const bin = atob(body.audio), bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          audio = new File([bytes], 'entry.m4a', { type: body.mime || 'audio/mp4' });
          vocabulary = String(body.vocabulary ?? '');
          names = cleanNames(body.names);
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
        const fixed = await fix(out.text, fixCall(env, grammar), grammar, names);
        return json({ raw, text: fixed.text, tidied: out.text, via: out.via, fixed: fixed.via });
      }
      if (url.pathname === '/tidy') {
        const { text } = await req.json();
        if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return json({ error: 'bad text' }, 400);
        const out = await tidy(text, tidyCall(env, STEADY));      // stretches tidied while talking: nobody waits on them, so the cheaper model
        return json({ text: out.text, via: out.via });
      }
      if (url.pathname === '/fix') {
        const { text, grammar, names } = await req.json();
        if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return json({ error: 'bad text' }, 400);
        const out = await fix(text, fixCall(env, grammar !== false), grammar !== false, cleanNames(names));
        return json({ text: out.text, via: out.via });
      }
      if (url.pathname === '/sections') {
        const { sentences } = await req.json();
        if (!Array.isArray(sentences) || sentences.length > 400 || sentences.join('').length > MAX_TEXT) return json({ error: 'bad sentences' }, 400);
        const call = (p) => together(env, STEADY, p.system, p.messages, { response_format: { type: 'json_object' } });
        const [out, tp] = await Promise.all([sections(sentences.map(String), call), topics(sentences.map(String), call)]);
        return json({ sections: out.sections, breaks: tp.breaks, via: out.via });
      }
      if (url.pathname === '/read') {
        const { image, mime } = await req.json();
        if (!image) return json({ error: 'no image' }, 400);
        const type = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(mime) ? mime : 'image/jpeg';
        return json(await read(image, type === 'image/heic' ? 'image/jpeg' : type, (p) => sonnetSees(env, p)));
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
