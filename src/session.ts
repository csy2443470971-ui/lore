/* What happened in this session: photos picked, groups made, and what was said. */
export type Pic = { uri?: string; asset?: number };
export type Unit = { idx: number[] };            // one photo, or a group of photos (indices into the picked list)
export type Said = { kind: 'talk'; text: string } | { kind: 'photos'; parts: { unit: Unit; text: string }[] };

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
