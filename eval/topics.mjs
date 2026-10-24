// The topic-break node on entries that really came out of the app. A run passes when every wanted break is marked and
// none of the forbidden ones is (a break before a sentence that only continues the thought before it). REPEAT runs each.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viaTogether } from '../clean.mjs';
import { topics } from '../sections.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(fs.readFileSync(path.join(here, 'topics-cases.json'), 'utf8'));
const REPEAT = Number(process.env.REPEAT ?? 5);
const call = (p) => viaTogether('deepseek-ai/DeepSeek-V4.1-Flash-1017', '', { reasoning: { enabled: false }, response_format: { type: 'json_object' }, prompt: p });
let total = 0, ok = 0;
for (const c of cases) {
  const runs = await Promise.all(Array.from({ length: REPEAT }, () => topics(c.sentences, call)));
  let pass = 0;
  const seen = runs.map((r) => {
    const good = c.require.every((n) => r.breaks.includes(n)) && !c.forbid.some((n) => r.breaks.includes(n));
    if (good) pass++;
    return JSON.stringify(r.breaks) + (good ? '' : ' ✗');
  });
  total += REPEAT; ok += pass;
  console.log(`${c.id.padEnd(12)} ${pass}/${REPEAT}   ${seen.join('  ')}`);
}
console.log(`\nall: ${ok}/${total}`);
