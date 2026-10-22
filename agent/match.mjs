// Match what was said to the photos, by the numbers the speaker used. Pure code, no API.
//   "一号是湖边那家咖啡馆。三到六号是回家的路上。"   "Number one is the café… Numbers three to six are the walk home."
// Each sentence that starts with a number (or a range) begins a part for that photo or group; sentences after it
// without a number belong to the same part. Words said before the first number are kept as ordinary text.
const ZH = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

function zhNum(s) {
  if (/^\d+$/.test(s)) return Number(s);
  if (s.length === 1) return ZH[s] ?? NaN;
  if (s[0] === '十') return 10 + (ZH[s[1]] ?? 0);              // 十二
  if (s[1] === '十') return ZH[s[0]] * 10 + (ZH[s[2]] ?? 0);   // 二十, 二十三
  return NaN;
}
function enNum(s) {
  s = s.toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  const i = EN.indexOf(s);
  return i >= 0 ? i : ORD.indexOf(s) > 0 ? ORD.indexOf(s) : NaN;
}

const N_ZH = '[零一二两三四五六七八九十\\d]{1,3}';
const RE_ZH = new RegExp(`^(?:第)?(${N_ZH})(?:号|张)?\\s*(?:到|至|～|~|-|—)\\s*(${N_ZH})\\s*(?:号|张)|^(?:第)?(${N_ZH})\\s*(?:号|张)`);
const RE_EN = /^(?:(?:the\s+)?(?:number|numbers|no\.?|photo|photos|pic|pics)\s+)(\w+)(?:\s*(?:to|through|-|and)\s*(\w+))?|^(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:one|photo|pic)/i;
const LEAD = /^[\s，,。.]*(?:then|and|so|然后|还有|接着)?[\s，,]*/i;
const LINK = /^\s*(?:is|are|was|were|shows?|是|就是|呢)?[\s，,：:]*/i;

/* where a sentence names a photo, return [from, to] (1-based) and the sentence without the number */
export function reference(sentence) {
  const s = sentence.replace(LEAD, '');
  let m = s.match(RE_ZH);
  if (m) {
    const a = zhNum(m[1] ?? m[3]), b = m[2] ? zhNum(m[2]) : a;
    if (a > 0 && b >= a) return { from: a, to: b, rest: s.slice(m[0].length).replace(LINK, '') };
  }
  m = s.match(RE_EN);
  if (m) {
    const a = enNum(m[1] ?? m[3]), b = m[2] ? enNum(m[2]) : a;
    if (a > 0 && b >= a) return { from: a, to: b, rest: s.slice(m[0].length).replace(LINK, '') };
  }
  return null;
}

const sentences = (text) => text.match(/[^。！？!?.]+[。！？!?.]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [];

/* split a tidied recording into the parts for each photo or group; count is how many photos the day has */
export function match(text, count) {
  const before = [], parts = [];
  for (const s of sentences(text)) {
    const ref = reference(s);
    if (ref && ref.to <= count) {
      const idx = Array.from({ length: ref.to - ref.from + 1 }, (_, i) => ref.from - 1 + i);
      const cap = ref.rest.charAt(0).toUpperCase() + ref.rest.slice(1);
      parts.push({ unit: { idx }, text: /[㐀-鿿]/.test(cap) ? ref.rest : cap });
    } else if (parts.length) {
      const prev = parts[parts.length - 1];
      prev.text += (/[\u3400-\u9fff]/.test(prev.text + s) ? '' : ' ') + s;   // Chinese joins without a space
    } else {
      before.push(s);
    }
  }
  const said = new Set(parts.flatMap((p) => p.unit.idx));
  const unsaid = Array.from({ length: count }, (_, i) => i).filter((i) => !said.has(i));
  return { before: before.join(' '), parts, unsaid };
}
