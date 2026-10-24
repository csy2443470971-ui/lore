// The time-heading node on its test set: each model runs every case REPEAT times (default 2).
// A run passes when the headings fall on exactly the wanted sentences and each contains the wanted word.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viaTogether } from '../clean.mjs';
import { sections } from '../sections.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(fs.readFileSync(path.join(here, 'sections-cases.json'), 'utf8'));
const REPEAT = Number(process.env.REPEAT ?? 2);
const json = { type: 'json_object' };
const MODELS = [
  { name: 'DeepSeek V4.1 Flash 1017 (thinking off)', price: [0.30, 1.20], call: (p) => viaTogether('deepseek-ai/DeepSeek-V4.1-Flash-1017', '', { reasoning: { enabled: false }, response_format: json, prompt: p }) },
  { name: 'DeepSeek V4.1 Flash (thinking off)', price: [0.30, 1.20], call: (p) => viaTogether('deepseek-ai/DeepSeek-V4.1-Flash', '', { reasoning: { enabled: false }, response_format: json, prompt: p }) },
];
let md = '| Model | Passed | Fell back to rules | Median ms | USD per 1,000 days | Failed cases |\n|---|---|---|---|---|---|\n';
const raw = {};
for (const m of MODELS) {
  let pass = 0, n = 0, rules = 0, cost = 0; const ms = [], fails = []; raw[m.name] = [];
  for (let rep = 0; rep < REPEAT; rep++) {
    await Promise.all(cases.map(async (c) => {
      const r = await sections(c.sentences, m.call);
      n++; if (r.via === 'rules') rules++;
      cost += ((r.inTok ?? 0) * m.price[0] + (r.outTok ?? 0) * m.price[1]) / 1e6; if (r.ms) ms.push(r.ms);
      const ok = r.sections.length === c.want.length && c.want.every(([i, w], k) => r.sections[k].sentence === i && r.sections[k].heading.toLowerCase().includes(w.toLowerCase()));
      if (ok) pass++; else fails.push(c.id);
      raw[m.name].push({ id: c.id, via: r.via, got: r.sections, ok });
    }));
  }
  ms.sort((a, b) => a - b);
  md += `| ${m.name} | ${pass}/${n} | ${rules} | ${ms[Math.floor(ms.length / 2)] ?? 0} | ${((cost / n) * 1000).toFixed(3)} | ${[...new Set(fails)].join(', ') || '—'} |\n`;
}
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
fs.writeFileSync(path.join(here, '..', 'results', `sections-${stamp}.md`), md);
fs.writeFileSync(path.join(here, '..', 'results', `sections-${stamp}.raw.json`), JSON.stringify(raw, null, 1));
console.log(md);
