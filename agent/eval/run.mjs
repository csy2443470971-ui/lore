// Compare models on the fix-the-stutter node.
//   node eval/run.mjs                 all models
//   node eval/run.mjs qwen haiku      only models whose name contains one of these
// A case passes when every "keep" phrase survives, every "drop" phrase is gone, and the checks in clean.mjs find nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, rules, tidy, viaClaude, viaTogether } from '../clean.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPEAT = Number(process.env.REPEAT || 1);
const cases = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8')).flatMap((c) => Array.from({ length: REPEAT }, () => c));

// price in USD per 1M tokens (input, output): Together's catalog and Anthropic's price list, October 2026
const OFF = { reasoning: { enabled: false } };     // thinking off, where the model allows it
const MODELS = [
  { name: 'rules (no API)', run: async (t) => ({ text: rules(t), inTok: 0, outTok: 0, ms: 0 }), price: [0, 0] },
  { name: 'deepseek-ai/DeepSeek-V4-Flash-0731', price: [0.14, 0.28], opts: OFF },
  { name: 'nvidia/NVIDIA-Nemotron-3.5-Super-VL', price: [0.15, 0.50], opts: OFF },
  { name: 'Qwen/Qwen3.8-Flash', price: [0.15, 0.47], opts: { ...OFF, stream: true, stream_options: { include_usage: true } } },
  { name: 'deepseek-ai/DeepSeek-V4.1-Flash', price: [0.30, 1.20], opts: OFF },
  { name: 'claude-haiku-5-5', price: [0.10, 0.50], claude: true },
  { name: 'claude-opus-5-5', price: [4.00, 20.00], claude: true },
];

const want = process.argv.slice(2).map((s) => s.toLowerCase());
const models = MODELS.filter((m) => !want.length || want.some((w) => m.name.toLowerCase().includes(w)));
const norm = (s) => s.replace(/[\s，,。.、！!？?；;：:]+/g, '').toLowerCase();   // compare words, not punctuation
const has = (out, phrase) => norm(out).includes(norm(phrase));

async function one(m, c) {
  const raw = m.run ?? (m.claude ? (t) => viaClaude(m.name, t) : (t) => viaTogether(m.name, t, m.opts));
  const call = m.run ? raw : (t) => tidy(t, raw);   // models run as the whole node: sweep, checks, retry, fallback
  try {
    const r = await call(c.in);
    const keepMiss = c.keep.filter((k) => !has(r.text, k));
    const dropLeft = c.drop.filter((d) => has(r.text, d));
    const issues = check(c.in, r.text);
    return { id: c.id, lang: c.lang, via: r.via, out: r.text, keepMiss, dropLeft, issues, pass: !keepMiss.length && !dropLeft.length && !issues.length, ...r };
  } catch (e) {
    return { id: c.id, lang: c.lang, error: e.message, pass: false, inTok: 0, outTok: 0, ms: 0 };
  }
}

async function runModel(m) {
  const res = [];
  for (let i = 0; i < cases.length; i += 4) res.push(...(await Promise.all(cases.slice(i, i + 4).map((c) => one(m, c)))));
  return res;
}

const all = await Promise.all(models.map(async (m) => [m, await runModel(m)]));
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
fs.mkdirSync(path.join(here, '..', 'results'), { recursive: true });
fs.writeFileSync(path.join(here, '..', 'results', `${stamp}.raw.json`), JSON.stringify(all.map(([m, r]) => ({ model: m.name, results: r })), null, 1));

const median = (a) => { const s = a.filter((x) => x > 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const rows = all.map(([m, r]) => {
  const n = r.length, pass = r.filter((x) => x.pass).length, errs = r.filter((x) => x.error).length, fell = r.filter((x) => x.via === 'rules').length, retried = r.filter((x) => x.via === 'retry').length;
  const by = (l) => { const s = r.filter((x) => x.lang === l); return `${s.filter((x) => x.pass).length}/${s.length}`; };
  const cost = r.reduce((a, x) => a + (x.inTok * m.price[0] + x.outTok * m.price[1]) / 1e6, 0) / n * 1000;
  return { model: m.name, pass, n, zh: by('zh'), en: by('en'), mix: by('mix'), keepMiss: r.filter((x) => x.keepMiss?.length).length, dropLeft: r.filter((x) => x.dropLeft?.length).length, flagged: r.filter((x) => x.issues?.length).length, errs, retried, fell, ms: median(r.map((x) => x.ms)), cost };
}).sort((a, b) => b.pass - a.pass || a.cost - b.cost);

let md = `| Model | Pass | 中文 | English | Mixed | Lost words | Filler left | Retried | Fell back to rules | Errors | Median ms | USD per 1,000 recordings |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const x of rows) md += `| ${x.model} | ${x.pass}/${x.n} | ${x.zh} | ${x.en} | ${x.mix} | ${x.keepMiss} | ${x.dropLeft} | ${x.retried} | ${x.fell} | ${x.errs} | ${x.ms} | ${x.cost.toFixed(4)} |\n`;
fs.writeFileSync(path.join(here, '..', 'results', `${stamp}.md`), md);
console.log(md);
