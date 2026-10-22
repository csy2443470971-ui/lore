// The fix-the-stutter node's pure parts: the prompt, the checks in code, the sweep and the no-API rules.
// Shared by the evals (clean.mjs) and the backend (worker/), so what was tested is what runs.

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
