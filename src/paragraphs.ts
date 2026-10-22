/* How the words of a day are cut into paragraphs at Lay out. Recordings are the raw material, but a paragraph is
   about the right length to read, not one per recording:
   - a paragraph should run about 3 to 6 lines on the phone, 7 at most;
   - a recording longer than 7 lines is cut between sentences, preferably where the speaker turns to a new subject
     (the backend marks those), otherwise where the paragraph has reached about 4½ lines;
   - one under 2 lines joins the paragraph after it (or else before it) when nothing stands between them, no time
     heading and no photos, and the two together still fit in 7 lines. A new subject only takes a very short one;
   - one that can't join anything stays short, which is fine now and then.
   Joined recordings keep their audio, so the voice bar still plays them all. */
import { sentences } from './match';
import { Said } from './session';

const LINE = 24;                                  // about 24 Chinese characters, or 48 English letters, fill a line
const MIN = 2 * LINE, AIM = 4.5 * LINE, MAX = 7 * LINE;
const CJK = /[㐀-鿿]/;

/* the room a text takes, in Chinese characters (an English letter is half of one) */
const units = (s: string) => (s.match(/[㐀-鿿]/g)?.length ?? 0) + 0.5 * s.replace(/[㐀-鿿\s]/g, '').length;
export const join = (ss: string[]) => ss.reduce((a, s) => (!a ? s : !s ? a : a + (CJK.test(a.slice(-1) + s[0]) ? '' : ' ') + s), '');

type Talk = Extract<Said, { kind: 'talk' }>;
const recsOf = (x: Talk) => [...(x.audio ? [{ audio: x.audio, at: x.at, secs: x.secs }] : []), ...(x.more ?? [])];

/* breaks: the sentences that start a new subject */
export function shape(list: Said[], breaks: Set<string>): Said[] {
  /* too long: cut between sentences */
  const cut = list.flatMap((x): Said[] => {
    if (x.kind !== 'talk' || units(x.text) <= MAX) return [x];
    const out: string[][] = [[]];
    let acc = 0;
    for (const s of sentences(x.text)) {
      const u = units(s);
      if (out[out.length - 1].length && (acc + u > MAX || (acc >= AIM && breaks.has(s)) || (acc >= MIN * 1.5 && breaks.has(s)))) { out.push([]); acc = 0; }
      out[out.length - 1].push(s);
      acc += u;
    }
    if (out.length > 1 && units(join(out[out.length - 1])) < MIN) { const last = out.pop()!; out[out.length - 1].push(...last); }
    return out.map((ss, k): Said => (k === 0 ? { ...x, text: join(ss) } : { kind: 'talk', text: join(ss), g: x.g }));
  });
  /* too short: join the paragraph after it, or else the one before */
  const out: Said[] = [];
  const fits = (a: Talk, b: Talk) => units(a.text) + units(b.text) <= MAX;
  const merge = (a: Talk, b: Talk): Talk => ({ ...a, text: join([a.text, b.text]), g: !!a.g && !!b.g, more: [...(a.more ?? []), ...recsOf(b)] });
  for (const x of cut) {
    const prev = out[out.length - 1];
    if (x.kind === 'talk' && prev?.kind === 'talk' && fits(prev, x)) {
      const fresh = breaks.has(sentences(x.text)[0] ?? '');
      const short = units(prev.text) < MIN || units(x.text) < MIN;
      if (short && (!fresh || units(prev.text) < LINE || units(x.text) < LINE)) { out[out.length - 1] = merge(prev, x); continue; }
    }
    out.push(x);
  }
  return out;
}
