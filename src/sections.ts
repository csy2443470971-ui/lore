/* The time-heading rules, ported from agent/sections.mjs: used when Lore's backend can't be reached (and on the web
   preview). A time word that opens a sentence becomes a heading; the backend's model finds the rest. */
export type Section = { sentence: number; heading: string };

const ZH_TIME = /^(?:[，,\s]*(?:然后|接着|到了|等到|今天)?)(清早|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|半夜|深夜|凌晨|下班以后|下班后|午饭后|晚饭后)/;
const EN_TIME = /^(?:(?:so|and|then|okay|ok)[\s,]+)*(?:in the |this |that |later that |later in the )?(morning|afternoon|evening|night|noon|tonight|after lunch|after dinner|after work)\b/i;

export function timeRules(sentences: string[]): Section[] {
  const out: Section[] = [];
  sentences.forEach((s, i) => {
    const z = s.match(ZH_TIME), e = s.match(EN_TIME);
    if (z) out.push({ sentence: i, heading: z[1] });
    else if (e) out.push({ sentence: i, heading: e[1].charAt(0).toUpperCase() + e[1].slice(1).toLowerCase() });
  });
  return out;
}

/* The parts of a day, in order. A paragraph goes in the part a time word it opens with names ("傍晚…", "after lunch…"),
   or else the part of the day it was said in; a heading goes above the first paragraph of each part. A paragraph said
   later in the day but about something earlier (told in the evening, without a time word) stays in the part the
   telling has reached, so the parts never step back by the clock alone. */
type PartKey = 'early' | 'am' | 'noon' | 'pm' | 'dusk' | 'eve' | 'late';
const PARTS: Record<PartKey, { zh: string; en: string; order: number }> = {
  early: { zh: '早上', en: 'Early morning', order: 1 },
  am: { zh: '上午', en: 'Morning', order: 2 },
  noon: { zh: '中午', en: 'Midday', order: 3 },
  pm: { zh: '下午', en: 'Afternoon', order: 4 },
  dusk: { zh: '傍晚', en: 'Dusk', order: 5 },
  eve: { zh: '晚上', en: 'Evening', order: 6 },
  late: { zh: '深夜', en: 'Late night', order: 7 },
};
/* a spoken time word, as a part of the day (the more particular words first) */
const SPOKEN: [RegExp, PartKey][] = [
  [/深夜|半夜|凌晨|后半夜|late night|midnight/i, 'late'],
  [/清早|早上|早晨|一早|大早|early morning/i, 'early'],
  [/上午|morning/i, 'am'],
  [/中午|午饭|午休|lunch|noon|midday/i, 'noon'],
  [/下午|afternoon/i, 'pm'],
  [/傍晚|黄昏|下班|日落|after work|dusk|sunset/i, 'dusk'],
  [/晚上|晚饭|夜里|今晚|evening|tonight|dinner|night/i, 'eve'],
];
const spokenPart = (s: string) => SPOKEN.find(([re]) => re.test(s))?.[1] ?? null;
/* the part of the day a time falls in, by the clock: up to 5 the night before goes on, then morning, midday from 11:30,
   afternoon from 13:30, evening from 18:00 (dusk and early morning only when they are said) */
function clockPart(ms: number): PartKey {
  const d = new Date(ms), m = d.getHours() * 60 + d.getMinutes();
  return m < 5 * 60 ? 'late' : m < 11 * 60 + 30 ? 'am' : m < 13 * 60 + 30 ? 'noon' : m < 18 * 60 ? 'pm' : 'eve';
}

export function sectionize<T extends { kind: string; text?: string; day?: string; at?: number; parts?: { text: string }[] }>(items: T[]): T[] {
  const words = items.map((x) => x.text ?? x.parts?.map((p) => p.text).join('') ?? '').join('');
  const zh = (words.match(/[㐀-鿿]/g)?.length ?? 0) >= (words.match(/[A-Za-z]+/g)?.length ?? 0);
  const out: T[] = [];
  let cur: string | null = null, order = 0, said: PartKey | null = null;
  for (const x of items) {
    if (x.kind === 'head') {
      if (x.day) { out.push(x); cur = null; order = 0; continue; }    // the next day of a page over several days
      const k = spokenPart(x.text ?? '');
      if (k) said = k;
      else { out.push(x); cur = x.text ?? ''; }                      // a heading of its own, kept as it is
      continue;
    }
    let k: PartKey | null = said;
    said = null;
    if (!k && x.at) { const c = clockPart(x.at); if (PARTS[c].order > order) k = c; }
    if (k && k !== cur) {
      out.push({ kind: 'head', text: zh ? PARTS[k].zh : PARTS[k].en } as T);
      cur = k; order = PARTS[k].order;
    }
    out.push(x);
  }
  return out;
}
