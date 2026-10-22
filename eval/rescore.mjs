// Rescore saved end-to-end results with matching that ignores accents and writes numbers one way (7 = seven = 七).
import fs from 'node:fs';
const [file] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const cases = Object.fromEntries(JSON.parse(fs.readFileSync(new URL('./cases.json', import.meta.url), 'utf8')).map((c) => [c.id, c]));
const EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const ZH = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const zhNum = (s) => s.replace(/([一二两三四五六七八九])?十([一二三四五六七八九])?/g, (m, a, b) => String((a ? ZH[a] : 1) * 10 + (b ? ZH[b] : 0))).replace(/[一二两三四五六七八九](?=[点号张次分个])/g, (m) => String(ZH[m]));
const norm = (s) => zhNum(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(\w+)\b/g, (w) => (EN.indexOf(w) >= 0 ? String(EN.indexOf(w)) : w))).replace(/[\s，,。.、！!？?；;：:]+/g, '');
const has = (out, p) => norm(out).includes(norm(p));
for (const [name, rows] of Object.entries(raw)) {
  const ok = rows.filter((r) => !r.error).filter((r) => { const c = cases[r.id]; return c.keep.every((p) => has(r.final, p)) && !c.drop.some((p) => has(r.final, p)); });
  const bad = rows.filter((r) => !r.error && !ok.includes(r)).map((r) => r.id);
  console.log(`${name.padEnd(46)} ${String(ok.length).padStart(2)}/24   still failing: ${bad.join(', ') || '—'}`);
}
