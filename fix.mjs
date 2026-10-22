// The fix-the-mishearing node, right after fix-the-stutter. One cheap model call corrects the words speech recognition
// clearly got wrong and, while "修复语法 / Fix grammar" is on (the default), broken grammar; then checks in code.
// The speaker's own words, names, slang and English inside Chinese stay. If the checks fail twice, the text stays as it was.
// Shared by the eval (eval/fix.mjs) and the backend (worker/), so what was tested is what runs.

export function fixSystem(grammar) {
  return `You correct one entry of a spoken journal. Speech recognition wrote it down, and filler words were already taken out.

Fix only:
- misheard words: a word that makes no sense where it is, when a similar-sounding word clearly does. Words, names and places that make sense stay, even when they are unusual.${grammar ? `
- grammar: broken sentences, wrong tenses, a missing small word, word order, so that each sentence reads correctly. Use the speaker's own words; never swap in fancier ones.` : ''}

Keep exactly:
- everything that is already right, in the same order
- names, slang, dialect, tone particles, hedges, and repeats said for emphasis
- English inside Chinese and Chinese inside English, never translated
- the speaker's voice: casual stays casual. Do not make it formal, summarize, or add anything new.

If nothing needs fixing, return the text unchanged. Reply with the text only.`;
}

// two worked examples per mode, shown as earlier turns (none of them is in the eval set)
const SHOTS = {
  grammar: [
    ['Yesterday I go to the farmers market and buy some fresh basel, it smell amazing.',
     'Yesterday I went to the farmers market and bought some fresh basil, it smelled amazing.'],
    ['下班以后我们组把这是二搞定了，大家开心的不得了，Amy 说 next time 还要一起。',
     '下班以后我们组把这事儿搞定了，大家开心得不得了，Amy 说 next time 还要一起。'],
  ],
  words: [
    ['Yesterday I go to the farmers market and buy some fresh basel, it smell amazing.',
     'Yesterday I go to the farmers market and buy some fresh basil, it smell amazing.'],
    ['下班以后我们组把这是二搞定了，大家开心的不得了，Amy 说 next time 还要一起。',
     '下班以后我们组把这事儿搞定了，大家开心的不得了，Amy 说 next time 还要一起。'],
  ],
};

export const fixPrompt = (text, grammar) => ({
  system: fixSystem(grammar),
  messages: [
    ...SHOTS[grammar ? 'grammar' : 'words'].flatMap(([a, b]) => [{ role: 'user', content: a }, { role: 'assistant', content: b }]),
    { role: 'user', content: text },
  ],
});

/* ── checks in code: a correction stays small, keeps names and every English word inside Chinese ─── */
const HAN = /[㐀-鿿]/;
const PREAMBLE = /^(here|sure|corrected|the corrected|以下|好的|修改后)/i;
const FORMAL = /此外|因此|总之|综上|首先|其次|然而|Furthermore|Moreover|Additionally|In conclusion|Overall,/;
const toks = (s) => (s.toLowerCase().match(/[㐀-鿿]|[a-z][a-z'’&-]*|\d+/g) ?? []);
function lcs(a, b) {
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}
/* capitalised words that don't open a sentence are names (Sean, NYC, Kashish): they must all survive */
const names = (s) => [...new Set((s.match(/(?<![.!?。！？]\s*|^)\b[A-Z][A-Za-z'’-]+/g) ?? []))];

export function fixCheck(input, output, grammar) {
  const issues = [];
  const out = output.trim();
  if (!out) return ['empty'];
  if (PREAMBLE.test(out) || /^["“「]/.test(out) && !/^["“「]/.test(input.trim())) issues.push('preamble or quotes');
  if (out.length > input.length * 1.2 + 4 || out.length < input.length * 0.8 - 4) issues.push('length changed too much');
  const a = toks(input), b = toks(out), same = lcs(a, b), changed = a.length - same + (b.length - same);
  const budget = grammar ? Math.max(4, Math.round(a.length * 0.25)) : Math.max(2, Math.round(a.length * 0.08));
  if (changed > budget) issues.push(`too many changes: ${changed} > ${budget}`);
  const lostNames = names(input).filter((n) => !out.includes(n));
  if (lostNames.length) issues.push(`names changed: ${lostNames.join(' ')}`);
  if (HAN.test(input)) {                      // English inside Chinese is never translated or dropped
    const en = (s) => new Set((s.match(/[A-Za-z][A-Za-z'’&-]*/g) ?? []).map((w) => w.toLowerCase()));
    const lost = [...en(input)].filter((w) => !en(out).has(w));
    if (lost.length) issues.push(`english words lost: ${lost.join(' ')}`);
    const inH = new Set(input.match(/[㐀-鿿]/g) ?? []), newH = [...new Set(out.match(/[㐀-鿿]/g) ?? [])].filter((c) => !inH.has(c));
    if (newH.length > (grammar ? 4 : 2)) issues.push(`chinese added: ${newH.join('')}`);
  }
  const nums = new Set(input.match(/\d+/g) ?? []);
  for (const d of out.match(/\d+/g) ?? []) if (!nums.has(d)) issues.push(`number added: ${d}`);
  if (FORMAL.test(out) && !FORMAL.test(input)) issues.push('formal connective');
  return issues;
}

/* ── the node: model and checks, one retry; if it still fails, the text is kept as it was ─────── */
export async function fix(text, call, grammar = true) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await call(fixPrompt(text, grammar));
      const out = r.text.trim();
      if (!fixCheck(text, out, grammar).length) return { ...r, text: out, via: attempt ? 'retry' : 'model' };
    } catch { /* a failed call counts as a failed attempt */ }
  }
  return { text, inTok: 0, outTok: 0, ms: 0, via: 'kept' };
}
