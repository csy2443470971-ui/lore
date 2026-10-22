// Which cheap Together models answer serverless, and does turning thinking off work?
import { togetherKey } from './keys.mjs';
const C = ['Qwen/Qwen2.5-7B-Instruct-Turbo', 'mistralai/Mistral-Small-24B-Instruct-2501', 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
  'openai/gpt-oss-120b', 'google/gemma-4-31B-it', 'Qwen/Qwen3-Next-80B-A3B-Instruct', 'nvidia/NVIDIA-Nemotron-Nano-9B-v2',
  'deepseek-ai/DeepSeek-V4.1-Flash', 'MiniMaxAI/MiniMax-M2.7', 'Qwen/Qwen3-VL-8B-Instruct', 'Qwen/Qwen3.5-9B', 'zai-org/GLM-5.3-Flash',
  'deepseek-ai/DeepSeek-V4-Flash-0731', 'Qwen/Qwen3.8-Flash', 'nvidia/NVIDIA-Nemotron-3.5-Super-VL', 'zai-org/GLM-4.5-Air-FP8'];
const body = (model, extra) => JSON.stringify({ model, max_tokens: 60, temperature: 0, messages: [{ role: 'user', content: 'Reply with exactly: ok 好' }], ...extra });
async function call(model, extra) {
  const r = await fetch('https://api.together.xyz/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${togetherKey()}`, 'Content-Type': 'application/json' }, body: body(model, extra) });
  const t = await r.text();
  if (!r.ok) return `ERR ${r.status} ${t.slice(0, 90)}`;
  if (extra?.stream) return 'stream ok';
  const j = JSON.parse(t); const m = j.choices[0].message;
  return `content=${JSON.stringify((m.content || '').slice(0, 40))} reasoning=${(m.reasoning || m.reasoning_content || '').length} out=${j.usage?.completion_tokens}`;
}
for (const m of C) {
  const a = await call(m, {});
  const b = a.startsWith('ERR') && a.includes('stream') ? await call(m, { stream: true }) : await call(m, { chat_template_kwargs: { enable_thinking: false } });
  const c = await call(m, { reasoning: { enabled: false } });
  console.log(m.padEnd(44), '|', a, '|', b, '|', c);
}
