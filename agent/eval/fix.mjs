// The fix-the-mishearing node on its test set: each model runs every case REPEAT times (default 2).
//   node eval/fix.mjs              all models
//   node eval/fix.mjs deepseek     only models whose name contains one of these
// A run passes when every "must" phrase is in the result, no "mustNot" phrase is, an "unchanged" case comes back
// unchanged (punctuation and spacing aside), no "atMost" phrase appears more often than allowed, and the checks in code accept it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viaClaude, viaTogether } from '../clean.mjs';
import { fix } from '../fix.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(fs.readFileSync(path.join(here, 'fix-cases.json'), 'utf8'));
const REPEAT = Number(process.env.REPEAT ?? 2);
// USD per 1M tokens (input, output)
const MODELS = [
  { name: 'DeepSeek V4.1 Flash 1017 (thinking off)', price: [0.30, 1.20], call: (p) => viaTogether('deepseek-ai/DeepSeek-V4.1-Flash-1017', '', { reasoning: { enabled: false }, prompt: p }) },
  { name: 'DeepSeek V4.1 Flash (thinking off)', price: [0.30, 1.20], call: (p) => viaTogether('deepseek-ai/DeepSeek-V4.1-Flash', '', { reasoning: { enabled: false }, prompt: p }) },
  { name: 'Claude Haiku 5.5 (thinking off)', price: [0.10, 0.50], call: (p) => viaClaude('claude-haiku-5-5', '', { prompt: p }) },
];
const norm = (s) => s.replace(/[\s，,。.、！!？?；;：:'"“”‘’]+/g, '').toLowerCase();
const want = process.argv.slice(2).map((s) => s.toLowerCase());
const rows = [], raw = {};
for (const m of MODELS.filter((x) => !want.length || want.some((w) => x.name.toLowerCase().includes(w)))) {
  let pass = 0, n = 0, cost = 0, kept = 0;
  const ms = [], fails = [];
  raw[m.name] = [];
  for (let rep = 0; rep < REPEAT; rep++) {
    await Promise.all(cases.map(async (c) => {
      const r = await fix(c.in, m.call, c.grammar);
      n++; if (r.via === 'kept') kept++;
      cost += ((r.inTok ?? 0) * m.price[0] + (r.outTok ?? 0) * m.price[1]) / 1e6;
      if (r.ms) ms.push(r.ms);
      const out = r.text;
      const ok = (c.must ?? []).every((p) => norm(out).includes(norm(p))) && !(c.mustNot ?? []).some((p) => norm(out).includes(norm(p)))
        && (!c.unchanged || norm(out) === norm(c.in))
        && Object.entries(c.atMost ?? {}).every(([p, k]) => out.split(p).length - 1 <= k) && (!c.must?.length || r.via !== 'kept' || !c.mustNot?.length);
      if (ok) pass++; else fails.push(c.id);
      raw[m.name].push({ id: c.id, rep, via: r.via, out, ok });
    }));
  }
  ms.sort((a, b) => a - b);
  rows.push({ name: m.name, pass, n, kept, ms: ms[Math.floor(ms.length / 2)] ?? 0, per1k: (cost / n) * 1000, fails: [...new Set(fails)] });
  console.error('done', m.name);
}
let md = `| Model | Passed | Checks rejected twice (text kept) | Median ms | USD per 1,000 recordings | Failed cases |\n|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.name} | ${r.pass}/${r.n} | ${r.kept} | ${r.ms} | ${r.per1k.toFixed(3)} | ${r.fails.join(', ') || '—'} |\n`;
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
fs.writeFileSync(path.join(here, '..', 'results', `fix-${stamp}.md`), md);
fs.writeFileSync(path.join(here, '..', 'results', `fix-${stamp}.raw.json`), JSON.stringify(raw, null, 1));
console.log(md);
