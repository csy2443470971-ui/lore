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
