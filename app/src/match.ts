// Ported from agent/match.mjs. Match what was said to the photos, by the numbers the speaker used. Pure code, no API.
//   "一号是湖边那家咖啡馆。照片三到六是回家的路上。"   "Number one is the café… I was starving, and, okay, the picture two is the walk home."
// A photo number starts a part for that photo or group, at the start of a sentence or after a comma inside one;
// what follows without a number belongs to the same part. Words said before the first number stay ordinary text.
const ZH: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

function zhNum(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  if (s.length === 1) return ZH[s] ?? NaN;
  if (s[0] === '十') return 10 + (ZH[s[1]] ?? 0);              // 十二
  if (s[1] === '十') return ZH[s[0]] * 10 + (ZH[s[2]] ?? 0);   // 二十, 二十三
  return NaN;
}
function enNum(s: string): number {
  s = s.toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  const i = EN.indexOf(s);
  return i >= 0 ? i : ORD.indexOf(s) > 0 ? ORD.indexOf(s) : NaN;
}

const NZ = '([零一二两三四五六七八九十\\d]{1,3})';
const PZ = '(?:照片|图片|相片|图)';
const TO = '\\s*(?:到|至|～|~|-|—)\\s*';
const NE = `(\\d+|${EN.slice(1).sort((a, b) => b.length - a.length).join('|')})`;
const PE = '(?:pictures|picture|photos|photo|images|image|pics|pic|numbers|number|no\\.)';
const OE = `(${ORD.slice(1).join('|')})`;
/* each pattern captures the first number and, for a range, the last; `start` ones only open a sentence */
const PATTERNS: { re: RegExp; num: (s: string) => number; start?: boolean }[] = [
  { re: new RegExp(`^${PZ}?\\s*第?${NZ}(?:号|张)?${TO}第?${NZ}\\s*(?:号|张)${PZ}?`), num: zhNum },   // 三到六号, 照片三到六号
  { re: new RegExp(`^${PZ}\\s*第?${NZ}${TO}第?${NZ}`), num: zhNum },                              // 照片三到六
  { re: new RegExp(`^${PZ}?\\s*第${NZ}\\s*(?:号|张)${PZ}?`), num: zhNum },                         // 第一张, 照片第二张
  { re: new RegExp(`^${PZ}?\\s*${NZ}\\s*号${PZ}?`), num: zhNum },                                  // 一号, 一号照片
  { re: new RegExp(`^${NZ}\\s*张(?=\\s*(?:是|就是|呢|：|:))`), num: zhNum },                        // 一张是…
  { re: new RegExp(`^${PZ}\\s*第?${NZ}(?![零一二两三四五六七八九十\\d])`), num: zhNum },          // 照片一, 图 2
  { re: new RegExp(`^(?:the\\s+)?${PE}\\s*(?:number\\s+)?${NE}\\b(?:\\s*(?:to|through|-|and)\\s*${NE}\\b)?`, 'i'), num: enNum },   // picture one, photos two to four
  { re: new RegExp(`^(?:the\\s+)?${OE}\\s+(?:pictures?|photos?|images?|pics?)\\b`, 'i'), num: enNum },                            // the second picture
  { re: new RegExp(`^(?:the\\s+)?${OE}\\s+one\\b`, 'i'), num: enNum, start: true },                                               // the first one
];
const LEAD = /^(?:[\s，,。.]+|(?:okay|ok|so|and|then|well|um|uh|now|also|but)\b[\s，,]*|(?:然后|还有|接着|另外|嗯|那么)[\s，,]*)*/i;
const LINK = /^\s*(?:is|are|was|were|shows?|是|就是|呢)?[\s，,：:]*/i;
const TAIL = /(?:[\s，,；;：:]+|\b(?:okay|ok|so|and|then|well|um|uh|now|also|but)\b|然后|还有|接着|另外|嗯|那么)*$/i;
const CJK = /[㐀-鿿]/;

/* a photo number at position p of a sentence: where it ends (with "is"/"是" after it), and the photos it names */
function refAt(s: string, p: number): { from: number; to: number; end: number } | null {
  const lead = s.slice(p).match(LEAD)?.[0] ?? '';
  const q = s.slice(p + lead.length);
  for (const { re, num, start } of PATTERNS) {
    if (start && p > 0) continue;
    const m = q.match(re);
    if (!m) continue;
    const a = num(m[1]), b = m[2] ? num(m[2]) : a;
    if (!(a > 0 && b >= a)) continue;
    const link = q.slice(m[0].length).match(LINK)?.[0] ?? '';
    return { from: a, to: b, end: p + lead.length + m[0].length + link.length };
  }
  return null;
}

/* where a sentence names a photo at its start, return [from, to] (1-based) and the sentence without the number */
export function reference(sentence: string): { from: number; to: number; rest: string } | null {
  const r = refAt(sentence, 0);
  return r && { from: r.from, to: r.to, rest: sentence.slice(r.end) };
}

export const sentences = (text: string): string[] => text.match(/[^。！？!?.]+[。！？!?.]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
const join = (a: string, b: string): string => (!a ? b : !b ? a : a + (CJK.test(a.slice(-1) + b[0]) ? '' : ' ') + b);   // Chinese joins without a space
/* words cut off before a photo number mid-sentence lose the "and, okay," that led into it and get a full stop */
function close(s: string): string {
  const t = s.replace(TAIL, '');
  return !t || /[。！？!?.]$/.test(t) ? t : t + (CJK.test(t) ? '。' : '.');
}

/* split a tidied recording into the parts for each photo or group; count is how many photos the day has */
type Part = { unit: { idx: number[] }; text: string };
export function match(text: string, count: number): { before: string; parts: Part[]; unsaid: number[] } {
  let before = '';
  const parts: Part[] = [];
  const add = (s: string) => {
    if (!s) return;
    const prev = parts[parts.length - 1];
    if (!prev) { before = join(before, s); return; }
    prev.text = join(prev.text, prev.text || CJK.test(s[0]) ? s : s.charAt(0).toUpperCase() + s.slice(1));
  };
  for (const s of sentences(text)) {
    let i = 0;
    const starts = [0, ...[...s.matchAll(/[，,；;：:]\s*/g)].map((m) => (m.index ?? 0) + m[0].length)];
    for (const p of starts) {
      if (p < i) continue;
      const r = refAt(s, p);
      if (!r || r.to > count) continue;
      add(p > 0 ? close(s.slice(i, p)) : s.slice(i, p));
      parts.push({ unit: { idx: Array.from({ length: r.to - r.from + 1 }, (_, k) => r.from - 1 + k) }, text: '' });
      i = r.end;
    }
    add(s.slice(i));
  }
  const said = new Set(parts.flatMap((p) => p.unit.idx));
  const unsaid = Array.from({ length: count }, (_, k) => k).filter((k) => !said.has(k));
  return { before, parts: parts.filter((p) => p.text), unsaid };
}
