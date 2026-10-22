/* What happened in a day: photos picked, groups made, and what was said. */
/* file: the photo's path inside Documents, once it has been copied out of the picker's cache */
export type Pic = { uri?: string; asset?: number; file?: string };
export type Unit = { idx: number[] };            // one photo, or a group of photos (indices into the picked list)
/* spoken: the sentence as said ("one is the café…"); text: the same words without the number, used as the caption */
export type Part = { unit: Unit; text: string; spoken?: string };
/* audio: the recording the words came from, kept on the phone */
export type Said = { kind: 'talk'; text: string; audio?: string } | { kind: 'photos'; parts: Part[] };
/* placed: photos dragged from the tray onto the page; moved: where a photo on the page was dragged to, by its key */
export type Placed = { id: string; idx: number[] };
export type Pos = { x: number; y: number };
export type Day = { photos: Pic[]; groups: number[][]; said: Said[]; laid: number; placed?: Placed[]; moved?: Record<string, Pos> };

/* photos in order, with each group standing where its first photo was */
export function unitsOf(count: number, groups: number[][]): Unit[] {
  const inGroup = new Map<number, number[]>();
  groups.forEach((g) => g.forEach((i) => inGroup.set(i, g)));
  const out: Unit[] = [];
  const seen = new Set<number[]>();
  for (let i = 0; i < count; i++) {
    const g = inGroup.get(i);
    if (!g) { out.push({ idx: [i] }); continue; }
    if (!seen.has(g)) { seen.add(g); out.push({ idx: g.slice().sort((a, b) => a - b) }); }
  }
  return out;
}

/* take some photos out of a day, keeping groups and what was said pointing at the right ones */
export function removePhotos(d: Day, gone: number[]): Day {
  const drop = new Set(gone);
  const map = new Map<number, number>();
  let n = 0;
  d.photos.forEach((_, i) => { if (!drop.has(i)) map.set(i, n++); });
  const re = (idx: number[]) => idx.filter((i) => map.has(i)).map((i) => map.get(i)!);
  return {
    ...d,
    photos: d.photos.filter((_, i) => !drop.has(i)),
    groups: d.groups.map(re).filter((g) => g.length > 1),
    said: d.said.map((x) => (x.kind === 'photos' ? { ...x, parts: x.parts.map((p) => ({ ...p, unit: { idx: re(p.unit.idx) } })) } : x)),
    placed: d.placed?.map((p) => ({ ...p, idx: re(p.idx) })).filter((p) => p.idx.length),
  };
}
