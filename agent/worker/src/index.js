// Lore's backend. Three routes, all POST, all need the app's key in the x-lore-key header:
//   /transcribe   form field "audio" (m4a) → { raw, text, via }   gpt-transcribe, then the fix-the-stutter node
//   /tidy         { text }                 → { text, via }        the fix-the-stutter node only
//   /layout       { text, photos: [] }      → { spec }             premium: the layout director
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM, messages, tidy } from '../../core.mjs';
import { direct } from '../../director.mjs';

const HINT = '普通话日记，常夹杂英文单词。Mandarin journal with English words mixed in.';
const MAX_AUDIO = 15 * 1024 * 1024, MAX_TEXT = 20000;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function transcribe(env, audio, extra) {
  const fd = new FormData();
  fd.append('model', 'gpt-transcribe');
  fd.append('prompt', extra ? `${HINT} ${extra}` : HINT);
  fd.append('file', audio, 'entry.m4a');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: fd });
  if (!r.ok) throw new Error(`transcription ${r.status}`);
  return (await r.json()).text ?? '';
}

/* first DeepSeek V4 Flash on Together; if its result fails the checks, Claude Haiku 5.5 once; then the no-API rules */
function tidyCall(env) {
  let n = 0;
  return async (text) => {
    if (n++ === 0) {
      const r = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${env.TOGETHER_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'deepseek-ai/DeepSeek-V4-Flash-0731', temperature: 0, max_tokens: 2000, reasoning: { enabled: false }, messages: [{ role: 'system', content: SYSTEM }, ...messages(text)] }),
      });
      if (!r.ok) throw new Error(`tidy ${r.status}`);
      const j = await r.json();
      return { text: (j.choices?.[0]?.message?.content ?? '').trim() };
    }
    const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const res = await claude.messages.create({ model: 'claude-haiku-5-5', max_tokens: 2000, system: SYSTEM, messages: messages(text), thinking: { type: 'disabled' }, output_config: { effort: 'low' } });
    return { text: res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() };
  };
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
        const form = await req.formData();
        const audio = form.get('audio');
        if (!audio || typeof audio === 'string') return json({ error: 'no audio' }, 400);
        if (audio.size > MAX_AUDIO) return json({ error: 'audio too long' }, 413);
        const raw = await transcribe(env, audio, String(form.get('vocabulary') ?? '').slice(0, 300));
        if (!raw.trim()) return json({ raw: '', text: '', via: 'empty' });
        const out = await tidy(raw, tidyCall(env));
        return json({ raw, text: out.text, via: out.via });
      }
      if (url.pathname === '/tidy') {
        const { text } = await req.json();
        if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return json({ error: 'bad text' }, 400);
        const out = await tidy(text, tidyCall(env));
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
