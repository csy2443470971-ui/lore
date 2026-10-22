// Premium: the layout director. One structured call reads the day's tidied words and the photos,
// and returns a layout spec; code checks it and the app renders it with the same flowing-text engine.
// The model never rewrites the text: the title must come from the writer's own words, and the quote must
// appear in the text exactly, or it is dropped.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { fileURLToPath } from 'node:url';

export const Spec = z.object({
  title: z.string().describe('at most six words, taken from the writer\'s own phrases'),
  template: z.enum(['magazine', 'big-photo', 'one-line', 'timeline']),
  quote: z.string().nullable().describe('one sentence copied exactly from the text, or null'),
  hero: z.number().int().nullable().describe('the 1-based number of the photo the day is about, or null'),
  photos: z.array(z.object({ photo: z.number().int(), size: z.enum(['small', 'medium', 'large']) })),
});

const SYSTEM = `You lay out one page of a personal journal. You receive the day's text, already in the writer's own words, and the day's photos with what was said about each.

Choose:
- title: at most six words, made only of words the writer used. No new adjectives.
- template: magazine (text with photo clusters), big-photo (one photo across the top), one-line (one sentence large, one photo), timeline (in the order things happened).
- quote: the one sentence that best holds the day, copied exactly from the text, or null.
- hero: the photo the day is about, or null if no photo stands out.
- photos: a size for each photo; give large to at most one.

Never rewrite or add to the text.`;

const client = new Anthropic();

export async function direct(day, model = 'claude-haiku-5-5') {
  const body = [
    `Text:\n${day.text}`,
    `Photos:\n${day.photos.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
  ].join('\n\n');
  const res = await client.messages.parse({
    model, max_tokens: 1000, system: SYSTEM,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: body }],
    output_config: { effort: 'low', format: zodOutputFormat(Spec) },
  });
  if (res.stop_reason === 'refusal' || !res.parsed_output) throw new Error('no layout spec');
  return { spec: validate(res.parsed_output, day), usage: res.usage };
}

/* code has the last word: anything that is not the writer's own falls back to a safe default */
export function validate(spec, day) {
  const n = day.photos.length, words = new Set(day.text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
  const own = (s) => (s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).every((w) => words.has(w) || /[㐀-鿿]/.test(w) && day.text.includes(w));
  const quote = spec.quote && day.text.includes(spec.quote.trim()) ? spec.quote.trim() : null;
  const hero = spec.hero && spec.hero >= 1 && spec.hero <= n ? spec.hero : null;
  let large = 0;
  const photos = Array.from({ length: n }, (_, i) => {
    const s = spec.photos.find((p) => p.photo === i + 1)?.size ?? 'medium';
    return { photo: i + 1, size: s === 'large' && large++ ? 'medium' : s };
  });
  return {
    title: own(spec.title) ? spec.title.trim() : null,          // null: the app uses the date
    template: spec.template === 'one-line' && !quote ? 'magazine' : spec.template,
    quote, hero, photos,
  };
}

// node director.mjs   runs the sample day from the app
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const day = {
    text: 'So today I went to that café by the lake, and it was honestly so good. Then I walked to the bridge right at sunset. The café by the lake, the window seat was free. An oat latte with a heart in the foam. Sunset at the bridge, the lake turned orange-pink. The osmanthus is out, the whole street smells of it. That bowl of noodles at lunch, great broth. Hotpot with Lin until nearly midnight.',
    photos: ['the café by the lake, the window seat was free', 'an oat latte with a heart in the foam', 'sunset at the bridge, the lake turned orange-pink', 'the osmanthus is out', 'that bowl of noodles at lunch', 'hotpot with Lin until nearly midnight'],
  };
  const t0 = Date.now();
  const { spec, usage } = await direct(day);
  console.log(JSON.stringify(spec, null, 1));
  console.log(`${Date.now() - t0} ms, ${usage.input_tokens} in / ${usage.output_tokens} out, about $${((usage.input_tokens * 0.1 + usage.output_tokens * 0.5) / 1e6).toFixed(5)}`);
}
