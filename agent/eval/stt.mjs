// End to end: audio → transcription → fix-the-stutter (DeepSeek V4 Flash) → final text, for each transcription option.
//   node eval/stt.mjs            all options
//   node eval/stt.mjs gemini     only options whose name contains one of these
// Audio is eval/audio/<case>.m4a, made from cases.json with the Mac's system voices (clean speech, so a ranking, not a final verdict).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, tidy, viaTogether } from '../clean.mjs';
import { togetherKey } from '../keys.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8'));
const env = fs.readFileSync('/Users/chensiying/Documents/HTML/Many Minds/engine/.env.local', 'utf8');
const key = (k) => (env.match(new RegExp(`^\\s*(?:export\\s+)?${k}\\s*=\\s*["']?([^"'\\n]+)`, 'm')) || [])[1]?.trim();

const HINT = '普通话日记，常夹杂英文单词。Mandarin journal with English words mixed in.';
const VERBATIM = 'Transcribe this audio verbatim, including filler words such as 嗯, 那个, um. Write Chinese in simplified characters and keep English words in English. Output only the transcript.';
const ONEPASS = 'Listen to this spoken journal entry and write it down as tidy text: remove filler sounds and pause words (um, uh, like, you know, 嗯, 呃, 那个/就是/然后 used as pauses), stutters, false starts, and the part the speaker took back when correcting themselves. Keep every other word exactly as said, in the same order: slang, tone particles, hedges, emphasis repeats like 绝了绝了, names and numbers. Chinese in simplified characters; English words stay English, never translated. Add punctuation. Output only the text.';

async function multipart(url, auth, fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/mp4' }), path.basename(file));
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${auth}` }, body: fd });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 160)}`);
  return JSON.parse(t).text;
}
async function gemini(model, prompt, file) {
  const body = { contents: [{ parts: [{ inline_data: { mime_type: 'audio/mp4', data: fs.readFileSync(file).toString('base64') } }, { text: prompt }] }], generationConfig: { temperature: 0 } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key('GEMINI_API_KEY')}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 160)}`);
  return { text: (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim(), usage: j.usageMetadata };
}

// perMin: USD per audio minute; tokens: USD per 1M (input, output) when billed by tokens
const OPTIONS = [
  { name: 'together whisper-large-v3', perMin: 0.0015, run: (f) => multipart('https://api.together.xyz/v1/audio/transcriptions', togetherKey(), { model: 'openai/whisper-large-v3' }, f) },
  { name: 'together deepgram nova-3-multi', perMin: 0.0015, run: (f) => multipart('https://api.together.xyz/v1/audio/transcriptions', togetherKey(), { model: 'deepgram/nova-3-multi' }, f) },
  { name: 'openai gpt-4o-mini-transcribe', perMin: 0.003, run: (f) => multipart('https://api.openai.com/v1/audio/transcriptions', key('OPENAI_API_KEY'), { model: 'gpt-4o-mini-transcribe', prompt: HINT }, f) },
  { name: 'openai gpt-transcribe', perMin: 0.0045, run: (f) => multipart('https://api.openai.com/v1/audio/transcriptions', key('OPENAI_API_KEY'), { model: 'gpt-transcribe', prompt: HINT }, f) },
  { name: 'gemini 3.5-transcribe', tokens: [2.0, 12.0], run: (f) => gemini('gemini-3.5-transcribe', VERBATIM, f) },
  { name: 'gemini 3.5-flash-lite', tokens: [0.30, 2.50], run: (f) => gemini('gemini-3.5-flash-lite', VERBATIM, f) },
  { name: 'gemini 3.5-flash-lite one pass (no tidy step)', tokens: [0.30, 2.50], onepass: true, run: (f) => gemini('gemini-3.5-flash-lite', ONEPASS, f) },
];

/* mixed error rate: Chinese characters and English words as tokens, fillers and punctuation ignored */
const FILL = new Set(['嗯', '呃', '啊', 'um', 'umm', 'uh', 'erm']);
const toks = (s) => (s.toLowerCase().match(/[㐀-鿿]|[a-z][a-z'’&]*|\d+/g) ?? []).filter((x) => !FILL.has(x));
function mer(ref, hyp) {
  const a = toks(ref), b = toks(hyp);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return { err: d[a.length][b.length], n: a.length };
}
const latinKept = (ref, hyp) => { const w = [...new Set((ref.match(/[A-Za-z][A-Za-z'’&]*/g) ?? []).map((x) => x.toLowerCase()).filter((x) => !FILL.has(x)))]; const h = hyp.toLowerCase(); return [w.filter((x) => h.includes(x)).length, w.length]; };
const norm = (s) => s.replace(/[\s，,。.、！!？?；;：:]+/g, '').toLowerCase();
const has = (out, p) => norm(out).includes(norm(p));
const tidyCall = (t) => viaTogether('deepseek-ai/DeepSeek-V4-Flash-0731', t, { reasoning: { enabled: false } });

const want = process.argv.slice(2).map((s) => s.toLowerCase());
const opts = OPTIONS.filter((o) => !want.length || want.some((w) => o.name.includes(w)));
const secs = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

const rows = [];
const raw = {};
for (const o of opts) {
  let err = 0, n = 0, kept = 0, latin = 0, pass = 0, cost = 0, mins = 0, fails = 0;
  const ms = [];
  raw[o.name] = [];
  for (let i = 0; i < cases.length; i += 4) {
    await Promise.all(cases.slice(i, i + 4).map(async (c) => {
      const f = path.join(here, 'audio', `${c.id}.m4a`);
      const m = secs(f) / 60; mins += m;
      const t0 = Date.now();
      try {
        const r = await o.run(f);
        const text = typeof r === 'string' ? r : r.text;
        if (o.perMin) cost += o.perMin * m;
        else cost += ((r.usage?.promptTokenCount ?? 0) * o.tokens[0] + ((r.usage?.candidatesTokenCount ?? 0) + (r.usage?.thoughtsTokenCount ?? 0)) * o.tokens[1]) / 1e6;
        const e = mer(c.in, text); err += e.err; n += e.n;
        const [k, l] = latinKept(c.in, text); kept += k; latin += l;
        const final = o.onepass ? { text } : await tidy(text, tidyCall);
        if (!o.onepass) cost += ((final.inTok ?? 0) * 0.14 + (final.outTok ?? 0) * 0.28) / 1e6;
        ms.push(Date.now() - t0);
        const ok = c.keep.every((p) => has(final.text, p)) && !c.drop.some((p) => has(final.text, p)) && !check(c.in, final.text).length;
        if (ok) pass++;
        raw[o.name].push({ id: c.id, transcript: text, final: final.text, ok });
      } catch (e) { fails++; raw[o.name].push({ id: c.id, error: e.message }); }
    }));
  }
  ms.sort((a, b) => a - b);
  rows.push({ name: o.name, mer: n ? err / n : 1, latin: latin ? kept / latin : 0, pass, fails, perMin: mins ? cost / mins : 0, ms: ms[Math.floor(ms.length / 2)] ?? 0 });
  console.error('done', o.name);
}
rows.sort((a, b) => b.pass - a.pass || a.perMin - b.perMin);
let md = `| Transcription | Raw MER (lower is better) | English words kept | Final text passes (of ${cases.length}) | Failed calls | Median ms, both steps | USD per minute, both steps |\n|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.name} | ${(r.mer * 100).toFixed(1)}% | ${(r.latin * 100).toFixed(0)}% | ${r.pass} | ${r.fails} | ${r.ms} | ${r.perMin.toFixed(4)} |\n`;
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
fs.writeFileSync(path.join(here, '..', 'results', `stt-${stamp}.md`), md);
fs.writeFileSync(path.join(here, '..', 'results', `stt-${stamp}.raw.json`), JSON.stringify(raw, null, 1));
console.log(md);
