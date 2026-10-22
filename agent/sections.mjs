// The time-heading node, run when a day is laid out. One cheap call reads the day's sentences, numbered, and says
// which ones start a new time of day because the speaker names a time there ("下午", "after lunch", "at 3 pm").
// Each becomes a small heading above that part of the page, in the speaker's own words. Code drops any heading that
// isn't grounded in its sentence; without a model (or when the call fails) a rule set finds the common time words.
// Shared by the eval (eval/sections.mjs) and the backend (worker/).

export const SECTIONS_SYSTEM = `You mark where a spoken journal entry moves to a new time of day. You get the day's sentences, numbered from 0.

Return JSON: {"sections": [{"sentence": n, "heading": "..."}]}, one entry for each sentence that starts a new part of the day because the speaker names a time in it: morning, noon, afternoon, evening, night, a clock time, or a moment such as after lunch or 下班以后.
- heading: that time, short (at most 4 words, or 6 Chinese characters), in the language of the sentence, using the speaker's own words. No dates, no summaries.
- Only times the speaker actually says. Never infer a time from what happened.
- A time mentioned only in passing ("I was tired all afternoon") does not start a part.
- Keep the order of the sentences; at most one entry per sentence.
If there is none, return {"sections": []}.`;

/* a second, separate call (so it can't disturb the headings): where the speaker turns to a different subject.
   These are only places a paragraph may start; the paragraph rules in the app decide */
export const TOPICS_SYSTEM = `You read a spoken journal entry, its sentences numbered from 0, and mark where the speaker turns to a different subject: a new event, place, person or train of thought. Leave out small turns within one subject. Return JSON: {"breaks": [n, ...]} with the numbers of the sentences that start a new subject, or {"breaks": []}.`;

export const sectionsMessages = (sentences) => [
  { role: 'user', content: sentences.map((s, i) => `${i}. ${s}`).join('\n') },
];

const HAN = /[㐀-鿿]/g;
const STOP = new Set(['the', 'a', 'an', 'in', 'at', 'on', 'of', 'this', 'that', 'my', 'around', 'about', 'in the']);
const words = (s) => (s.toLowerCase().match(/[a-z]+|\d+/g) ?? []).filter((w) => !STOP.has(w));

/* keep only entries that point at a real sentence, in order, with a short heading made of that sentence's words */
export function checkSections(sentences, out) {
  const list = Array.isArray(out?.sections) ? out.sections : [];
  const kept = [];
  let prev = -1;
  for (const e of list) {
    const n = Number(e?.sentence), h = String(e?.heading ?? '').trim().replace(/[。.,，:：]+$/, '');
    if (!Number.isInteger(n) || n <= prev || n >= sentences.length || !h) continue;
    const s = sentences[n], han = h.match(HAN) ?? [], en = words(h);
    if (han.length > 6 || en.length > 4) continue;
    const grounded = han.every((c) => s.includes(c)) && en.filter((w) => words(s).includes(w)).length * 2 >= en.length;
    if (!grounded || (!han.length && !en.length)) continue;
    kept.push({ sentence: n, heading: h });
    prev = n;
  }
  return kept;
}
/* topic breaks only suggest where a paragraph may start; any whole number inside the day is fine */
export const checkBreaks = (sentences, out) => [...new Set((Array.isArray(out?.breaks) ? out.breaks : []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < sentences.length))].sort((a, b) => a - b);

/* no model: a time word that opens the sentence */
const ZH_TIME = /^(?:[，,\s]*(?:然后|接着|到了|等到|今天)?)(清早|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|半夜|深夜|凌晨|下班以后|下班后|午饭后|晚饭后)/;
const EN_TIME = /^(?:(?:so|and|then|okay|ok)[\s,]+)*(?:in the |this |that |later that |later in the )?(morning|afternoon|evening|night|noon|tonight|after lunch|after dinner|after work)\b/i;
export function ruleSections(sentences) {
  const out = [];
  sentences.forEach((s, i) => {
    const z = s.match(ZH_TIME), e = s.match(EN_TIME);
    if (z) out.push({ sentence: i, heading: z[1] });
    else if (e) out.push({ sentence: i, heading: e[1].charAt(0).toUpperCase() + e[1].slice(1).toLowerCase() });
  });
  return out;
}

/* the node: one model call, then the checks; a call that fails or returns nothing usable falls back to the rules */
export async function sections(sentences, call) {
  if (!sentences.length) return { sections: [], via: 'empty' };
  try {
    const r = await call({ system: SECTIONS_SYSTEM, messages: sectionsMessages(sentences) });
    const j = JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    return { sections: checkSections(sentences, j), via: 'model', inTok: r.inTok, outTok: r.outTok, ms: r.ms };
  } catch {
    return { sections: ruleSections(sentences), via: 'rules' };
  }
}
export async function topics(sentences, call) {
  if (sentences.length < 2) return { breaks: [] };
  try {
    const r = await call({ system: TOPICS_SYSTEM, messages: sectionsMessages(sentences) });
    return { breaks: checkBreaks(sentences, JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, ''))) };
  } catch {
    return { breaks: [] };
  }
}
