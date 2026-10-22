// The fix-the-stutter node: one cheap model call per recording, then checks in code.
// It removes fillers, stutters, false starts and taken-back words, adds punctuation, and changes nothing else.
import Anthropic from '@anthropic-ai/sdk';
import { togetherKey } from './keys.mjs';
import { SYSTEM, messages } from './core.mjs';
export * from './core.mjs';

/* ── callers ─────────────────────────────────────────────────────────────── */
const strip = (s) => s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();

export async function viaTogether(model, text, opts = {}) {
  const t0 = Date.now();
  const { maxTokens = 1200, ...extra } = opts;
  const r = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${togetherKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, max_tokens: maxTokens, messages: [{ role: 'system', content: SYSTEM }, ...messages(text)], ...extra }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  if (extra.stream) {
    // server-sent events: add up the text, and read the usage from the last chunk that has it
    let out = '', usage = {};
    for (const line of (await r.text()).split('\n')) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
      const j = JSON.parse(line.slice(6));
      out += j.choices?.[0]?.delta?.content ?? '';
      if (j.usage) usage = j.usage;
    }
    return { text: strip(out), inTok: usage.prompt_tokens ?? 0, outTok: usage.completion_tokens ?? 0, ms: Date.now() - t0 };
  }
  const j = await r.json();
  return { text: strip(j.choices[0].message.content || ''), inTok: j.usage?.prompt_tokens ?? 0, outTok: j.usage?.completion_tokens ?? 0, ms: Date.now() - t0 };
}

const claude = new Anthropic();
export async function viaClaude(model, text) {
  const t0 = Date.now();
  // Haiku 5.5 allows thinking off at effort high or below; Opus 5.5 always thinks, so it runs at low effort
  const thinking = model === 'claude-haiku-5-5' ? { thinking: { type: 'disabled' } } : {};
  const res = await claude.messages.create({
    model, max_tokens: 2000, system: SYSTEM, messages: messages(text),
    output_config: { effort: 'low' }, ...thinking,
  });
  if (res.stop_reason === 'refusal') throw new Error('refusal');
  const out = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return { text: out, inTok: res.usage.input_tokens, outTok: res.usage.output_tokens, ms: Date.now() - t0 };
}

