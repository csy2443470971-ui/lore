/* Names. Speech recognition can't know how the people in someone's life spell their names (小林 or 小琳, Kashish or
   Cashish). A name is remembered with the ways it was heard wrong: from then on it goes to both recognisers as a hint,
   the tidying model is told to keep it exactly, and anything heard the old wrong way is written the right way. */
export type Name = { name: string; heard: string[] };

/* the words written the right way: every way a name was heard wrong (two characters or more) becomes the name */
export function applyNames(text: string, names: Name[]): string {
  let out = text;
  for (const n of names) for (const h of n.heard) if (h && h !== n.name && h.trim().length >= 2) out = out.split(h).join(n.name);
  return out;
}

/* the names as one hint for speech recognition */
export const vocabulary = (names: Name[]) => (names.length ? `人名 Names: ${names.map((n) => n.name).join('、')}` : '');

/* A name chosen in an edited text (the selection, from start to end) and how it read before the edit: the edit's one
   changed stretch is found from both ends, so a selection over it maps back to the words it replaced. */
export function nameFrom(before: string, after: string, start: number, end: number): Name | null {
  const name = after.slice(start, end).trim();
  if (!name || name.length > 24) return null;
  let a = 0;
  while (a < before.length && a < after.length && before[a] === after[a]) a++;
  let b = 0;
  while (b < before.length - a && b < after.length - a && before[before.length - 1 - b] === after[after.length - 1 - b]) b++;
  const map = (i: number, edge: 'start' | 'end') => (i <= a ? i : i >= after.length - b ? i + before.length - after.length : edge === 'start' ? a : before.length - b);
  const heard = before.slice(map(start, 'start'), map(end, 'end')).trim();
  return { name, heard: heard && heard !== name ? [heard] : [] };
}

/* The stretch just retyped (one change, widened to whole words in Latin script), so a name corrected by typing over it
   is offered without selecting it again. A single Chinese character changed (小林 → 小琳) is not offered: what the
   whole name is can't be told from it, so that one is selected by hand. */
export function retyped(before: string, after: string): { start: number; end: number } | null {
  if (before === after) return null;
  let a = 0;
  while (a < before.length && a < after.length && before[a] === after[a]) a++;
  let b = 0;
  while (b < before.length - a && b < after.length - a && before[before.length - 1 - b] === after[after.length - 1 - b]) b++;
  let s = a, e = after.length - b;
  const w = /[A-Za-z'’-]/;
  while (s > 0 && w.test(after[s - 1])) s--;
  while (e < after.length && w.test(after[e])) e++;
  const word = after.slice(s, e).trim();
  if (word.length < 2 || word.length > 24 || /[\n,，。.!?！？、；;：:]/.test(word)) return null;
  return { start: s, end: e };
}

/* a name added to the list: one already there keeps its spelling and gains the new way it was heard */
export function addName(list: Name[], n: Name): Name[] {
  const i = list.findIndex((x) => x.name === n.name);
  if (i < 0) return [...list, n];
  return list.map((x, j) => (j === i ? { ...x, heard: [...new Set([...x.heard, ...n.heard])] } : x));
}
