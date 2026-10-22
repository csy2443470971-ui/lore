// List Together AI's serverless chat models with their prices (USD per 1M tokens), cheapest first.
import { togetherKey } from './keys.mjs';
const r = await fetch('https://api.together.xyz/v1/models', { headers: { Authorization: `Bearer ${togetherKey()}` } });
if (!r.ok) { console.error('models request failed', r.status); process.exit(1); }
const all = await r.json();
const chat = all.filter((m) => m.type === 'chat' && m.pricing && (m.pricing.input > 0 || m.pricing.output > 0))
  .map((m) => ({ id: m.id, in: m.pricing.input, out: m.pricing.output, ctx: m.context_length }))
  .sort((a, b) => a.in + a.out - (b.in + b.out));
for (const m of chat.slice(0, Number(process.argv[2] || 45))) console.log(`${m.in.toFixed(2).padStart(5)}  ${m.out.toFixed(2).padStart(5)}  ${String(m.ctx).padStart(7)}  ${m.id}`);
console.log('total chat models with prices:', chat.length);
