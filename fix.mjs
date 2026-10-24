// The fix-the-mishearing node, right after fix-the-stutter. One cheap model call corrects the words speech recognition
// clearly got wrong and, while "修复语法 / Fix grammar" is on (the default), also broken grammar, the joins between sentences
// and repeats said without meaning to; then checks in code. The speaker's own words, tone particles, names, slang and
// English inside Chinese stay. If the checks fail twice, the text stays as it was.
// Shared by the eval (eval/fix.mjs) and the backend (worker/), so what was tested is what runs.

export function fixSystem(grammar, names = []) {
  return `You correct one entry of a spoken journal. Speech recognition wrote it down, and filler words were already taken out.

Fix only:
- misheard words: a word that makes no sense where it is, when a similar-sounding word clearly does. Words, names and places that make sense stay, even when they are unusual.${grammar ? `
- grammar: broken or run-on sentences, wrong tenses, a missing small word, word order, 的/得/地, so that every sentence reads correctly.
- flow: join pieces that belong in one sentence, split one that runs on, and let each sentence lead into the next with the plain joins the speaker would say (所以, 后来, 不过, 还, so, then, but).
- repetition: a word or phrase said again and again without meaning to (然后…然后…然后, 就是…就是, and then… and then…, the same point twice in a row): keep it once.
Make it read like the speaker on a good day, a little neater than they talked, never like someone else wrote it. Use the speaker's own words; never swap in fancier ones.` : `
Nothing else. Grammar is the speaker's own here: a wrong tense (I go, she stand), 的 for 得, a run-on sentence or a repeat all stay exactly as said.`}

Keep exactly:
- every fact, feeling and detail, in the same order. Add nothing, summarize nothing.
- tone particles: 啊, 呀, 呢, 吧, 嘛, 哈, 啦, 哦, 呗, 咯, 哈哈, lol, haha. Every one stays where it was.
- names, slang, dialect, hedges (kind of, I guess, 感觉, 差不多), and repeats said for emphasis (绝了绝了, so so good)
- English inside Chinese and Chinese inside English, never translated
- the speaker's voice: casual stays casual. No formal words (此外, 因此, 总之, 然而, Moreover).

If nothing needs fixing, return the text unchanged. Reply with the text only.${names.length ? `

The writer's people, spelled their way. A name that sounds like one of these is that person: write it exactly like this.
${names.join('、')}` : ''}`;
}

// worked examples per mode, shown as earlier turns (none of them is in the eval set)
const SHOTS = {
  grammar: [
    ['So yesterday I go to the farmers market and then I buy some fresh basel and then it smell amazing and then I made pasta lol.',
     'So yesterday I went to the farmers market and bought some fresh basil. It smelled amazing, so I made pasta lol.'],
    ['今天去了那个新开的书店，然后书店里面人很多，然后我在里面待了一下午，然后买了两本书，书很好看的，我觉得很值得啊，下次还要去的吧。',
     '今天去了那个新开的书店，里面人很多，我在里面待了一下午，买了两本书，都很好看，我觉得很值得啊，下次还要去吧。'],
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

export const fixPrompt = (text, grammar, names = []) => ({
  system: fixSystem(grammar, names),
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
/* tone particles: how many of each, so a correction can be held to keeping them */
const PARTICLES = /哈哈|[啊呀呢吧嘛哈啦哦呗咯]|\b(?:lol|haha|lmao)\b/gi;
const tally = (s) => { const m = new Map(); for (const p of s.toLowerCase().match(PARTICLES) ?? []) m.set(p, (m.get(p) ?? 0) + 1); return m; };

export function fixCheck(input, output, grammar) {
  const issues = [];
  const out = output.trim();
  if (!out) return ['empty'];
  if (PREAMBLE.test(out) || /^["“「]/.test(out) && !/^["“「]/.test(input.trim())) issues.push('preamble or quotes');
  const shortest = grammar ? 0.6 : 0.8;          // with grammar on, repeats go, so the text may get shorter
  if (out.length > input.length * 1.15 + 4 || out.length < input.length * shortest - 4) issues.push('length changed too much');
  const a = toks(input), b = toks(out), same = lcs(a, b), changed = a.length - same + (b.length - same);
  const budget = grammar ? Math.max(6, Math.round(a.length * 0.55)) : Math.max(2, Math.round(a.length * 0.08));
  if (changed > budget) issues.push(`too many changes: ${changed} > ${budget}`);
  const lostNames = names(input).filter((n) => !out.includes(n));
  if (lostNames.length) issues.push(`names changed: ${lostNames.join(' ')}`);
  if (HAN.test(input)) {                      // English inside Chinese is never translated or dropped
    const en = (s) => new Set((s.match(/[A-Za-z][A-Za-z'’&-]*/g) ?? []).map((w) => w.toLowerCase()));
    const lost = [...en(input)].filter((w) => !en(out).has(w));
    if (lost.length) issues.push(`english words lost: ${lost.join(' ')}`);
    const inH = new Set(input.match(/[㐀-鿿]/g) ?? []), newH = [...new Set(out.match(/[㐀-鿿]/g) ?? [])].filter((c) => !inH.has(c));
    if (newH.length > (grammar ? 8 : 2)) issues.push(`chinese added: ${newH.join('')}`);
  }
  const before = tally(input), after = tally(out);
  let dropped = 0;
  for (const [p, n] of before) { if (!after.has(p)) issues.push(`tone particle lost: ${p}`); dropped += Math.max(0, n - (after.get(p) ?? 0)); }
  if (dropped > 1) issues.push(`tone particles lost: ${dropped}`);
  const nums = new Set(input.match(/\d+/g) ?? []);
  for (const d of out.match(/\d+/g) ?? []) if (!nums.has(d)) issues.push(`number added: ${d}`);
  if (FORMAL.test(out) && !FORMAL.test(input)) issues.push('formal connective');
  return issues;
}

/* ── the node: model and checks, one retry; if it still fails, the text is kept as it was ─────── */
export async function fix(text, call, grammar = true, names = []) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await call(fixPrompt(text, grammar, names));
      const out = r.text.trim();
      if (!fixCheck(text, out, grammar).length) return { ...r, text: out, via: attempt ? 'retry' : 'model' };
    } catch { /* a failed call counts as a failed attempt */ }
  }
  return { text, inTok: 0, outTok: 0, ms: 0, via: 'kept' };
}
