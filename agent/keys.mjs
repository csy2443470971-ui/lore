// API keys are read from where they already live; they are never printed or written anywhere.
import fs from 'node:fs';
export function togetherKey() {
  if (process.env.TOGETHER_API_KEY) return process.env.TOGETHER_API_KEY;
  const f = '/Users/chensiying/Documents/HTML/Many Minds/engine/.env.local';
  const m = fs.readFileSync(f, 'utf8').match(/^\s*(?:export\s+)?TOGETHER_API_KEY\s*=\s*["']?([^"'\n]+)["']?/m);
  if (!m) throw new Error('TOGETHER_API_KEY not found');
  return m[1].trim();
}
