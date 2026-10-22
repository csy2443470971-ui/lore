// The fix-the-stutter node: one cheap model call per recording, then checks in code.
// It removes fillers, stutters, false starts and taken-back words, adds punctuation, and changes nothing else.
import Anthropic from '@anthropic-ai/sdk';
import { togetherKey } from './keys.mjs';

export const SYSTEM = `You tidy the transcript of a spoken journal entry so it reads smoothly, without changing how the speaker talks.

Remove:
- filler sounds and words used as pauses: um, uh, like, you know, I mean, 嗯, 呃, 啊, and 那个 / 就是 / 然后 when they are only a pause
- stutters and accidental repeats: 我我我 → 我, the the → the
- false starts, and when the speaker corrects themselves, the part they took back (keep the correction)

Keep exactly:
- every other word, in the same order
- slang, dialect and tone particles (吧, 呢, 嘛, 儿, lol, ngl, wanna)
- hedges such as kind of, I guess, 差不多
- repeats said for emphasis: 绝了绝了, so so so
- English inside Chinese and Chinese inside English, never translated
- names and numbers as they were said

You may add or fix punctuation. Do not add words, explain, summarize or make it formal.
Reply with the tidied text only.`;

// two worked examples, shown as earlier turns
export const SHOTS = [
  ['嗯，那个，我今天跟 Amy 去了，去了那个新开的 bakery，然后就是，就是 croissant 真的绝了绝了。',
   '我今天跟 Amy 去了那个新开的 bakery，croissant 真的绝了绝了。'],
  ['So um I I wanted to, uh, finish the essay by Friday, no, Thursday, but like it\'s kind of not happening lol.',
   'So I wanted to finish the essay by Thursday, but it\'s kind of not happening lol.'],
];

export const messages = (text) => [
  ...SHOTS.flatMap(([a, b]) => [{ role: 'user', content: a }, { role: 'assistant', content: b }]),
  { role: 'user', content: text },
];

/* ── checks in code: what a tidy may never do ─────────────────────────────── */
const HAN = /[㐀-鿿]/g;
const FILLER_EN = new Set(['um', 'umm', 'uh', 'uhh', 'erm', 'hmm', 'like', 'you', 'know', 'mean', 'no', 'wait', 'gonna']);
const FORMAL = /此外|因此|总之|综上|首先|其次|然而|Furthermore|Moreover|Additionally|In conclusion|Overall,/;
const PREAMBLE = /^(here|sure|cleaned|tidied|the tidied|以下|好的|整理后)/i;

export function check(input, output) {
  const issues = [];
  const out = output.trim();
  if (!out) return ['empty'];
  if (PREAMBLE.test(out) || /^["“「]/.test(out) && !/^["“「]/.test(input.trim())) issues.push('preamble or quotes');
  // English words may be dropped only when they are fillers or taken back; most must survive
  const words = (s) => [...new Set((s.match(/[A-Za-z][A-Za-z'’&]*/g) || []).map((w) => w.toLowerCase()))];
  const inW = words(input).filter((w) => !FILLER_EN.has(w)), outW = new Set(words(out));
  const lost = inW.filter((w) => !outW.has(w));
  if (inW.length && lost.length / inW.length > 0.25) issues.push(`english words lost: ${lost.join(' ')}`);
  const added = [...outW].filter((w) => !words(input).includes(w));
  if (added.length) issues.push(`english words added: ${added.join(' ')}`);
  // Chinese: nothing new, and most of it kept
  const inH = input.match(HAN) || [], outH = out.match(HAN) || [];
  const inSet = new Set(inH), newH = [...new Set(outH)].filter((c) => !inSet.has(c));
  if (newH.length > 1) issues.push(`chinese added: ${newH.join('')}`);
  if (inH.length - outH.length > 12 && outH.length / inH.length < 0.6) issues.push('too much chinese removed');   // a short false start may go; a summary may not
  // numbers as said, no formal joins, no growth
  const digits = (s) => (s.match(/\d+/g) || []).join(',');
  for (const d of (out.match(/\d+/g) || [])) if (!digits(input).split(',').includes(d)) issues.push(`number added: ${d}`);
  if (FORMAL.test(out) && !FORMAL.test(input)) issues.push('formal connective');
  if (out.length > input.length * 1.08 + 4) issues.push('longer than the input');
  return issues;
}

/* ── the no-API fallback: drop obvious fillers and immediate repeats, nothing else ─ */
export function rules(text) {
  return text
    .replace(/(^|[，,。.!?！？\s])(嗯+|呃+|啊+)[，,]?\s*/g, '$1')
    .replace(/\b(um+|uh+|erm)\b[,，]?\s*/gi, '')
    .replace(/([㐀-鿿]{1,2})\1{1,}(?=[㐀-鿿])/g, (m, a) => (a === '绝了' ? m : a))
    .replace(/\b(\w+)( \1\b)+/gi, (m, a) => (/^so$/i.test(a) ? m : a))
    .replace(/(那个|就是|然后|结果)[，,]\s*\1/g, '$1')
    .replace(/^[，,\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ── callers ─────────────────────────────────────────────────────────────── */
const strip = (s) => s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();

export async function viaTogether(model, text, opts = {}) {
  const t0 = Date.now();
  const { maxTokens = 1200, ...extra } = opts;
  const r = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${togetherKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, max_tokens: maxTokens, messages: [{ role: 'system', content: SYSTEM }, ...messages(text)], ...extra }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  if (extra.stream) {
    // server-sent events: add up the text, and read the usage from the last chunk that has it
    let out = '', usage = {};
    for (const line of (await r.text()).split('\n')) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
      const j = JSON.parse(line.slice(6));
      out += j.choices?.[0]?.delta?.content ?? '';
      if (j.usage) usage = j.usage;
    }
    return { text: strip(out), inTok: usage.prompt_tokens ?? 0, outTok: usage.completion_tokens ?? 0, ms: Date.now() - t0 };
  }
  const j = await r.json();
  return { text: strip(j.choices[0].message.content || ''), inTok: j.usage?.prompt_tokens ?? 0, outTok: j.usage?.completion_tokens ?? 0, ms: Date.now() - t0 };
}

const claude = new Anthropic();
export async function viaClaude(model, text) {
  const t0 = Date.now();
  // Haiku 5.5 allows thinking off at effort high or below; Opus 5.5 always thinks, so it runs at low effort
  const thinking = model === 'claude-haiku-5-5' ? { thinking: { type: 'disabled' } } : {};
  const res = await claude.messages.create({
    model, max_tokens: 2000, system: SYSTEM, messages: messages(text),
    output_config: { effort: 'low' }, ...thinking,
  });
  if (res.stop_reason === 'refusal') throw new Error('refusal');
  const out = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return { text: out, inTok: res.usage.input_tokens, outTok: res.usage.output_tokens, ms: Date.now() - t0 };
}

/* ── after the model: sweep out any standalone filler sound it left (never repeats: those may be emphasis) ─ */
export function sweep(text) {
  return text
    .replace(/(^|[，,。.!?！？；;]\s*)(嗯+|呃+)[，,、]?\s*/g, '$1')
    .replace(/(^|[\s,，])(um+|uh+|erm)\b[,，]?\s*/gi, '$1')
    .replace(/^\s*[，,]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ── the node: model, sweep, checks; one retry; if it still fails, the no-API rules ─ */
export async function tidy(text, call) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await call(text);
      const out = sweep(r.text);
      if (!check(text, out).length) return { ...r, text: out, via: attempt ? 'retry' : 'model' };
    } catch { /* a failed call counts as a failed attempt */ }
  }
  return { text: rules(text), inTok: 0, outTok: 0, ms: 0, via: 'rules' };
}
