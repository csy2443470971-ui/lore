import type { Pin } from './places';

/* What happened in a day: photos picked, groups made, and what was said. */
/* file: the photo's path inside Documents, once it has been copied out of the picker's cache; r: its height over its width */
/* orig: the photo as it was before marks or stickers were set into it, to go back to */
/* video: a video, whose picture (uri, file) is its first frame, shown wherever a photo would be, with a play mark */
/* pin: not a photo at all but a place put on the page (it is drawn as a card or a chip, and moves like a photo) */
export type Pic = { uri?: string; asset?: number; file?: string; r?: number; orig?: { uri?: string; asset?: number; file?: string; r?: number }; video?: { uri?: string; file?: string; secs?: number }; pin?: Pin };
export type Unit = { idx: number[] };            // one photo, or a group of photos (indices into the picked list)
/* spoken: the sentence as said ("one is the café…"); text: the same words without the number, used as the caption */
export type Part = { unit: Unit; text: string; spoken?: string };
/* audio: the recording the words came from, kept on the phone; at: when it started (ms); secs: how long it was;
   g: the words have had the grammar fix, or were edited by hand. A head is a time-of-day heading added at Lay out. */
/* more: recordings joined into this paragraph from short ones after it */
type Rec = { audio?: string; at?: number; secs?: number; g?: boolean; more?: { audio: string; at?: number; secs?: number }[] };
/* paper: a photo of a page written by hand, with the words read from it (or none, when the person chose not to read it).
   A head with a day starts that day on a page that runs over several days; it stays when the page is laid out again */
export type Said = ({ kind: 'talk'; text: string } & Rec) | ({ kind: 'photos'; parts: Part[]; paper?: boolean } & Rec) | { kind: 'head'; text: string; day?: string };
/* placed: photos dragged from the tray onto the page; moved: where a photo on the page was dragged to, by its key */
/* a place put on the page has no photos (idx is empty) and its pin instead */
export type Placed = { id: string; idx: number[]; pin?: Pin };
/* p, k: the paragraph a photo belongs to and the line it starts on; y is only for positions saved before that;
   w: the width it was pinched to */
/* b, o: instead of beside a paragraph, in a row between two paragraphs (b: the paragraph it comes before, o: its order
   among the photos there, up to three to a row) */
export type Pos = { x: number; y: number; p?: number; k?: number; w?: number; b?: number; o?: number; off?: boolean };   // off: taken off the page (it stays among the thumbnails)
/* a sticker on the page: s is one from the set ('set:<name>') or one made from a photo ('file:<path inside Documents>');
   it sits over the words (they don't move for it), y down from the top of paragraph p, x from the left; w its width,
   r its tilt in degrees. p = -1: just put on the page at y from the top, not yet tied to a paragraph */
/* wrap: the words go around its outline (the default for a new one); without it, it sits on top of them */
export type Sticker = { id: string; s: string; p: number; x: number; y: number; w: number; r: number; wrap?: boolean };
/* span: a page written over several days (the key is r-<first day>) */
export type Day = { photos: Pic[]; groups: number[][]; said: Said[]; laid: number; placed?: Placed[]; moved?: Record<string, Pos>;
  stickers?: Sticker[]; span?: { from: string; to: string };
  title?: string; place?: string };   // a title the person gave the page; where it was written

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
    placed: d.placed?.map((p) => ({ ...p, idx: re(p.idx) })).filter((p) => p.idx.length || p.pin),
  };
}
