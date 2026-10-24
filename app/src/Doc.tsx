import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Re, { SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { hyphenateSync } from 'hyphen/en';
import { Metric, SERIF } from './metrics';
import { Pic, Placed, Pos, Said, Sticker } from './session';
import { stickerSrc } from './stickers';
import { OUTLINES } from './outlines';
import { fileUri } from './store';
import { VideoMark } from './Photos';
import { PinTile, pinSize } from './PlaceBox';
import { F, SZ } from './theme';
import { Text, TextInput, useCn, useS, useT } from './ui';

const src = (p: Pic) => (p.uri ? { uri: p.uri } : p.asset);

function useTx() {
  const t = useT();
  return [d.tx, { color: t.ink }];
}

/* Before layout: only the tidied words, in the order they were said. Photos aren't matched to sentences yet;
   the spoken numbers ("one is…") stay in the text and are matched to photos at Lay out. Tap a recording to edit it. */
export function Stream({ items, onEdit }: { items: Said[]; onEdit?: (i: number, part: number) => void }) {
  const S = useS();
  const tx = useTx();
  const cn = useCn();
  return (
    <View style={{ gap: 16 }}>
      {items.map((x, i) => (x.kind === 'head' || (x.kind === 'talk' && !x.text) ? null : (
        <Text key={i} style={tx} onPress={onEdit && x.kind === 'talk' ? () => onEdit(i, -1) : undefined}>
          {/* a recording that names photos is made of one stretch per photo: each can be tapped on its own to edit it */}
          {x.kind === 'talk' ? mixed(x.text, d.tx.fontSize, cn.body) : x.parts.map((p, j) => (
            <Text key={j} onPress={onEdit ? () => onEdit(i, j) : undefined}>{mixed((j && S.is !== '是' ? ' ' : '') + (p.spoken ?? p.text), d.tx.fontSize, cn.body)}</Text>
          ))}
        </Text>
      )))}
    </View>
  );
}

/* A line of words, set once: it re-renders only when its own words, place or spacing change, so a reflow while a photo
   is dragged redraws just the lines that moved. A Chinese line is one piece (letter-spaced); an English line, a word each. */
type Ink = { fontSize: number; lineHeight: number; color: string; fontFamily: string };
type Tap = (p: number, o: number) => void;
const Chars = React.memo(function Chars({ text, x, y, ls, unit, p, o0, ink, tap, hold }: {
  text: string; x: number; y: number; ls: number; unit: number; p: number; o0: number; ink: Ink; tap: Tap; hold?: (p: number) => void;
}) {
  return (
    <Text numberOfLines={1} ellipsizeMode="clip" onPress={(ev) => tap(p, o0 + Math.max(0, Math.min(text.length - 1, Math.floor(ev.nativeEvent.locationX / unit))))}
      onLongPress={hold ? () => hold(p) : undefined} style={[ink, { position: 'absolute', left: x, top: y, letterSpacing: ls }]}>{text}</Text>
  );
});
const Word = React.memo(function Word({ s, x, y, p, o, ink, lift = 0, tap, hold }: { s: string; x: number; y: number; p: number; o: number; ink: Ink; lift?: number; tap: Tap; hold?: (p: number) => void }) {
  return <Text numberOfLines={1} onPress={() => tap(p, o)} onLongPress={hold ? () => hold(p) : undefined} style={[ink, { position: 'absolute', left: x, top: y + lift }]}>{s}</Text>;
});

/* the outline of a sticker as points, turned with it, x across the page and y from the top of its paragraph; a sticker
   made from a photo has no outline yet, so its square stands in */
function outlineOf(st: { s: string; x: number; y: number; w: number; r: number }) {
  const o = st.s.startsWith('set:') ? OUTLINES[st.s.slice(4)] : undefined, w = st.w;
  const pts: { x: number; y: number }[] = [];
  if (!o) for (const [x, y] of [[0, 0], [w, 0], [w, w], [0, w], [w / 2, 0], [w, w / 2], [w / 2, w], [0, w / 2]]) pts.push({ x, y });
  else {
    const iw = o.a >= 1 ? w : w * o.a, ih = o.a >= 1 ? w / o.a : w, ox = (w - iw) / 2, oy = (w - ih) / 2, n = o.rows.length;
    o.rows.forEach((r, i) => {
      if (!r) return;
      for (const yy of [oy + (ih * i) / n, oy + (ih * (i + 1)) / n]) pts.push({ x: ox + r[0] * iw, y: yy }, { x: ox + r[1] * iw, y: yy });
    });
  }
  const c = Math.cos((st.r * Math.PI) / 180), sn = Math.sin((st.r * Math.PI) / 180);
  return pts.map((pt) => { const dx = pt.x - w / 2, dy = pt.y - w / 2; return { x: st.x + w / 2 + dx * c - dy * sn, y: st.y + w / 2 + dx * sn + dy * c }; });
}

/* The page's paragraphs and photo tiles, keyed as the page keys them ('t<first item>' for a paragraph, the tile's own
   key for a photo or group), for choosing what goes on a share image */
export function pieces(items: Said[], photos: Pic[], placed?: Placed[]) {
  const paras: { key: string; text: string }[] = [];
  const tiles: { key: string; pics: Pic[] }[] = [];
  items.forEach((x, i) => {
    if (x.kind === 'head') return;
    if (x.kind === 'talk') { if (x.text) paras.push({ key: `t${i}`, text: x.text }); return; }
    x.parts.forEach((p, j) => { const pics = p.unit.idx.map((k) => photos[k]).filter(Boolean); if (pics.length) tiles.push({ key: `${i}-${j}`, pics }); });
    let text = '';
    for (const p of x.parts) { if (text && p.text && !CJK.test(text.slice(-1) + p.text[0])) text += ' '; text += p.text; }
    if (text) paras.push({ key: `t${i}`, text });
  });
  for (const pl of placed ?? []) { const pics = pl.idx.map((k) => photos[k]).filter(Boolean); if (pics.length) tiles.push({ key: pl.id, pics }); }
  return { paras, tiles };
}

/* ---------- flowing text: lines are broken in JS around the photos, one paragraph at a time ---------- */
type Rect = { x: number; y: number; w: number; h: number };
type Tok = { s: string; o: number };              // a word or a Chinese character, and where it starts in its paragraph
type Line = { x: number; y: number; w: number; p: number; toks: Tok[]; last: boolean };   // w: the width of the gap it fills
/* where a photo, or a set of photos, sits: beside paragraph p, from its line k down, n lines tall */
type Spot = { key: string; x: number; w: number; p: number; k: number; n: number };

const PAD = 9;                                    // the space between a photo and the words, the same on every side
const HEADW = 150;                                // the room a paragraph's heading and time (or voice bar) need beside a photo

/* Diary text is set by script, whatever language the app itself is in: Chinese characters and Chinese punctuation in
   the chosen Chinese face, everything else (English, numbers) in Newsreader, a little larger so the two read as one
   size. The same words look the same with the app in Chinese or in English. */
const CJK_ANY = /[⺀-鿿豈-﫿　-〿＀-￯]/;
export const isCJK = (s: string) => CJK_ANY.test(s);
/* Newsreader sits higher in its line than the Chinese face does: set alone on a line, an English word goes down this much
   so the two share a baseline */
const LATIN_DROP = 1.5;
export const LATIN = 15 / 14;                     // Newsreader's size over the Chinese face's: a little larger, so the two read as one size
/* a stretch of diary text as runs, each in its own face, for a Text whose fontSize is the Chinese size */
export function mixed(text: string, size: number, cn: string): React.ReactNode[] {
  return (text.match(/[⺀-鿿豈-﫿　-〿＀-￯]+|[^⺀-鿿豈-﫿　-〿＀-￯]+/g) ?? []).map((r, i) => (
    <Text key={i} style={isCJK(r) ? { fontFamily: cn, fontSize: size } : { fontFamily: F.serif, fontSize: size * LATIN }}>{r}</Text>
  ));
}
/* a Chinese character is a full em wide; everything else is measured from Newsreader's own widths, at its size */
const adv = (m: Metric, size: number, s: string) => {
  let w = 0;
  for (const ch of s) w += CJK.test(ch) || /[　-〿＀-￯]/.test(ch) ? size : (m.w[ch.codePointAt(0)!] ?? m.def) / m.upm * size * LATIN;
  return w;
};
/* Chinese breaks between any two characters, other scripts between words */
const tokens = (s: string) => s.match(/[⺀-鿿豈-﫿　-〿＀-￯]|[^\s⺀-鿿豈-﫿　-〿＀-￯]+\s*|\s+/g) ?? [];
const CJK = /[㐀-鿿]/;
const NO_START = /^[，。、！？；：）」』”’》,.!?;:)\]]/;

/* where an English word may break with a hyphen (TeX's patterns), keeping at least three letters on each side */
const breaks = new Map<string, number[]>();
function cuts(word: string): number[] {
  if (!breaks.has(word)) {
    const parts = hyphenateSync(word, { hyphenChar: '|' }).split('|');
    const at: number[] = [];
    let c = 0;
    for (const p of parts.slice(0, -1)) { c += p.length; if (c >= 3 && word.length - c >= 3) at.push(c); }
    breaks.set(word, at);
  }
  return breaks.get(word)!;
}

/* A photo belongs to one paragraph and covers whole lines, so its edges sit PAD from the ink of the lines above and below,
   as they do from the words beside it; when it is taller than its words, the next paragraph goes on beside it. */
/* heads: room kept above each paragraph for its time heading and voice bar; tops: where that room starts */
/* indents: how far the first line of each paragraph starts in (0 when first-line indent is off) */
/* a sticker the words go around: the points of its outline, turned as it is, x across the page and y down from the top
   of the paragraph it is tied to; it changes only the lines of that paragraph and the ones after it */
type Float = { p: number; pts: { x: number; y: number }[] };
function flow(paras: string[], spots: Spot[], width: number, m: Metric, size: number, lh: number, gap: number, heads: number[] = [], indents: number[] = [], floats: Float[] = [], rowsAt: number[] = [], sections: boolean[] = []) {
  const e = PAD - (lh - size) / 2;                // how far a photo's edge sits inside its first and last line
  const minSeg = size * 4;                        // a gap beside a photo narrower than this stays empty
  const lines: Line[] = [], starts: number[] = [], rows: number[] = [], tops: number[] = [];
  /* bottoms: where each paragraph's words and photos end; rowTops: where the photos between a paragraph and the one
     before it start (rowsAt: how much room they take, the gap after them included) */
  const bottoms: number[] = [], rowTops: number[] = [];
  const headX: number[] = [];                     // where each paragraph's heading and time start (past a photo on the left)
  const rects: Record<string, Rect> = {};
  let y = 0;
  /* photos that reach below the end of their own paragraph: the next paragraphs' words go on around them, so a photo
     never leaves an empty space beside it */
  let hanging: { sp: Spot; y0: number; y1: number }[] = [];
  paras.forEach((para, pi) => {
    /* a row of photos, or a new part of the day, goes below any photo hanging from above: photos reach across paragraphs,
       never across parts of the day */
    if (rowsAt[pi] || sections[pi]) { for (const o of hanging) y = Math.max(y, o.y1 - e + gap); hanging = []; }
    rowTops[pi] = y; y += rowsAt[pi] ?? 0;
    /* A photo hanging on the left: the heading and time start just past it, with the words, which go on beside it. When
       it would sit beside fewer than two of the words' lines, or leave too little room for the heading, the paragraph
       starts below it instead, so a heading is never set off from its own words. */
    let hx = 0;
    const left = hanging.filter((o) => o.sp.x < width / 2 && o.y1 > y);
    if (left.length) {
      const low = Math.max(...left.map((o) => o.y1)), text = y + (heads[pi] ?? 0);
      hx = Math.max(...left.map((o) => o.sp.x + o.sp.w + PAD));
      const crowded = hanging.some((o) => o.sp.x >= width / 2 && o.y1 > y && o.y0 < text && o.sp.x < hx + HEADW);
      if (low - text < 2 * lh || width - hx < HEADW || crowded) { y = Math.max(y, low - e + gap); hx = 0; }
    }
    headX.push(hx);
    tops.push(y);
    const start = y + (heads[pi] ?? 0);
    starts.push(start);
    /* a photo never sits on another: one that would (a photo hanging from above on the same side, or one put there
       before it) goes down to just below it */
    const own: { sp: Spot; y0: number; y1: number }[] = [];
    for (const sp0 of spots.filter((sp) => sp.p === pi)) {
      let k = sp0.k;
      for (let pass = 0; pass < 6; pass++) {
        const y0 = start + k * lh, y1 = y0 + sp0.n * lh;
        const hit = [...hanging, ...own].find((o) => sp0.x < o.sp.x + o.sp.w && sp0.x + sp0.w > o.sp.x && y0 < o.y1 && y1 > o.y0);
        if (!hit) break;
        k = Math.ceil((hit.y1 - start) / lh);
      }
      own.push({ sp: k === sp0.k ? sp0 : { ...sp0, k }, y0: start + k * lh, y1: start + (k + sp0.n) * lh });
    }
    for (const { sp, y0 } of own) rects[sp.key] = { x: sp.x, y: y0 + e, w: sp.w, h: sp.n * lh - 2 * e };
    const beside = [...hanging, ...own];           // the photos these lines go around: its own, and ones hanging from above
    const free = (ly: number) => {
      let segs: [number, number][] = [[0, width]];
      for (const { sp, y0, y1 } of beside) {
        if (y1 <= ly || y0 >= ly + lh) continue;
        const a = sp.x - PAD, b = sp.x + sp.w + PAD;
        /* the words go down the wider side only, so a line never jumps across a photo in the middle */
        segs = segs.flatMap(([s, f]): [number, number][] => {
          if (b <= s || a >= f) return [[s, f]];
          const left: [number, number] = [s, Math.max(s, a)], right: [number, number] = [Math.min(f, b), f];
          return [left[1] - left[0] >= right[1] - right[0] ? left : right];
        });
      }
      let near = false;                            // a sticker cuts this line: only a roomy gap beside it takes words
      for (const fl of floats) {
        if (fl.p > pi) continue;
        let a = Infinity, b = -Infinity;
        /* a little more than the line itself is looked at, so the edge of the words eases around the sticker's shape
           instead of stepping in and out line by line; the words come close to it (6 points), as close as to a photo */
        for (const pt of fl.pts) {
          const yy = tops[fl.p] + pt.y;
          if (yy >= ly - lh * 0.15 && yy <= ly + lh * 1.15) { if (pt.x < a) a = pt.x; if (pt.x > b) b = pt.x; }
        }
        if (a > b) continue;
        near = true;
        a -= 6; b += 6;
        /* the words go down the wider side only, so a line never jumps across the sticker mid-sentence */
        segs = segs.flatMap(([s, f]): [number, number][] => {
          if (b <= s || a >= f) return [[s, f]];
          const left: [number, number] = [s, Math.max(s, a)], right: [number, number] = [Math.min(f, b), f];
          return [left[1] - left[0] >= right[1] - right[0] ? left : right];
        });
      }
      return segs.filter(([s, f]) => f - s >= (near ? size * 4.5 : minSeg));   // a gap beside a sticker takes words as one beside a photo does
    };
    const tk = tokens(para);
    const at: number[] = [];
    let c = 0;
    for (const t of tk) { at.push(c); c += t.length; }
    let i = 0, ly = start;
    const first = lines.length;
    while (i < tk.length && ly < start + 5000 * lh) {
      for (const [s0, f] of free(ly)) {
        while (i < tk.length && /^\s+$/.test(tk[i])) i++;
        if (i >= tk.length) break;
        const s = i === 0 ? s0 + (indents[pi] ?? 0) : s0;
        let acc = 0;
        const from = i;
        while (i < tk.length) {
          const w = adv(m, size, tk[i].trimEnd());
          const hang = NO_START.test(tk[i]) && acc + w <= f - s + size;   // let closing punctuation hang rather than start a line
          if (acc + w > f - s && !hang && i > from) {
            /* the line would be left loose: break the next English word with a hyphen if a piece of it fits */
            const word = tk[i].match(/^[A-Za-z]+/)?.[0] ?? '';
            if (f - s - acc > size * 1.2 && word.length >= 6) {
              const c2 = cuts(word).filter((c) => acc + adv(m, size, word.slice(0, c) + '-') <= f - s).pop();
              if (c2) { tk.splice(i, 1, word.slice(0, c2) + '-', tk[i].slice(c2)); at.splice(i, 1, at[i], at[i] + c2); i++; }
            }
            break;
          }
          if (acc + w > f - s && i === from && f - s < width - 1) break;  // a word too long for a narrow gap: try the next gap
          acc += adv(m, size, tk[i]); i++;
        }
        if (i > from) lines.push({ x: s, y: ly, w: f - s, p: pi, toks: tk.slice(from, i).map((t, j) => ({ s: t, o: at[from + j] })), last: false });
      }
      ly += lh;
    }
    if (lines.length > first) lines[lines.length - 1].last = true;
    rows.push(Math.round((ly - start) / lh));
    bottoms.push(ly);
    y = ly + gap;
    hanging = beside.filter((o) => o.y1 > y);
  });
  if (rowsAt[paras.length]) for (const o of hanging) y = Math.max(y, o.y1 - e + gap);
  rowTops[paras.length] = y; y += rowsAt[paras.length] ?? 0;
  return { lines, starts, rows, rects, tops, bottoms, rowTops, headX, height: Math.max(0, y - gap, ...hanging.map((o) => o.y1)) };
}

/* a photo let go with its top-left at (x, y): its top goes level with the nearest line of words on the page (the
   paragraph and line), and it is the whole number of lines its height rounds to; near an edge it moves to the edge */
function toSpot(key: string, x: number, y: number, w: number, h: number, base: { starts: number[]; rows: number[] }, W: number, lh: number, size: number): Spot {
  const e = PAD - (lh - size) / 2;
  let p = 0, k = 0, best = Infinity;
  base.starts.forEach((st, i) => {
    const kk = Math.max(0, Math.min(Math.max(0, (base.rows[i] ?? 1) - 1), Math.round((y - e - st) / lh)));
    const dd = Math.abs(st + kk * lh + e - y);
    if (dd < best) { best = dd; p = i; k = kk; }
  });
  const sx = x < 30 ? 0 : x > W - w - 30 ? W - w : x;
  return { key, x: Math.max(0, Math.min(W - w, sx)), w, p, k, n: Math.max(2, Math.round((h + 2 * e) / lh)) };
}

/* Photos and stickers are moved by gestures that run on the UI thread (Gesture Handler + Reanimated): what the finger
   holds follows it every frame however busy the words are with reflowing, and the page doesn't scroll under it. */
const SPRING = { damping: 22, stiffness: 260, mass: 0.6 };
/* a second finger anywhere on the page: while one finger holds a photo or sticker, the page lays a clear layer over
   itself, and a second finger on it resizes (and turns) what is held by how far apart the two fingers are */
type Two = { id: string; on: boolean; x1: number; y1: number; x10: number; y10: number; x20: number; y20: number; x2: number; y2: number };
const NO_TWO: Two = { id: '', on: false, x1: 0, y1: 0, x10: 0, y10: 0, x20: 0, y20: 0, x2: 0, y2: 0 };
const spread = (t: Two) => {
  'worklet';
  return Math.hypot(t.x1 - t.x2, t.y1 - t.y2) / Math.max(1, Math.hypot(t.x10 - t.x20, t.y10 - t.y20));
};
const turned = (t: Two) => {
  'worklet';
  return (Math.atan2(t.y2 - t.y1, t.x2 - t.x1) - Math.atan2(t.y20 - t.y10, t.x20 - t.x10)) * 180 / Math.PI;
};

/* a group of photos that fills whatever size its tile has, so it can grow and shrink smoothly */
export function Fluid({ pics }: { pics: Pic[] }) {
  const t = useT();
  const four = pics.length >= 4, list = pics.slice(0, four ? 4 : 2);
  const cell = (p: Pic, i: number) => <Image key={i} source={src(p)} contentFit="cover" style={{ flex: 1 }} />;
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: 8, overflow: 'hidden', gap: 2, backgroundColor: t.gray }]}>
      {four ? [0, 2].map((k) => <View key={k} style={{ flex: 1, flexDirection: 'row', gap: 2 }}>{list.slice(k, k + 2).map(cell)}</View>)
        : <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>{list.map(cell)}</View>}
    </View>
  );
}

/* The shapes a photo is shown in, as height over width: 16:9 and 3:4 across or upright, and square. A photo is shown in
   the shape nearest its own (an upright photo in 3:4 upright, a wide one in 3:4 across), cut to fit; cropping in the
   editor gives it exactly the shape chosen there. */
export const SHAPES = [9 / 16, 3 / 4, 1, 4 / 3, 16 / 9];
export function shapeOf(r?: number) {
  if (!r || !Number.isFinite(r)) return 3 / 4;
  let best = SHAPES[0], d = Infinity;
  for (const s of SHAPES) { const dd = Math.abs(Math.log(r / s)); if (dd < d) { d = dd; best = s; } }
  return best;
}
/* how big a single photo is beside the words: about the same area whatever its shape */
export const soloFor = (r: number, w: number): Rect => {
  const ww = Math.round(Math.max(0.3 * w, Math.min(0.56 * w, Math.sqrt((0.1587 * w * w) / r))));
  return { x: 0, y: 0, w: ww, h: Math.round(ww * r) };
};

/* Photos between two paragraphs sit in rows of up to three, centred: they keep their shapes and the size they had as
   they were carried there, or were given there with two fingers (one height for the row, their sizes' average), smaller
   only when they wouldn't fit across the page. A photo put between two paragraphs never suddenly grows. A place (own)
   keeps its own size and sits on the row's middle. */
const GT = 6;
function rowOf(items: { r: number; w?: number; own?: boolean }[], W: number) {
  const ph = items.filter((x) => !x.own), fixed = items.filter((x) => x.own);
  const fw = fixed.reduce((a, x) => a + (x.w ?? 0), 0), fh = Math.max(0, ...fixed.map((x) => (x.w ?? 0) * x.r));
  const sum = ph.reduce((a, x) => a + 1 / x.r, 0);
  const own = ph.reduce((a, x) => a + (x.w ? x.w * x.r : soloFor(x.r, W).h), 0) / Math.max(1, ph.length);
  const h = ph.length ? Math.round(Math.min(own, (W - fw - GT * (items.length - 1)) / sum)) : Math.round(fh);
  const ws = items.map((x) => Math.round(x.own ? x.w ?? 0 : h / x.r));
  const hs = items.map((x) => (x.own ? Math.min(h, Math.round((x.w ?? 0) * x.r)) : h));
  const total = ws.reduce((a, b) => a + b, 0) + GT * (items.length - 1);
  return { h, ws, hs, x0: Math.round((W - total) / 2) };
}
/* the gap between two paragraphs the finger is in (0 before the first, the count after the last), or -1 when it is on
   the words: the white space between the last line above and the first line below (the heading and time between
   included) */
function boundaryAt(base: { tops: number[]; bottoms: number[]; starts: number[]; rows: number[] }, cy: number, lh: number): number {
  const P = base.bottoms.length;
  let best = -1, bd = Infinity;
  for (let b = 0; b <= P; b++) {
    const lo = b === 0 ? -Infinity : base.bottoms[b - 1] - 3;
    const hi = b === P ? Infinity : base.starts[b] + 2;
    if (cy < lo || cy > hi) continue;
    const mid = ((b === 0 ? (base.tops[0] ?? 0) - 20 : base.bottoms[b - 1]) + (b === P ? (base.bottoms[P - 1] ?? 0) + 20 : base.tops[b])) / 2;
    const dd = Math.abs(cy - mid);
    if (dd < bd) { bd = dd; best = b; }
  }
  return best;
}

/* how long a photo or sticker is held before it moves with the finger: a quick swipe over one scrolls the page instead */
const HOLD = 200;
/* the page scrolled by itself under a held photo (near the top or bottom of the screen): by how much, and which photo */
type Shove = { id: string; dy: number; n: number };

/* One photo (or group) on the page. Held a moment, it moves with the finger right where it is (it doesn't lift); two
   fingers make it bigger or smaller. While it is held the page hears where it is, a few times a frame at most, and makes
   room for it, and the photo takes the size it will have there (its own beside the words, the row's between two
   paragraphs), growing or shrinking around the point the finger holds, so it stays under the finger. Over the gap
   between two paragraphs it goes into the row there at once and sits in it, lined up with the words, until the finger
   moves on. Let go, it settles into the place the words left for it. When the words move it (another photo was dragged, the page was laid out
   again) it glides to its new place. */
const Movable = React.memo(MovableIn, (a, b) => a.id === b.id && a.r.x === b.r.x && a.r.y === b.r.y && a.r.w === b.r.w && a.r.h === b.r.h
  && a.z === b.z && a.W === b.W && a.locked === b.locked && a.block === b.block && a.pk === b.pk && a.grab === b.grab && a.move === b.move && a.drop === b.drop && !!a.open === !!b.open && a.two === b.two && a.shove === b.shove && a.slot === b.slot);
function MovableIn({ id, r, slot, z, W, locked, block, grab, move, drop, open, two, shove, children }: {
  two: SharedValue<Two>; shove: SharedValue<Shove>;
  slot?: boolean;                                  // its place is in a row between two paragraphs
  pk: string;                                      // which photos it shows: it redraws only when these or its place change
  id: string; r: Rect; z: number; W: number; locked?: boolean; block?: React.RefObject<unknown>;
  grab: (id: string) => void; drop: () => void;
  /* where it is held: the finger on the page, the point of the photo it holds (as fractions), the width the person gave
     it, and the finger on the screen (-1 when it didn't move, -2 when it was only resized: it stays where it is) */
  move: (id: string, gx: number, gy: number, fx: number, fy: number, want: number, sy: number, sx: number) => void;
  open?: (id: string) => void;                     // a tap opens the photo full screen
  children: React.ReactNode;
}) {
  const t = useT();
  const x = useSharedValue(r.x), y = useSharedValue(r.y), w = useSharedValue(r.w), h = useSharedValue(r.h);
  const home = useSharedValue(r);                  // where the page keeps it
  const live = useSharedValue(0);                  // the gestures under way, as bits (1 one finger, 2 two)
  /* while it is held: the finger's point on the page, where on the photo it holds it, and the width it has been given */
  const px = useSharedValue(0), py = useSharedValue(0), fx = useSharedValue(0.5), fy = useSharedValue(0.5), want = useSharedValue(r.w);
  const sits = useSharedValue(0);                  // held: 0 under the finger, 1 sitting in its place in a row (and between, on the way)
  const size = useSharedValue({ w: 0, h: 0 });
  const far = useSharedValue({ w: 0, h: 0 });     // its size when a second finger came down elsewhere on the page
  const last = useSharedValue({ x: 0, y: 0, n: 0 });   // the finger's last position and how many fingers were down
  /* the page's handlers reach the gesture through a ref, so a re-render of the page never rebuilds a gesture under way */
  const cb = useRef({ grab, move, drop, open });
  useEffect(() => { cb.current = { grab, move, drop, open }; });
  const onOpen = useCallback((k: string) => cb.current.open?.(k), []);
  const onGrab = useCallback((k: string) => cb.current.grab(k), []);
  const onMove = useCallback((k: string, a: number, b: number, c: number, dd: number, ee: number, ff: number, gg: number) => cb.current.move(k, a, b, c, dd, ee, ff, gg), []);
  const onDrop = useCallback(() => cb.current.drop(), []);
  useEffect(() => {
    const to = { x: r.x, y: r.y, w: r.w, h: r.h };
    home.set(to);
    const held = live.get();
    if (held === 0) { sits.set(0); x.set(withSpring(to.x, SPRING)); y.set(withSpring(to.y, SPRING)); w.set(withSpring(to.w, SPRING)); h.set(withSpring(to.h, SPRING)); return; }
    if (held !== 1 || two.get().on) return;        // two fingers are sizing it
    w.set(withSpring(to.w, SPRING)); h.set(withSpring(to.h, SPRING));   // held by one finger: the size it will land at
    if (slot) {
      /* into the row: from where it is on the screen now */
      if (sits.get() < 0.01) {
        const ww = w.get(), hh = h.get();
        x.set(Math.max(0, Math.min(W - ww, px.get() - fx.get() * ww))); y.set(Math.max(0, py.get() - fy.get() * hh));
      }
      x.set(withSpring(to.x, SPRING)); y.set(withSpring(to.y, SPRING));
      sits.set(withTiming(1, { duration: 160 }));
    } else sits.set(withTiming(0, { duration: 160 }));
  }, [r.x, r.y, r.w, r.h, slot, W, home, live, two, sits, px, py, fx, fy, x, y, w, h]);
  /* eslint-disable react-hooks/refs -- the gesture's callbacks run during a gesture, on the UI thread, never while rendering */
  const gesture = useMemo(() => {
    const report = (sy: number, sx = -1) => {
      'worklet';
      scheduleOnRN(onMove, id, px.get(), py.get(), fx.get(), fy.get(), want.get(), sy, sx);
    };
    /* each gesture marks itself on when it starts and off when it is over in any way (onFinalize always runs, even when a
       gesture is cancelled), so the photo can never be left thinking it is still held. The first one takes hold of the
       photo at the point under the finger(s). */
    const begin = (bit: number, ax: number, ay: number) => {
      'worklet';
      if (live.get() === 0) {
        const ww = w.get(), hh = h.get();
        fx.set(Math.max(0, Math.min(1, ax / ww))); fy.set(Math.max(0, Math.min(1, ay / hh)));
        px.set(x.get() + ax); py.set(y.get() + ay); want.set(home.get().w);
        scheduleOnRN(onGrab, id);
      }
      live.set(live.get() | bit);
      if (two.get().id !== id) two.set({ ...NO_TWO, id });
    };
    const end = (bit: number) => {
      'worklet';
      if (!(live.get() & bit)) return;
      const rest = live.get() & ~bit;
      if (rest !== 0) { live.set(rest); return; }
      if (two.get().id === id) two.set(NO_TWO);
      /* from where it is on the screen now, it settles into its place */
      const ww = w.get(), hh = h.get(), k = sits.get();
      const fl = Math.max(0, Math.min(W - ww, px.get() - fx.get() * ww)), ft = Math.max(0, py.get() - fy.get() * hh);
      x.set(fl + (x.get() - fl) * k); y.set(ft + (y.get() - ft) * k);
      sits.set(0);
      live.set(0);
      scheduleOnRN(onDrop);
      const to = home.get();
      x.set(withSpring(to.x, SPRING)); y.set(withSpring(to.y, SPRING)); w.set(withSpring(to.w, SPRING)); h.set(withSpring(to.h, SPRING));
    };
    /* it moves by how far the fingers moved since the last frame; the frame a finger lands or lifts (when their centre
       jumps) it doesn't move at all, so adding or lifting a finger never makes it jump */
    const pan = Gesture.Pan().enabled(!locked).activateAfterLongPress(HOLD).averageTouches(true)
      .onStart((e) => {
        last.set({ x: e.translationX, y: e.translationY, n: e.numberOfPointers });
        begin(1, e.x, e.y);
        two.set({ ...two.get(), x1: e.absoluteX, y1: e.absoluteY });
      })
      .onUpdate((e) => {
        const l = last.get();
        last.set({ x: e.translationX, y: e.translationY, n: e.numberOfPointers });
        if (two.get().id === id) two.set({ ...two.get(), x1: e.absoluteX, y1: e.absoluteY });
        if (e.numberOfPointers !== l.n) return;
        px.set(px.get() + e.translationX - l.x); py.set(py.get() + e.translationY - l.y);
        report(e.absoluteY, e.absoluteX);
      })
      .onFinalize(() => end(1));
    const pinch = Gesture.Pinch().enabled(!locked)
      .onStart((e) => { begin(2, e.focalX, e.focalY); size.set({ w: w.get(), h: h.get() }); })
      .onUpdate((e) => {
        const s0 = size.get(), nw = Math.max(W * 0.25, Math.min(W, s0.w * e.scale));
        want.set(nw); w.set(nw); h.set(s0.h * nw / s0.w);
        report(-2);                                // a resize: the photo stays where it is
      })
      .onFinalize(() => end(2));
    const tap = Gesture.Tap().maxDuration(600).maxDistance(12).onEnd((_e, ok) => { if (ok) scheduleOnRN(onOpen, id); });
    return Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));
  }, [id, W, locked, onGrab, onMove, onDrop, onOpen, x, y, w, h, home, live, px, py, fx, fy, want, sits, size, last, two]);
  /* a second finger elsewhere on the page: the photo grows or shrinks by how far apart the two fingers are */
  useAnimatedReaction(() => { const tt = two.get(); return tt.on && tt.id === id ? spread(tt) : 0; }, (s) => {
    if (!s) { far.set({ w: 0, h: 0 }); return; }
    if (!far.get().w) far.set({ w: w.get(), h: h.get() });
    const f = far.get(), nw = Math.max(W * 0.25, Math.min(W, f.w * s));
    want.set(nw); w.set(nw); h.set(f.h * nw / f.w);
    scheduleOnRN(onMove, id, px.get(), py.get(), fx.get(), fy.get(), nw, -2, -1);
  }, [id, W]);
  /* the page scrolled by itself under it: it moves down the page as far, so it stays under the finger */
  useAnimatedReaction(() => shove.get(), (s, prev) => {
    if (!prev || s.n === prev.n || s.id !== id || live.get() === 0) return;
    py.set(py.get() + s.dy);
    scheduleOnRN(onMove, id, px.get(), py.get(), fx.get(), fy.get(), want.get(), -1, -1);
  }, [id]);
  /* eslint-enable react-hooks/refs */
  const style = useAnimatedStyle(() => {
    const ww = w.get(), hh = h.get();
    if (live.get() === 0) return { left: x.get(), top: y.get(), width: ww, height: hh };
    const fl = Math.max(0, Math.min(W - ww, px.get() - fx.get() * ww)), ft = Math.max(0, py.get() - fy.get() * hh), k = sits.get();
    return { left: fl + (x.get() - fl) * k, top: ft + (y.get() - ft) * k, width: ww, height: hh };
  });
  return (
    <GestureDetector gesture={gesture}>
      <Re.View style={[{ position: 'absolute', zIndex: z, borderRadius: 8, backgroundColor: t.gray }, style]}>
        {/* the photo itself takes no touches: on the web an <img> would start the browser's own image drag */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>{children}</View>
      </Re.View>
    </GestureDetector>
  );
}

/* a sticker on the page: it sits over the words, as one does on paper, and the words don't move for it. One finger
   moves it, two make it bigger or smaller and turn it; carried onto the bin, it comes off. Let go, its new place is kept.
   One just put on lands with a small bounce. */
type Spot2 = { x: number; y: number; w: number; r: number };
const Stuck = React.memo(StuckIn, (a, b) => a.st === b.st && a.top === b.top && a.W === b.W && a.slap === b.slap && a.locked === b.locked
  && a.bin?.x === b.bin?.x && a.bin?.y === b.bin?.y && a.block === b.block && a.place === b.place && a.carry === b.carry && a.slide === b.slide && a.tap === b.tap && a.two === b.two && a.hold === b.hold);
function StuckIn({ st, top, W, source, slap, locked, bin, block, place, carry, slide, tap, two, hold }: {
  two: SharedValue<Two>; hold?: (id: string | null) => void;
  st: Sticker; top: number; W: number; source: number | { uri: string }; slap: boolean; locked?: boolean;
  bin?: { x: number; y: number };                 // the bin's centre on the screen
  block?: React.RefObject<unknown>;
  place: (id: string, at: Spot2 | null) => void; carry?: (state: 'on' | 'over' | null) => void;
  slide?: (id: string, x: number, y: number, w: number, r: number) => void;   // where it is while held, for the words around it
  tap?: (id: string | null) => void;              // tapped (its switch shows), or picked up (the switch goes)
}) {
  const bx = useSharedValue(st.x), by = useSharedValue(top + st.y), bw = useSharedValue(st.w), br = useSharedValue(st.r);
  const dx = useSharedValue(0), dy = useSharedValue(0), sc = useSharedValue(1), rot = useSharedValue(0);
  const pop = useSharedValue(slap ? 1.7 : 1);
  const id = st.id;
  const live = useSharedValue(0), over = useSharedValue(-1);   // over: -1 not carried yet, 0 carried, 1 over the bin
  const s0 = useSharedValue(1), r0 = useSharedValue(0);
  const binAt = useSharedValue(bin ?? { x: -999, y: -999 });
  const last = useSharedValue({ x: 0, y: 0, n: 0 });
  const wraps = useSharedValue(!!st.wrap);
  useEffect(() => { wraps.set(!!st.wrap); }, [st.wrap, wraps]);
  const cb = useRef({ place, carry, slide, tap, hold });
  useEffect(() => { cb.current = { place, carry, slide, tap, hold }; });
  const onHold = useCallback((k: string | null) => cb.current.hold?.(k), []);
  const far = useSharedValue({ s: 0, r: 0, on: false });   // its scale and turn when a second finger came down elsewhere
  const onPlace = useCallback((id: string, at: Spot2 | null) => cb.current.place(id, at), []);
  const onCarry = useCallback((state: 'on' | 'over' | null) => cb.current.carry?.(state), []);
  const onSlide = useCallback((id: string, x: number, y: number, w: number, r: number) => cb.current.slide?.(id, x, y, w, r), []);
  const onTap = useCallback((id: string | null) => cb.current.tap?.(id), []);
  useEffect(() => { binAt.set(bin ?? { x: -999, y: -999 }); }, [bin, binAt]);
  useEffect(() => {
    if (live.get() === 0) { bx.set(st.x); by.set(top + st.y); bw.set(st.w); br.set(st.r); }
  }, [st.x, st.y, st.w, st.r, top, live, bx, by, bw, br]);
  useEffect(() => {
    if (!slap) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    pop.set(withSpring(1, { damping: 9, stiffness: 320, mass: 0.5 }));
  }, [slap, pop]);
  /* eslint-disable react-hooks/refs -- the gesture's callbacks run during a gesture, on the UI thread, never while rendering */
  const gesture = useMemo(() => {
    const begin = (bit: number) => {
      'worklet';
      if (live.get() === 0) { scheduleOnRN(onTap, null); scheduleOnRN(onHold, id); two.set({ ...NO_TWO, id }); }
      live.set(live.get() | bit);
    };
    /* a sticker the words go around tells the page where it is now, so they move out of its way while it is held */
    const report = () => {
      'worklet';
      if (!wraps.get()) return;
      const w0 = bw.get(), w2 = w0 * sc.get(), cx = bx.get() + w0 / 2 + dx.get(), cy = by.get() + w0 / 2 + dy.get();
      scheduleOnRN(onSlide, id, cx - w2 / 2, cy - w2 / 2, w2, br.get() + rot.get());
    };
    const end = (bit: number) => {
      'worklet';
      if (!(live.get() & bit)) return;              // marked off in onFinalize, which always runs: never left held
      live.set(live.get() & ~bit);
      if (live.get() !== 0) return;
      if (two.get().id === id) two.set(NO_TWO);
      scheduleOnRN(onHold, null);
      if (over.get() >= 0) scheduleOnRN(onCarry, null);
      if (over.get() === 1) { over.set(-1); scheduleOnRN(onPlace, id, null); return; }
      over.set(-1);
      if (!dx.get() && !dy.get() && sc.get() === 1 && !rot.get()) return;
      /* the new place: the same picture on the screen, written down as the sticker's own place */
      const w0 = bw.get(), w2 = Math.max(44, Math.min(W * 0.9, w0 * sc.get()));
      const cx = bx.get() + w0 / 2 + dx.get(), cy = by.get() + w0 / 2 + dy.get();
      const nx = Math.round(cx - w2 / 2), ny = Math.round(cy - w2 / 2), nr = Math.round((br.get() + rot.get()) * 10) / 10;
      bx.set(nx); by.set(ny); bw.set(Math.round(w2)); br.set(nr); dx.set(0); dy.set(0); sc.set(1); rot.set(0);
      scheduleOnRN(onPlace, id, { x: nx, y: ny, w: Math.round(w2), r: nr });
    };
    /* held a moment before it moves, like a photo, so a swipe that starts on it scrolls the page */
    const pan = Gesture.Pan().enabled(!locked).activateAfterLongPress(HOLD).averageTouches(true)
      .onStart((e) => { last.set({ x: e.translationX, y: e.translationY, n: e.numberOfPointers }); begin(1); two.set({ ...two.get(), x1: e.absoluteX, y1: e.absoluteY }); })
      .onUpdate((e) => {
        const l = last.get();
        last.set({ x: e.translationX, y: e.translationY, n: e.numberOfPointers });
        if (two.get().id === id) two.set({ ...two.get(), x1: e.absoluteX, y1: e.absoluteY });
        if (e.numberOfPointers !== l.n) return;      // a finger landed or lifted: no jump
        dx.set(dx.get() + e.translationX - l.x); dy.set(dy.get() + e.translationY - l.y);
        const b = binAt.get(), now = Math.hypot(e.absoluteX - b.x, e.absoluteY - b.y) < 56 ? 1 : 0;
        if (now !== over.get()) { over.set(now); scheduleOnRN(onCarry, now ? 'over' : 'on'); }
        report();
      })
      .onFinalize(() => end(1));
    const pinch = Gesture.Pinch().enabled(!locked)
      .onStart(() => { s0.set(sc.get()); begin(2); })
      .onUpdate((e) => { sc.set(s0.get() * e.scale); report(); })
      .onFinalize(() => end(2));
    const turn = Gesture.Rotation().enabled(!locked)
      .onStart(() => { r0.set(rot.get()); begin(4); })
      .onUpdate((e) => { rot.set(r0.get() + e.rotation * 180 / Math.PI); report(); })
      .onFinalize(() => end(4));
    const touch = Gesture.Tap().enabled(!locked).maxDuration(600).maxDistance(12).onEnd((_e, ok) => { if (ok) scheduleOnRN(onTap, id); });
    return Gesture.Race(touch, Gesture.Simultaneous(pan, pinch, turn));
  }, [id, W, locked, onPlace, onCarry, onSlide, onTap, onHold, bx, by, bw, br, dx, dy, sc, rot, live, over, s0, r0, binAt, last, wraps, two]);
  /* a second finger elsewhere on the page: the sticker grows, shrinks and turns with the two fingers */
  useAnimatedReaction(() => { const t = two.get(); return t.on && t.id === id ? [spread(t), turned(t)] : null; }, (v) => {
    if (!v) { far.set({ s: 0, r: 0, on: false }); return; }
    if (!far.get().on) far.set({ s: sc.get(), r: rot.get(), on: true });
    const f = far.get();
    sc.set(f.s * v[0]); rot.set(f.r + v[1]);
    if (wraps.get()) {
      const w0 = bw.get(), w2 = w0 * sc.get(), cx = bx.get() + w0 / 2 + dx.get(), cy = by.get() + w0 / 2 + dy.get();
      scheduleOnRN(onSlide, id, cx - w2 / 2, cy - w2 / 2, w2, br.get() + rot.get());
    }
  }, [id]);
  /* eslint-enable react-hooks/refs */
  const style = useAnimatedStyle(() => ({
    left: bx.get(), top: by.get(), width: bw.get(), height: bw.get(),
    transform: [{ translateX: dx.get() }, { translateY: dy.get() }, { rotate: `${br.get() + rot.get()}deg` }, { scale: sc.get() * pop.get() }],
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Re.View style={[{ position: 'absolute', zIndex: 4 }, d.stickerShadow, style]}>
        <Image source={source} contentFit="contain" style={StyleSheet.absoluteFill} pointerEvents="none" />
      </Re.View>
    </GestureDetector>
  );
}

/* A paragraph held by a long press: it lifts off the page as a card, and the rest of the page dims. Drag it up or down
   and a red line shows where it would go between the other paragraphs; let go there and it moves. The small glass bar
   under it joins it to the paragraph above or below, shares it, or selects its words (to copy them). A tap on the dim
   page puts it back. */
function Lifted({ text, top, W, ink, p, gaps, up, down, onSlot, onMove, onUp, onDown, onShare, onSelect, onClose }: {
  text: string; top: number; W: number; ink: Ink; up: boolean; down: boolean;
  p: number; gaps: number[];                       // which paragraph it is; where each gap between paragraphs is on the page
  onSlot: (b: number | null) => void; onMove: (b: number) => void;
  onUp: () => void; onDown: () => void; onShare?: () => void; onSelect?: () => void; onClose: () => void;
}) {
  const t = useT();
  const S = useS();
  const ty = useSharedValue(0), pop = useSharedValue(0.97), slot = useSharedValue(-1), grip = useSharedValue(0);
  useEffect(() => {
    pop.set(withSpring(1.025, { damping: 13, stiffness: 240, mass: 0.6 }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [pop]);
  const cb = useRef({ onSlot, onMove });
  useEffect(() => { cb.current = { onSlot, onMove }; });
  const slotJS = useCallback((b: number) => { if (b >= 0) Haptics.selectionAsync().catch(() => {}); cb.current.onSlot(b >= 0 ? b : null); }, []);
  const moveJS = useCallback((b: number) => cb.current.onMove(b), []);
  /* eslint-disable react-hooks/refs -- the gesture's callbacks run during a gesture, never while rendering */
  const drag = useMemo(() => Gesture.Pan().minDistance(4)
    .onStart((e) => { grip.set(e.y); })
    .onUpdate((e) => {
      ty.set(e.translationY);
      /* the gap nearest the finger; the two around the paragraph itself would leave it where it is */
      const at = top - 12 + grip.get() + e.translationY;
      let b = -1, bd = Infinity;
      gaps.forEach((g, i) => { const dd = Math.abs(g - at); if (dd < bd) { bd = dd; b = i; } });
      if (b === p || b === p + 1 || bd > 80) b = -1;
      if (b !== slot.get()) { slot.set(b); scheduleOnRN(slotJS, b); }
    })
    .onEnd(() => {
      const b = slot.get();
      if (b >= 0) scheduleOnRN(moveJS, b);
      else ty.set(withSpring(0, SPRING));
    }), [top, p, gaps, ty, slot, grip, slotJS, moveJS]);
  /* eslint-enable react-hooks/refs */
  const lifted = useAnimatedStyle(() => ({ transform: [{ translateY: ty.get() }, { scale: pop.get() }] }));
  const btn = (label: string, run: () => void, key: string) => (
    <Pressable key={key} onPress={run} style={({ pressed }) => [d.liftBtn, { opacity: pressed ? 0.55 : 1 }]}>
      <Text style={{ fontSize: 13, color: t.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <>
      <Pressable onPress={onClose} style={[d.dim, { backgroundColor: t.b }]} accessibilityLabel={S.cancel} />
      <GestureDetector gesture={drag}>
        <Re.View style={[d.lift, { top: top - 12, width: W + 24 }, lifted]}>
          <View style={[d.liftCard, { backgroundColor: t.panel }]}>
            <Text style={[ink, { textAlign: 'justify' }]}>{mixed(text, ink.fontSize, ink.fontFamily)}</Text>
          </View>
          <View style={[d.liftBar, { borderColor: t.gray, backgroundColor: t.panel + 'B8' }]}>
            <BlurView intensity={40} tint={t.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            {[up ? btn(S.joinUp, onUp, 'up') : null, down ? btn(S.joinDown, onDown, 'down') : null,
              onShare ? btn(S.share, onShare, 'share') : null, onSelect ? btn(S.selectText, onSelect, 'select') : null]}
          </View>
          <Text style={[d.liftHint, { color: t.mut }]}>{S.moveHint}</Text>
        </Re.View>
      </GestureDetector>
    </>
  );
}

/* how a set of photos sits together: one, a pair, one large with two small, or a 2×2 grid; w is the page width */
const G = 4;
function cluster(n: number, w: number): Rect[] {
  if (n === 1) { const a = Math.round(w * 0.46); return [{ x: 0, y: 0, w: a, h: Math.round(a * 0.75) }]; }
  const cw = Math.round(w * 0.56);
  if (n === 2) { const a = (cw - G) / 2; return [{ x: 0, y: 0, w: a, h: a }, { x: a + G, y: 0, w: a, h: a }]; }
  if (n === 3) {
    const big = Math.round((cw - G) * 0.62), sw = cw - G - big, sh = (big - G) / 2;
    return [{ x: 0, y: 0, w: big, h: big }, { x: big + G, y: 0, w: sw, h: sh }, { x: big + G, y: sh + G, w: sw, h: sh }];
  }
  const a = (cw - G) / 2;
  return [0, 1, 2, 3].map((i) => ({ x: (i % 2) * (a + G), y: Math.floor(i / 2) * (a + G), w: a, h: a }));
}

/* After Lay out: the words and photos set as a page, dense like a printed page. The photos from one recording sit
   together beside its paragraph; photos dragged in from the tray sit where they were dropped. Lines are justified, so
   English lines up at both edges like Chinese. Drag any photo and the paragraphs reflow around it; where it ends up
   is kept. A photo carried in from the tray (preview) moves the words before it is let go. Tap a word to edit it. */
type Src = { item: number; part: number; from: number };          // which recording, or which photo's caption, a stretch of a paragraph is
/* what the page offers the screen for a photo carried in from the bottom of the page */
export type PageApi = {
  carry: (c: { x: number; y: number; w: number; h: number; gx: number; gy: number } | null, lift?: number[]) => void;   // top-left, size and the finger over the page, or null when it is gone; lift: the photos carried, which leave their place on the page meanwhile
  landing: () => { at: Pos; rect: Rect } | null;                                // where it would land: the place to keep, and its rectangle on the page
  nudge: (dy: number) => void;                                                  // the page scrolled by itself under a photo held on it
};
export function Page({ items, photos, placed, moved, api, onEdge, onPin, onPreview, onReorder, onRemove, onPhotoBin, voice, indent, onRename, ownTitle, title, meta, area, onDrag, onMove, onEdit, onMerge, onShare, onSelect, onOpen, chosen, onChoose, stickers, slap, bin, onSticker, onStickerDrag, locked, scroll }: {
  items: Said[]; photos: Pic[]; placed?: Placed[]; moved?: Record<string, Pos>; onPin?: (id: string) => void;
  api?: React.MutableRefObject<PageApi | null>;                  // for a photo carried in from the bottom: where it is over the page, and where it would land
  onEdge?: (y: number | null) => void;                           // a photo held on the page: the finger on the screen (so the page can scroll near the edges), null when let go
  onPreview?: (r: (Rect & { row: boolean }) | null) => void;     // where a photo carried in from the bottom would land (on the page), and whether in a row
  voice?: boolean;                                                // voice bars at the top left of what was said (a setting)
  indent?: boolean;                                               // first-line indent (a setting)
  onRename?: (text: string) => void; ownTitle?: string;          // the title is renamed right where it is (empty: the date again)
  title: string; meta: string;
  area?: React.RefObject<View | null>;                           // the text area, for finding where a photo from the tray was dropped
  onDrag: (on: boolean) => void; onMove: (key: string, at: Pos) => void; onEdit: (item: number, part: number) => void;
  /* a long press lifts a paragraph: join it to the one above (the item that starts it) or below, share it, or select its words */
  onMerge?: (item: number) => void; onShare?: (item: number) => void; onSelect?: (text: string) => void;
  onReorder?: (item: number, before: number) => void;            // a paragraph (its item) moved to go before another item (or to the end)
  onRemove?: (key: string) => void;                              // a photo dropped on the bin: off the page
  onPhotoBin?: (state: 'on' | 'over' | null) => void;            // a photo is carried (and over the bin), or let go
  onOpen?: (idx: number[]) => void;                              // a tap on a photo (or group): open it full screen
  chosen?: Set<string>;                                          // choosing what to share: these paragraphs ('t<item>') and photos are marked
  onChoose?: (key: string) => void;                              // while choosing, a tap marks a paragraph or photo instead of editing it
  stickers?: Sticker[]; slap?: string;                           // slap: the sticker just put on, which lands with a little bounce
  onSticker?: (id: string, at: Partial<Sticker> | null) => void;  // a sticker moved, turned, resized, or (null) thrown away
  bin?: { x: number; y: number };                                // where the bin for stickers shows on the screen
  onStickerDrag?: (state: 'on' | 'over' | null) => void;         // a sticker is carried (and over the bin), or let go
  locked?: boolean;                                              // a page only to look at (this week's page): nothing moves
  scroll?: React.RefObject<unknown>;                             // the page's scroll view, which waits while a photo or sticker is held
}) {
  const t = useT();
  const S = useS();
  const W = Dimensions.get('window').width - 2 * SZ.px;     // the page is today itself: no card, the full width
  /* the same size, line height and spacing whatever language the app is in (see isCJK) */
  const size = 14, lh = 21, gap = 17;
  const m = SERIF;
  const cn = useCn();
  const run = (spots: Spot[], rowsAt: number[] = []) => flow(paras, spots, W, m, size, lh, gap, heads,
    paras.map((pa) => (!indent ? 0 : isCJK(pa.trimStart().charAt(0)) ? size * 2 : adv(m, size, 'nnnn'))), floats, rowsAt, marks.map((mk, pi) => !!mk.head && pi > 0));

  /* one paragraph per recording; a recording about photos brings its photos (a group counts as one tile) */
  const paras: string[] = [];
  const srcs: Src[][] = [];
  const sets: { para: number; tiles: { key: string; pics: Pic[] }[]; paper?: 'read' | 'only' }[] = [];
  /* above a paragraph: the time heading before it, and a voice bar where a new stretch of talking starts. Recordings
     belong to one bar while each starts within 20 minutes of the last one ending; a longer break starts a new bar */
  const marks: { head?: string; bar?: Bar; time?: number }[] = [];
  let head: string | undefined, bar: Bar | undefined, open: Bar | undefined, lastEnd = 0;
  const para = (text: string, from: Src[], time?: number) => { paras.push(text); srcs.push(from); marks.push({ head, bar, time }); head = undefined; bar = undefined; };
  items.forEach((x, i) => {
    if (x.kind === 'head') { head = x.text; return; }
    for (const r of voice ? [...(x.audio ? [{ audio: x.audio, at: x.at, secs: x.secs }] : []), ...(x.more ?? [])] : []) {
      if (!open || (r.at && lastEnd && r.at - lastEnd >= 20 * 60 * 1000)) { open = { uris: [], secs: 0, at: r.at }; bar = open; }
      open.uris.push(fileUri(r.audio)); open.secs += r.secs ?? 0;
      if (r.at) lastEnd = r.at + (r.secs ?? 0) * 1000;
    }
    if (x.kind === 'talk') { if (x.text) para(x.text, [{ item: i, part: -1, from: 0 }], x.at); return; }
    const tiles = x.parts.map((p, j) => ({ key: `${i}-${j}`, pics: p.unit.idx.map((k) => photos[k]).filter(Boolean) })).filter((tl) => tl.pics.length);
    const paper = x.paper ? (x.parts.some((p) => p.text) ? 'read' as const : 'only' as const) : undefined;
    for (let c = 0; c < tiles.length; c += 4) sets.push({ para: paras.length, tiles: tiles.slice(c, c + 4), paper });
    let text = '';                                  // captions join with a space, except next to Chinese
    const from = [...x.parts.map((p, j) => {
      if (text && p.text && !CJK.test(text.slice(-1) + p.text[0])) text += ' ';
      const at = { item: i, part: j, from: text.length };
      text += p.text;
      return at;
    })];
    para(text, from, x.at);
  });
  /* above a paragraph: its time heading, then a row with the time it was said and, where a stretch of talking starts, its voice bar */
  /* Three steps of space: lines 21 apart; paragraphs a gap of 17 (with the time each was said above it); a new part of
     the day (its heading) a further 30 above, so the parts read as parts. */
  const HEAD = 30, BAR = 30, TIME = 20, SEC = 30;
  const sec = (mk: { head?: string }, pi: number) => (mk.head && pi > 0 ? SEC : 0);
  const heads = marks.map((mk, pi) => sec(mk, pi) + (mk.head ? HEAD : 0) + (mk.bar ? BAR : mk.time ? TIME : 0));
  /* stickers the words go around; one being moved goes around where the fingers have it now */
  const [slid, setSlid] = useState<Sticker | null>(null);
  const [picked, setPicked] = useState<string | null>(null);     // the sticker tapped: its switch shows
  const floats: Float[] = [...(stickers ?? []).filter((st) => st.wrap && st.p >= 0 && st.id !== slid?.id), ...(slid && slid.p >= 0 && (stickers ?? []).some((st) => st.id === slid.id) ? [slid] : [])]
    .map((st) => ({ p: Math.min(st.p, Math.max(0, paras.length - 1)), pts: outlineOf(st) }));
  const e = PAD - (lh - size) / 2;
  const linesFor = (h: number) => Math.max(2, Math.round((h + 2 * e) / lh));

  /* each set that hasn't been taken apart is one block beside the start of its paragraph (the next set of the same
     paragraph below it), sets alternating right and left; its tiles are stretched to the block's whole lines */
  /* positions changed by the fingers, over the saved ones they were changed from: once the saved ones change (the change
     was kept, or Undo or Lay out again put the photos somewhere else) they no longer count */
  const [liveSt, setLiveSt] = useState<{ of?: Record<string, Pos>; at: Record<string, Pos> }>({ at: {} });
  const live = liveSt.of === moved ? liveSt.at : {};
  const pos: Record<string, Pos> = { ...moved, ...live };
  const movedNow = useRef(moved);
  const posNow = useRef<Record<string, Pos>>({});   // every photo's place as the page shows it now (read in the gesture handlers)
  useEffect(() => { posNow.current = pos; });
  useEffect(() => { movedNow.current = moved; });
  const setLive = useCallback((f: (s: Record<string, Pos>) => Record<string, Pos>) => {
    const of = movedNow.current;
    setLiveSt((st) => ({ of, at: f(st.of === of ? st.at : {}) }));
  }, []);
  const [front, setFront] = useState('');           // the photo picked up last sits above the others
  const two = useSharedValue<Two>(NO_TWO);
  const [holding, setHolding] = useState<string | null>(null);   // a photo or sticker is held: the clear layer for a second finger is down
  const second = useMemo(() => Gesture.Pan().minDistance(0)
    .onStart((e) => { const t = two.get(); two.set({ ...t, on: !!t.id, x10: t.x1, y10: t.y1, x20: e.absoluteX, y20: e.absoluteY, x2: e.absoluteX, y2: e.absoluteY }); })
    .onUpdate((e) => { two.set({ ...two.get(), x2: e.absoluteX, y2: e.absoluteY }); })
    .onFinalize(() => { two.set({ ...two.get(), on: false }); }), [two]);
  useEffect(() => { if (scroll && Platform.OS !== 'web') second.blocksExternalGesture(scroll as never); }, [second, scroll]);
  /* a tapped tile: its photos by number */
  const opener = useRef({ items, placed, onOpen, onPin });
  useEffect(() => { opener.current = { items, placed, onOpen, onPin }; });
  const openTile = useCallback((key: string) => {
    const { items: its, placed: pl, onOpen: go, onPin: pin } = opener.current, m = /^(\d+)-(\d+)$/.exec(key);
    if (pl?.find((p) => p.id === key)?.pin) { pin?.(key); return; }
    const x = m ? its[+m[1]] : undefined;
    const idx = m ? (x?.kind === 'photos' ? x.parts[+m[2]]?.unit.idx ?? [] : []) : pl?.find((p) => p.id === key)?.idx ?? [];
    if (idx.length) go?.(idx);
  }, []);
  type Tile = { key: string; pics: Pic[]; ratio: number };
  const [pv, setPv] = useState<{ r: number } | null>(null);       // a photo carried over the page from the bottom: its shape
  const [away, setAway] = useState<number | null>(null);         // ... and, when it was already on the page, its number: it is lifted off its old place
  const ratioOf = (pics: Pic[]) => (pics[0]?.pin ? pics[0].r ?? 1 : pics.length > 1 ? 1 : shapeOf(pics[0]?.r));   // a place keeps its own shape
  /* Where every photo goes: by default each recording's photos beside its paragraph; a photo that was moved beside the
     paragraph and line it was put at, or in a row between two paragraphs. skip: leave one out (the one held). */
  const assemble = (skip?: string, extra?: Record<string, Pos>) => {
    const at0 = extra ? { ...pos, ...extra } : pos;
    const blocks: { spot: Spot; ch: number; tiles: { key: string; pics: Pic[]; r: Rect }[] }[] = [];
    const singles: { key: string; pics: Pic[]; w: number; h: number; at: Pos }[] = [];
    const betw = new Map<number, (Tile & { o: number; w?: number })[]>();
    const below: Record<number, number> = {};
    const putBetween = (tl: Tile, at: Pos) => {
      const b = Math.max(0, Math.min(at.b ?? 0, paras.length));
      if (!betw.has(b)) betw.set(b, []);
      const pin = tl.pics[0]?.pin;
      betw.get(b)!.push({ ...tl, o: at.o ?? 0, w: at.w ?? (pin ? pinSize(pin, W).w : undefined) });
    };
    const single = (tl: Tile, at: Pos) => {
      const pin = tl.pics[0]?.pin;
      const w = at.w ?? (pin ? pinSize(pin, W).w : soloFor(tl.ratio, W).w);
      singles.push({ key: tl.key, pics: tl.pics, w, h: w * tl.ratio, at });
    };
    sets.forEach((st, n) => {
      const stay: Tile[] = [];
      for (const tl of st.tiles) {
        if (tl.key === skip || (away !== null && tl.pics[0] === photos[away])) continue;
        const at = at0[tl.key];
        if (at?.off) continue;
        const tile = { key: tl.key, pics: tl.pics, ratio: ratioOf(tl.pics) };
        if (!at) stay.push(tile); else if (at.b !== undefined) putBetween(tile, at); else single(tile, at);
      }
      if (!stay.length) return;
      let shape: Rect[];
      if (st.paper && stay.length === 1) {
        const ratio = Math.min(1.5, Math.max(0.6, stay[0].pics[0]?.r ?? 1.33));     // a page of handwriting keeps its own shape
        const pw = Math.round(W * (st.paper === 'only' ? 0.78 : 0.42));
        shape = [{ x: 0, y: 0, w: pw, h: Math.round(pw * ratio) }];
      } else if (stay.length === 1) {
        const sz = soloFor(stay[0].ratio, W);
        shape = [{ x: 0, y: 0, w: sz.w, h: sz.h }];
      } else shape = cluster(stay.length, W);
      const cw = Math.max(...shape.map((r) => r.x + r.w)), ch = Math.max(...shape.map((r) => r.y + r.h));
      const k = below[st.para] ?? 0, rowsN = linesFor(ch);
      below[st.para] = k + rowsN;
      const bx = st.paper === 'only' ? Math.round((W - cw) / 2) : n % 2 ? 0 : W - cw;
      blocks.push({ spot: { key: `set${n}`, x: bx, w: cw, p: st.para, k, n: rowsN }, ch, tiles: stay.map((tl, i) => ({ key: tl.key, pics: tl.pics, r: shape[i] })) });
    });
    for (const pl of placed ?? []) {
      if (pl.id === skip || (pl.idx.length && pl.idx[0] === away)) continue;
      const pics = pl.pin ? [{ pin: pl.pin, r: pinSize(pl.pin, W).r }] : pl.idx.map((k) => photos[k]).filter(Boolean);
      if (!pics.length) continue;
      const at = at0[pl.id] ?? { x: 0, y: 0 };
      const tile = { key: pl.id, pics, ratio: ratioOf(pics) };
      if (at.b !== undefined) putBetween(tile, at); else single(tile, at);
    }
    const pa = skip === 'preview' ? undefined : at0.preview;
    if (pv && pa) {
      const tile = { key: 'preview', pics: [] as Pic[], ratio: pv.r };
      if (pa.b !== undefined) putBetween(tile, pa); else single(tile, pa);
    }
    /* the rows between paragraphs: up to three photos to a row, in their order */
    const brow = new Map<number, { items: (Tile & { o: number; w?: number })[]; h: number; ws: number[]; hs: number[]; x0: number }[]>();
    const rowsAt: number[] = Array(paras.length + 1).fill(0);
    for (const [b, list] of betw) {
      list.sort((a, c) => a.o - c.o);
      const rs = [];
      for (let i = 0; i < list.length; i += 3) { const items = list.slice(i, i + 3); rs.push({ items, ...rowOf(items.map((x) => ({ r: x.ratio, w: x.w, own: !!x.pics[0]?.pin })), W) }); }
      brow.set(b, rs);
      rowsAt[b] = rs.reduce((a, r) => a + r.h, 0) + GT * (rs.length - 1) + gap;
    }
    return { blocks, singles, brow, rowsAt };
  };
  type Assembled = ReturnType<typeof assemble>;
  /* where the rows' photos are, once the paragraphs are laid out (rowTops: where each gap's rows start) */
  const betweenRects = (a: Assembled, rowTops: number[]) => {
    const out: Record<string, Rect> = {};
    for (const [b, rs] of a.brow) {
      let yy = rowTops[b] ?? 0;
      for (const r of rs) {
        let xx = r.x0;
        r.items.forEach((it, i) => { out[it.key] = { x: xx, y: yy + Math.round((r.h - r.hs[i]) / 2), w: r.ws[i], h: r.hs[i] }; xx += r.ws[i] + GT; });
        yy += r.h + GT;
      }
    }
    return out;
  };
  /* the gap a held photo would go into if let go now: its line shows, and the photo leaves the words alone meanwhile */
  type Gap = { id: string; b: number; at: number };
  const [inGap, setGap] = useState<Gap | null>(null);
  const A = assemble(inGap?.id);
  const { blocks, singles } = A;
  /* photos placed by hand: where they were put, in paragraph and line; one saved as a plain position (an older
     version) is placed against the page without the hand-placed photos */
  const base = run(blocks.map((b) => b.spot));
  const lastP = Math.max(0, paras.length - 1);
  const fresh: [string, Pos][] = [];
  const spotOf = (sg: { key: string; w: number; h: number; at: Pos }, collect?: [string, Pos][]): Spot => {
    if (sg.at.p !== undefined && sg.at.k !== undefined) return { key: sg.key, x: Math.min(sg.at.x, W - sg.w), w: sg.w, p: Math.min(sg.at.p, lastP), k: sg.at.k, n: linesFor(sg.h) };
    const sp = toSpot(sg.key, sg.at.x, sg.at.y, sg.w, sg.h, base, W, lh, size);
    collect?.push([sg.key, { ...sg.at, x: sp.x, p: sp.p, k: sp.k }]);
    return sp;
  };
  const spots = [...blocks.map((b) => b.spot), ...singles.map((sg) => spotOf(sg, fresh))];
  const { lines, rects, tops, starts, rows: lineRows, bottoms, rowTops, headX, height } = run(spots, A.rowsAt);
  const brects = betweenRects(A, rowTops);
  /* where a finger is on the page is turned into a paragraph and line, or a gap between paragraphs, against the page as
     it stands with every photo in its place except the one being held. (Measured against the page without the photos
     that had been moved, the paragraphs below a moved photo started too high, so a photo there landed lines away.) */
  const B = front ? assemble(front) : A;
  const others = front
    ? run([...B.blocks.map((b) => b.spot), ...B.singles.map((sg) => spotOf(sg))], B.rowsAt)
    : { lines, rects, tops, starts, rows: lineRows, bottoms, rowTops, headX, height };
  const obrects = front ? betweenRects(B, others.rowTops) : brects;
  const [naming, setNaming] = useState<string | null>(null);   // the title being renamed, in place
  const [lifted, setLifted] = useState<number | null>(null);   // the paragraph held up by a long press
  const [slotAt, setSlotAt] = useState<number | null>(null);   // the gap a held paragraph would move to if let go now
  const tiles: { key: string; pics: Pic[]; r: Rect }[] = [];
  for (const b of blocks) {
    const r = rects[b.spot.key], sy = r.h / b.ch;
    for (const tl of b.tiles) tiles.push({ key: tl.key, pics: tl.pics, r: { x: r.x + tl.r.x, y: r.y + tl.r.y * sy, w: tl.r.w, h: tl.r.h * sy } });
  }
  for (const sg of singles) if (sg.key !== 'preview') tiles.push({ key: sg.key, pics: sg.pics, r: rects[sg.key] });
  for (const rs of A.brow.values()) for (const r of rs) for (const it of r.items) if (it.key !== 'preview') tiles.push({ key: it.key, pics: it.pics, r: brects[it.key] });
  /* the held photo stays on the page (under the finger) while it is out of the layout over a gap */
  const lastTiles = useRef<Record<string, { key: string; pics: Pic[]; r: Rect }>>({});
  if (inGap && inGap.id !== 'preview' && !tiles.some((tl) => tl.key === inGap.id) && lastTiles.current[inGap.id]) tiles.push(lastTiles.current[inGap.id]);
  useEffect(() => { lastTiles.current = Object.fromEntries(tiles.map((tl) => [tl.key, tl])); });
  const previewRect = rects.preview ?? brects.preview;

  /* where each photo was when the finger went down; read only inside the gesture handlers */
  type Round = { rects: Record<string, Rect>; base: typeof others; sizes: Record<string, { w: number; h: number }>; ratios: Record<string, number>;
    brow: Assembled['brow']; brects: Record<string, Rect>; between: Record<string, boolean>; landRect?: (id: string, at: Pos) => Rect | null };
  const now = useRef<Round>({ rects: {}, base: others, sizes: {}, ratios: {}, brow: A.brow, brects: {}, between: {} });
  const last = useRef<{ id: string; at: Pos } | null>(null);
  const moveTo = useRef(onMove);
  useEffect(() => {
    const sizes: Record<string, { w: number; h: number }> = {};
    for (const sg of singles) sizes[sg.key] = { w: sg.w, h: sg.h };
    for (const tl of tiles) sizes[tl.key] = { w: tl.r.w, h: tl.r.h };
    const ratios = Object.fromEntries(tiles.map((tl) => [tl.key, ratioOf(tl.pics)]));
    const between: Record<string, boolean> = {};
    for (const rs of A.brow.values()) for (const r of rs) for (const it of r.items) between[it.key] = true;
    now.current = {
      rects: { ...Object.fromEntries(tiles.map((tl) => [tl.key, tl.r])), ...(previewRect ? { preview: previewRect } : {}) },
      base: others, sizes, ratios, brow: B.brow, brects: obrects, between,
      /* where a photo would be if it were put there: the page laid out once with it */
      landRect: (id: string, at: Pos) => {
        const A2 = assemble(undefined, { [id]: at });
        const r2 = run([...A2.blocks.map((b) => b.spot), ...A2.singles.map((sg) => spotOf(sg))], A2.rowsAt);
        return betweenRects(A2, r2.rowTops)[id] ?? r2.rects[id] ?? null;
      },
    };
    moveTo.current = onMove;
  });
  /* positions read from an older version are saved once in paragraph and line */
  const freshKey = JSON.stringify(fresh);
  useEffect(() => { for (const [k, at] of JSON.parse(freshKey) as [string, Pos][]) moveTo.current(k, at); }, [freshKey]);
  const tied = useRef({ tops, starts, height, stickers });
  useEffect(() => { tied.current = { tops, starts, height, stickers }; });
  /* the photo under the finger: its size on the page when it was picked up, its shape, and whether it came from a row
     between paragraphs */
  const held = useRef({ w: 0, h: 0, r: 0.75, from: false });
  const binNow = useRef<{ at?: { x: number; y: number }; state: 'on' | 'over' | null; show?: (s: 'on' | 'over' | null) => void; remove?: (key: string) => void }>({ state: null });
  useEffect(() => { binNow.current.at = bin; binNow.current.show = onPhotoBin; binNow.current.remove = onRemove; });
  const heldId = useRef<string | null>(null);
  const shove = useSharedValue<Shove>({ id: '', dy: 0, n: 0 });
  const edge = useRef(onEdge), dragging = useRef(onDrag);
  useEffect(() => { edge.current = onEdge; dragging.current = onDrag; });
  /* a sticker held, or let go: the page stops scrolling while it is held */
  const holdSticker = useCallback((id: string | null) => {
    setHolding(id); dragging.current?.(!!id);
    /* let go: the words go around where the sticker is kept (a sticker held and let go without moving left its copy) */
    if (!id) setTimeout(() => { cancelAnimationFrame(slider.current.frame); slider.current.sig = ''; setSlid(null); }, 250);
  }, []);
  /* the words reflow only when the photo's place really changes (its paragraph, line, or some points across), at most once a frame */
  const shown = useRef('');
  /* While a photo is held the words make room for it as it goes, in real time: each time its place changes (a line, a
     side, or a gap between paragraphs) the page reflows on the next frame. Only the lines that move are redrawn, and
     photos and stickers whose place didn't change aren't touched, so this keeps up with the finger. */
  const frame = useRef(0);
  /* What is shown is what a let-go keeps (last). */
  const place = useCallback((id: string, at: Pos) => {
    const sig = `${id}|${at.p}|${at.k}|${at.x}|${at.w}|${at.b}|${at.o}`;
    if (sig === shown.current) return;
    shown.current = sig; last.current = { id, at };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setLive((s) => ({ ...s, [id]: at })));
  }, [setLive]);
  /* The gap between two paragraphs: with the finger staying there a moment, a line shows across it (or, among photos
     already in a row there, between them), the held photo leaves the words alone, and a let-go puts it there. A finger
     only passing over a gap shows nothing. */
  const gapNow = useRef<{ g: Gap | null; timer?: ReturnType<typeof setTimeout>; key: string }>({ g: null, key: '' });
  const settle = () => { clearTimeout(gapNow.current.timer); gapNow.current.timer = undefined; gapNow.current.key = gapNow.current.g ? `${gapNow.current.g.id}|${gapNow.current.g.b}` : ''; };
  const showGap = useCallback((id: string, at: Pos, index: number) => {
    const gn = gapNow.current, key = `${id}|${at.b}`;
    if (gn.g && gn.g.id === id && gn.g.b === at.b) {
      last.current = { id, at };
      if (gn.g.at !== index) { gn.g = { id, b: at.b!, at: index }; setGap(gn.g); }
      return;
    }
    if (gn.timer && gn.key === key) return;
    clearTimeout(gn.timer);
    gn.key = key;
    gn.timer = setTimeout(() => {
      gn.timer = undefined;
      gn.g = { id, b: at.b!, at: index };
      last.current = { id, at }; shown.current = '';
      setGap(gn.g);
      Haptics.selectionAsync().catch(() => {});
    }, 120);
  }, []);
  const hideGap = useCallback(() => {
    const gn = gapNow.current;
    clearTimeout(gn.timer); gn.timer = undefined; gn.key = '';
    if (gn.g) { gn.g = null; setGap(null); }
  }, []);
  const grab = useCallback((id: string) => {
    const nw = now.current, sz = nw.sizes[id] ?? { w: 0, h: 0 };
    held.current = { ...sz, r: nw.ratios[id] ?? (sz.w ? sz.h / sz.w : 0.75), from: !!nw.between[id] };
    heldId.current = id;
    shown.current = ''; last.current = null;
    setPicked(null); setFront(id); setHolding(id);
    dragging.current?.(true);                     // the page stops scrolling only now, once the photo is really held
    Haptics.selectionAsync().catch(() => {});     // it has been taken hold of
  }, []);
  /* A photo held at (x, y) with this size, the finger at (fgx, fgy): with the finger on the words it goes beside them,
     its top level with the nearest line; with the finger in the gap between two paragraphs it goes in the row there,
     among the photos already there, at the place the finger is over. */
  const decide = useCallback((id: string, x: number, y: number, w: number, h: number, fgx: number, fgy: number) => {
    const nw = now.current;
    const cy = y + h / 2;
    const b = boundaryAt(nw.base, fgy, lh);
    const sp = toSpot(id, x, y, w, h, nw.base, W, lh, size);
    /* With the finger in the white space between two paragraphs (or parts of the day) the gap's line shows and a let-go
       puts the photo there; anywhere else it goes beside the words, across two paragraphs too, and they go around it. */
    if (b >= 0) {
      const rs = nw.brow.get(b) ?? [];
      const list = rs.flatMap((r) => r.items).filter((it) => it.key !== id);
      let at = 0, ri = 0;
      for (; ri < rs.length; ri++) { const rr = nw.brects[rs[ri].items[0]?.key]; if (rr && fgy < rr.y + rr.h + 3) break; }
      ri = Math.min(ri, Math.max(0, rs.length - 1));
      if (rs[ri]) { at = ri * 3; for (const it of rs[ri].items) { const r2 = nw.brects[it.key]; if (it.key !== id && r2 && fgx > r2.x + r2.w / 2) at++; } }
      at = Math.min(at, list.length);
      const prev = list[at - 1]?.o, next = list[at]?.o;
      const o = prev === undefined && next === undefined ? 0 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
      showGap(id, { x: 0, y: 0, b, o, w: Math.round(w) }, at);   // the size it has as it is carried
      return;
    }
    hideGap();
    /* beside the words the photo is where the finger has it, and the words go around it there as it moves (in steps of
       a few points); near an edge it goes against the edge */
    if (sp.x > 0 && sp.x < W - w) sp.x = Math.round(sp.x / 6) * 6;
    /* not on top of another photo: it goes just below the one it would cover, or just above it when the finger is nearer
       its top (and there is room above in the paragraph) */
    const e = PAD - (lh - size) / 2, hh = sp.n * lh - 2 * e, st = nw.base.starts[sp.p] ?? 0;
    const taken = Object.entries(nw.base.rects).filter(([key]) => key !== id && key !== 'preview').map(([, r]) => r);
    let k = sp.k;
    for (let pass = 0; pass < 4; pass++) {
      const y0 = st + k * lh + e;
      const hit = taken.find((r) => sp.x < r.x + r.w + PAD && sp.x + sp.w + PAD > r.x && y0 < r.y + r.h + PAD && y0 + hh + PAD > r.y);
      if (!hit) break;
      const above = Math.floor((hit.y - PAD - hh - e - st) / lh);
      k = cy < hit.y + hit.h / 2 && above >= 0 ? above : Math.ceil((hit.y + hit.h + PAD - e - st) / lh);
    }
    /* the words go around the photo where the finger has it, so photo and words are one layer */
    place(id, { x: sp.x, y, p: sp.p, k, w });
  }, [W, lh, size, place, showGap, hideGap]);
  /* where the held photo is now: the finger on the page and the point of the photo it holds. Its size beside the words is
     the one it had there (or two fingers gave it); one taken from a row between paragraphs has the usual size. */
  const move = useCallback((id: string, gx: number, gy: number, fx: number, fy: number, want: number, sy: number, sx: number) => {
    const hd = held.current;
    /* the bin shows where the talk key is while a photo is carried; over it, the photo would come off the page */
    const bn = binNow.current;
    if (sx >= 0 && bn.at) {
      const over = Math.hypot(sx - bn.at.x, sy - bn.at.y) < 56;
      const st = over ? 'over' : 'on';
      if (st !== bn.state) { bn.state = st; if (over) Haptics.selectionAsync().catch(() => {}); bn.show?.(st); }
    }
    const pinched = hd.w > 0 && Math.abs(want - hd.w) >= 0.5;
    /* the size it has as it is carried, wherever it goes: as it was, or as two fingers made it */
    const ww = pinched ? Math.round(want) : hd.w || soloFor(hd.r, W).w;
    /* only resized: it keeps its place (in its row, or beside the same line, against the same edge) */
    const cur = posNow.current[id];
    if (sy === -2 && cur && (cur.b !== undefined || cur.p !== undefined)) {
      const ow = cur.w ?? hd.w;
      const x = cur.b !== undefined ? 0 : cur.x >= W - ow - 1 ? Math.max(0, W - ww) : Math.min(cur.x, Math.max(0, W - ww));
      place(id, { ...cur, x, w: ww });
      return;
    }
    const hh = ww * hd.r;
    decide(id, gx - fx * ww, gy - fy * hh, ww, hh, gx, gy);
    if (sy >= 0) edge.current?.(sy);
  }, [W, decide, place]);
  const drop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    setHolding(null);
    const id = heldId.current, bn = binNow.current;
    settle();
    hideGap();
    heldId.current = null;
    dragging.current?.(false);
    edge.current?.(null);
    if (bn.state) {
      const off = bn.state === 'over';
      bn.state = null; bn.show?.(null);
      if (off && id) { last.current = null; bn.remove?.(id); return; }
    }
    const lt = last.current;
    if (lt) { setLive((s) => ({ ...s, [lt.id]: lt.at })); moveTo.current(lt.id, lt.at); }
    last.current = null;
  }, [setLive, hideGap]);
  /* A photo carried in from the bottom of the page: it is held over the page by the screen (so it follows the finger
     smoothly) and tells the page where it is (top-left, size); the page makes room, and says where it would land. */
  const carry = useCallback((c: { x: number; y: number; w: number; h: number; gx: number; gy: number } | null, lift?: number[]) => {
    if (!c) {
      cancelAnimationFrame(frame.current);
      settle(); hideGap();
      shown.current = ''; last.current = null;
      setPv(null); setAway(null);
      setLive((s) => { if (!('preview' in s)) return s; const n = { ...s }; delete n.preview; return n; });
      setFront((f) => (f === 'preview' ? '' : f));
      return;
    }
    if (!shown.current.startsWith('preview')) { setPv({ r: c.h / c.w }); setAway(lift?.[0] ?? null); setFront('preview'); }
    decide('preview', c.x, c.y, c.w, c.h, c.gx, c.gy);
  }, [decide, setLive, hideGap]);
  /* where a photo carried in from the bottom lands: its place on the page, or (over a gap) where it will be once put there */
  const landing = useCallback(() => {
    const lt = last.current;
    if (!lt || lt.id !== 'preview') return null;
    const rect = gapNow.current.g?.id === 'preview' ? now.current.landRect?.('preview', lt.at) : now.current.rects.preview;
    return rect ? { at: lt.at, rect } : null;
  }, []);
  const nudge = useCallback((dy: number) => {
    const id = heldId.current;
    if (id) shove.set({ id, dy, n: shove.get().n + 1 });
  }, [shove]);
  useEffect(() => {
    if (!api) return undefined;
    api.current = { carry, landing, nudge };
    return () => { api.current = null; };
  }, [api, carry, landing, nudge]);
  /* where a photo carried in from the bottom would land, so the one under the finger can take its size (and, in a row
     between paragraphs, its place) */
  const tell = useRef(onPreview);
  useEffect(() => { tell.current = onPreview; });
  const pvx = previewRect?.x ?? 0, pvy = previewRect?.y ?? 0, pvw = previewRect?.w ?? 0, pvh = previewRect?.h ?? 0, pvRow = !!brects.preview;
  useEffect(() => { tell.current?.(pvw ? { x: pvx, y: pvy, w: pvw, h: pvh, row: pvRow } : null); }, [pvx, pvy, pvw, pvh, pvRow]);

  /* a sticker let go (or just put on): tied to the paragraph its top is in; null throws it away */
  const stuck = useRef(onSticker);
  useEffect(() => { stuck.current = onSticker; });
  /* a sticker the words go around, while held: the words move out of its way at most once a frame, and only when it has
     moved a few points or turned a few degrees */
  const slider = useRef({ sig: '', frame: 0 });
  const slide = useCallback((id: string, x: number, y: number, w: number, r: number) => {
    const sig = `${id}|${Math.round(x / 6)}|${Math.round(y / 6)}|${Math.round(w / 6)}|${Math.round(r / 4)}`;
    if (sig === slider.current.sig) return;
    slider.current.sig = sig;
    cancelAnimationFrame(slider.current.frame);
    slider.current.frame = requestAnimationFrame(() => {
      const { tops: ts, stickers: all } = tied.current;
      const st = (all ?? []).find((one) => one.id === id);
      if (!st) return;
      let p = 0;
      ts.forEach((tp, i) => { if (tp <= y) p = i; });
      setSlid({ ...st, p, x, y: y - (ts[p] ?? 0), w, r });
    });
  }, []);
  /* the switch hides by itself after a while */
  useEffect(() => {
    if (!picked) return;
    const id = setTimeout(() => setPicked(null), 5000);
    return () => clearTimeout(id);
  }, [picked]);
  const tie = useCallback((id: string, at: { x: number; y: number; w: number; r: number } | null) => {
    if (!at) { stuck.current?.(id, null); return; }
    const { tops: ts, height: hh } = tied.current;
    /* a sticker stays inside the text area: a part that stuck out past its edges couldn't be touched, so the sticker
       seemed stuck */
    const w = Math.min(at.w, W);
    const y = Math.max(0, Math.min(Math.max(0, hh - w * 0.5), at.y)), x = Math.max(0, Math.min(W - w, at.x));
    let p = 0;
    ts.forEach((tp, i) => { if (tp <= y) p = i; });
    stuck.current?.(id, { p: ts.length ? p : -1, x, y: y - (ts[p] ?? 0), w, r: at.r });
  }, [W]);
  /* let go: the words stop following the fingers and go around its new place */
  const stick = useCallback((id: string, at: { x: number; y: number; w: number; r: number } | null) => {
    cancelAnimationFrame(slider.current.frame);
    slider.current.sig = '';
    setSlid(null);
    tie(id, at);
  }, [tie]);
  /* one just put on the page is tied to a paragraph straight away */
  const loose = (stickers ?? []).filter((st) => st.p < 0 && tops.length).map((st) => `${st.id}|${st.x}|${st.y}|${st.w}|${st.r}`).join(',');
  useEffect(() => {
    for (const one of loose ? loose.split(',') : []) {
      const [id, x, y, w, r] = one.split('|');
      tie(id, { x: +x, y: +y, w: +w, r: +r });
    }
  }, [loose, tie]);

  /* a tap edits the words under the finger: their recording, or the caption of the photo they belong to */
  const edit = (p: number, o: number) => {
    if (picked) { setPicked(null); return; }
    if (onChoose) { onChoose(`t${srcs[p][0].item}`); return; }
    const sr = srcs[p].reduce((r, c) => (c.from <= o ? c : r), srcs[p][0]); onEdit(sr.item, sr.part);
  };
  const canLift = !!(onMerge || onShare || onSelect) && !onChoose;
  const hold = (p: number) => (canLift ? () => { setSlotAt(null); setLifted(p); } : undefined);
  const marked = (p: number) => !!chosen?.has(`t${srcs[p][0].item}`);
  const ink = useMemo(() => ({ fontSize: size, lineHeight: lh, color: t.ink, fontFamily: cn.body }), [size, lh, t.ink, cn.body]);
  const inkLa = useMemo(() => ({ fontSize: size * LATIN, lineHeight: lh, color: t.ink, fontFamily: F.serif }), [size, lh, t.ink]);
  /* the taps reach the latest page through a ref, so the line pieces keep the same handlers and needn't re-render */
  const acts = useRef({ edit, hold });
  useEffect(() => { acts.current = { edit, hold }; });
  const tap = useCallback((p: number, o: number) => acts.current.edit(p, o), []);
  const press = useCallback((p: number) => acts.current.hold(p)?.(), []);
  const canHold = canLift;
  /* justified: the room left on a line goes between its words (or characters); the last line of a paragraph, and a
     line where the gaps would grow wide, stay set to the left */
  const setLine = (l: Line, li: number) => {
    const toks = l.toks.map((tk) => ({ ...tk, w: adv(m, size, tk.s.trimEnd()), full: adv(m, size, tk.s) }));
    const key = `${l.p}:${toks[0]?.o ?? li}`;          // a line is known by its paragraph and first word, not its number
    const natural = toks.reduce((a, tk, j) => a + (j === toks.length - 1 ? tk.w : tk.full), 0);
    const cuts = toks.slice(1).filter((tk) => !NO_START.test(tk.s)).length;
    const chars = toks.every((tk) => tk.s.length === 1 && isCJK(tk.s));
    const room = l.w - natural;
    const narrow = l.w < W * 0.6;                   // a column beside a photo: its edge faces the photo, so it stretches further
    const each = !l.last && cuts > 0 && room > 0 && room / cuts <= size * (chars ? 0.3 : narrow ? 0.9 : 0.6) ? room / cuts : 0;
    const mark = marked(l.p) ? (
      <View key={`h${key}`} pointerEvents="none" style={[d.marker, { left: l.x - 3, top: l.y + 2, width: (each || (chars && room > 0 && !l.last) ? l.w : natural) + 6, height: lh - 3, backgroundColor: t.glow }]} />
    ) : null;
    if (chars) {
      /* letter spacing also follows the last character, so the room is shared by every character, less a little slack;
         a line whose closing punctuation hangs past the edge is drawn a hair tighter instead, so it is never cut off */
      const ls = each ? Math.max(0, (room - 2) / toks.length) : room < 0 ? (room - 1) / toks.length : 0;
      return [mark, <Chars key={key} text={toks.map((tk) => tk.s).join('')} x={l.x} y={l.y} ls={ls} unit={natural / toks.length + ls} p={l.p} o0={toks[0].o}
        ink={ink} tap={tap} hold={canHold ? press : undefined} />];
    }
    let x = l.x;
    return [mark, ...toks.map((tk, j) => {
      const at = x;
      x += tk.full + (j < toks.length - 1 && !NO_START.test(toks[j + 1].s) ? each : 0);
      return <Word key={`${key}-${j}`} s={tk.s.trimEnd()} x={at} y={l.y} p={l.p} o={tk.o} ink={isCJK(tk.s) ? ink : inkLa} lift={isCJK(tk.s) ? 0 : LATIN_DROP} tap={tap} hold={canHold ? press : undefined} />;
    })];
  };

  return (
    <View style={d.page}>
      {naming !== null ? (
        <TextInput value={naming} onChangeText={setNaming} autoFocus selectTextOnFocus returnKeyType="done" selectionColor={t.red} placeholder={title}
          placeholderTextColor={t.mut} onSubmitEditing={() => { onRename?.(naming); setNaming(null); }} onBlur={() => { onRename?.(naming); setNaming(null); }}
          style={[isCJK(naming) || !/[A-Za-z]/.test(naming) ? d.title : d.titleEn, { color: t.ink, fontFamily: isCJK(naming) || !/[A-Za-z]/.test(naming) ? cn.title : F.serif, padding: 0 }]} />
      ) : title ? (
        <Text onPress={onRename ? () => setNaming(ownTitle || title) : undefined} suppressHighlighting style={[isCJK(title) ? d.title : d.titleEn, { color: t.ink, fontFamily: isCJK(title) ? cn.title : F.serif }]}>{title}</Text>
      ) : null}
      {meta ? <Text style={[d.meta, { color: t.mut }]}>{meta}</Text> : null}
      <View ref={area} collapsable={false} style={{ height: Math.max(height, ...(stickers ?? []).map((st) => (st.p >= 0 ? (tops[Math.min(st.p, tops.length - 1)] ?? 0) : 0) + st.y + st.w)), marginTop: 12 }}>
        {marks.map((mk, pi) => (
          <React.Fragment key={`m${pi}`}>
            {mk.head ? <Text style={[d.head, { top: tops[pi] + sec(mk, pi), left: headX[pi] ?? 0, color: t.ink, fontFamily: isCJK(mk.head) ? cn.title : F.serif }]}>{mk.head}</Text> : null}
            {mk.bar || mk.time ? (
              <View style={[d.stamp, { top: tops[pi] + sec(mk, pi) + (mk.head ? HEAD : 0), left: headX[pi] ?? 0, height: mk.bar ? 22 : 16 }]}>
                {mk.time ? <Text style={[d.time, { color: t.mut }]}>{clock(mk.time)}</Text> : null}
                {mk.bar ? <VoiceBar bar={mk.bar} /> : null}
              </View>
            ) : null}
          </React.Fragment>
        ))}
        {lines.map(setLine)}
        {tiles.map((tl) => (
          <Movable key={tl.key} id={tl.key} slot={!!brects[tl.key]} pk={tl.pics.map((pc) => pc.file ?? pc.uri ?? pc.asset).join('|')} r={tl.r} z={tl.key === front ? 2 : 1} W={W} locked={locked || !!onChoose} block={scroll} grab={grab} move={move} drop={drop} open={onOpen ? openTile : undefined} two={two} shove={shove}>
            {tl.pics[0]?.pin ? <PinTile pin={tl.pics[0].pin} w={tl.r.w} h={tl.r.h} />
              : tl.pics.length > 1 ? <Fluid pics={tl.pics} />
              : <Image source={src(tl.pics[0])} contentFit="cover" style={[StyleSheet.absoluteFill, { borderRadius: 8 }]} />}
            {tl.pics.length === 1 && tl.pics[0].video ? <VideoMark secs={tl.pics[0].video.secs} big={tl.r.w > 150} /> : null}
          </Movable>
        ))}
        {/* the gap's line: across the page between the two paragraphs, or, among photos already in a row there, between them */}
        {inGap ? (() => {
          const P = paras.length, b = inGap.b;
          const items = (A.brow.get(b) ?? []).flatMap((r) => r.items).filter((it) => it.key !== inGap.id);
          if (items.length) {
            const ra = items[inGap.at - 1] && brects[items[inGap.at - 1].key], rb = items[inGap.at] && brects[items[inGap.at].key];
            const ref = (ra ?? rb)!;
            const x = ra && rb && Math.abs(ra.y - rb.y) < 1 ? (ra.x + ra.w + rb.x) / 2 : ra ? ra.x + ra.w + GT / 2 + 2 : rb!.x - GT / 2 - 2;
            return <View pointerEvents="none" style={[d.gapV, { left: x - 1.25, top: ref.y, height: ref.h, backgroundColor: t.red }]} />;
          }
          const gy = b === 0 ? (tops[0] ?? 0) - 10 : b === P ? (bottoms[P - 1] ?? 0) + 12 : ((bottoms[b - 1] ?? 0) + (tops[b] ?? 0)) / 2;
          return (
            <View pointerEvents="none" style={[d.gapH, { top: gy - 3 }]}>
              <View style={[d.gapDot, { backgroundColor: t.red }]} />
              <View style={[d.gapLine, { backgroundColor: t.red }]} />
              <View style={[d.gapDot, { backgroundColor: t.red }]} />
            </View>
          );
        })() : null}
        {onChoose ? tiles.map((tl) => {
          const on = !!chosen?.has(tl.key);
          return (
            <Pressable key={`c${tl.key}`} onPress={() => onChoose(tl.key)} style={[d.pick, { left: tl.r.x, top: tl.r.y, width: tl.r.w, height: tl.r.h, borderColor: on ? t.ink : 'transparent' }]}>
              <View style={[d.check, { backgroundColor: on ? t.ink : 'rgba(255,255,255,0.85)', borderColor: on ? t.ink : t.mut }]}>
                {on ? <Text style={[d.checkT, { color: t.b }]}>✓</Text> : null}
              </View>
            </Pressable>
          );
        }) : null}
        {(stickers ?? []).map((st) => {
          const source = stickerSrc(st.s);
          if (!source) return null;
          const p = Math.min(st.p, tops.length - 1);
          return (
            <Stuck key={st.id} st={st} top={st.p >= 0 && p >= 0 ? tops[p] : 0} W={W} source={source} slap={st.id === slap} locked={locked || !onSticker || !!onChoose}
              bin={bin} block={scroll} place={stick} carry={onStickerDrag} slide={slide} tap={setPicked} two={two} hold={holdSticker} />
          );
        })}
        {picked && onSticker ? (() => {
          const st = (stickers ?? []).find((one) => one.id === picked);
          if (!st) return null;
          const p = Math.min(st.p, tops.length - 1), at = (st.p >= 0 && p >= 0 ? tops[p] : 0) + st.y;
          const seg = (on: boolean, label: string, wrap: boolean) => (
            <Pressable key={label} onPress={() => onSticker(st.id, { wrap })} style={[d.segBtn, on && { backgroundColor: t.pill }]}>
              <Text style={{ fontSize: 12.5, color: on ? t.pillText : t.ink }}>{label}</Text>
            </Pressable>
          );
          return (
            <View style={[d.seg, { top: at - 44, left: Math.max(-8, Math.min(W - 236, st.x + st.w / 2 - 118)), backgroundColor: t.panel }]}>
              {seg(!!st.wrap, S.wrapOn, true)}{seg(!st.wrap, S.wrapOff, false)}
              <Pressable onPress={() => { setPicked(null); setSlid(null); onSticker(st.id, null); }} style={d.segBtn}>
                <Text style={{ fontSize: 12.5, color: t.red }}>{S.del}</Text>
              </Pressable>
            </View>
          );
        })() : null}
        {holding ? <GestureDetector gesture={second}><View style={d.second} /></GestureDetector> : null}
        {lifted !== null && slotAt !== null ? (() => {
          const P = paras.length, b = slotAt;
          const gy = b === 0 ? (tops[0] ?? 0) - 8 : b === P ? (bottoms[P - 1] ?? 0) + 10 : ((bottoms[b - 1] ?? 0) + (tops[b] ?? 0)) / 2;
          return <View pointerEvents="none" style={[d.slot, { top: gy - 1, width: W, backgroundColor: t.red }]} />;
        })() : null}
        {lifted !== null && lifted < paras.length ? (() => {
          const p = lifted, put = () => { setLifted(null); setSlotAt(null); };
          const P = paras.length;
          const gaps = Array.from({ length: P + 1 }, (_, b) => (b === 0 ? (tops[0] ?? 0) - 8 : b === P ? (bottoms[P - 1] ?? 0) + 10 : ((bottoms[b - 1] ?? 0) + (tops[b] ?? 0)) / 2));
          /* the item a paragraph moved to gap b goes before: the first item of the paragraph after the gap, with the
             heading above it (or the end of the page) */
          const before = (b: number) => {
            if (b >= P) return items.length;
            let at = srcs[b][0].item;
            while (at > 0 && items[at - 1]?.kind === 'head') at--;
            return at;
          };
          const first = srcs[p][0].item, next = srcs[p + 1]?.[0].item;
          return (
            <Lifted text={paras[p]} top={starts[p]} W={W} ink={ink} up={p > 0 && !!onMerge} down={next !== undefined && !!onMerge}
              p={p} gaps={gaps} onSlot={setSlotAt} onMove={(b) => { put(); onReorder?.(first, before(b)); }}
              onUp={() => { put(); onMerge?.(first); }} onDown={() => { put(); if (next !== undefined) onMerge?.(next); }}
              onShare={onShare ? () => { put(); onShare(first); } : undefined} onSelect={onSelect ? () => { put(); onSelect(paras[p]); } : undefined}
              onClose={put} />
          );
        })() : null}
      </View>
    </View>
  );
}

/* ---------- a voice bar: the recordings of one stretch of talking, played one after another ---------- */
type Bar = { uris: string[]; secs: number; at?: number };
const clock = (ms: number) => { const t = new Date(ms); return `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`; };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
function VoiceBar({ bar }: { bar: Bar }) {
  const t = useT();
  const [on, setOn] = useState(false);
  const player = useRef<AudioPlayer | null>(null);
  useEffect(() => () => { player.current?.remove(); }, []);
  /* a small waveform drawn from the file name, so each bar looks a little different and stays the same */
  const waves = useMemo(() => {
    let h = 7;
    for (const ch of bar.uris[0] ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return Array.from({ length: 13 }, (_, i) => 3 + ((h >>> (i * 2)) % 8));
  }, [bar.uris]);
  function playFrom(i: number) {
    player.current?.remove();
    player.current = null;
    if (i >= bar.uris.length) { setOn(false); return; }
    const p = createAudioPlayer({ uri: bar.uris[i] });
    p.addListener('playbackStatusUpdate', (st) => { if (st.didJustFinish) playFrom(i + 1); });
    player.current = p;
    p.play();
  }
  function toggle() {
    if (on) { player.current?.pause(); setOn(false); return; }
    setOn(true);
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {}).finally(() => { if (player.current) player.current.play(); else playFrom(0); });
  }
  const label = bar.secs ? mmss(bar.secs) : '';     // the time it was said sits beside the bar
  return (
    <Pressable onPress={toggle} hitSlop={6} accessibilityRole="button" accessibilityLabel={label || 'voice'}
      style={({ pressed }) => [d.bar, { backgroundColor: t.panel, opacity: pressed ? 0.75 : 1 }]}>
      <View style={[d.play, { backgroundColor: t.red }]}>
        {on ? <View style={d.pause}><View style={d.pauseBar} /><View style={d.pauseBar} /></View> : <View style={d.tri} />}
      </View>
      <View style={d.waves}>{waves.map((hh, i) => <View key={i} style={{ width: 2, height: hh, borderRadius: 1, backgroundColor: on ? t.ink : t.mut, opacity: on ? 0.9 : 0.55 }} />)}</View>
      {label ? <Text style={[d.barT, { color: t.mut }]}>{label}</Text> : null}
    </Pressable>
  );
}

const d = StyleSheet.create({
  head: { position: 'absolute', left: 0, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  marker: { position: 'absolute', borderRadius: 3 },
  second: { position: 'absolute', left: -60, right: -60, top: -600, bottom: -900, zIndex: 9 },
  seg: { position: 'absolute', zIndex: 6, flexDirection: 'row', borderRadius: 17, padding: 3, gap: 2, width: 236, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  segBtn: { flex: 1, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dim: { position: 'absolute', left: -40, right: -40, top: -400, bottom: -800, opacity: 0.72, zIndex: 7 },
  lift: { position: 'absolute', left: -12, zIndex: 8, gap: 10 },
  liftCard: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  liftBar: { alignSelf: 'center', flexDirection: 'row', borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4 },
  liftBtn: { paddingHorizontal: 12, height: 36, justifyContent: 'center' },
  liftHint: { fontSize: 11.5, textAlign: 'center' },
  slot: { position: 'absolute', left: 0, height: 2.5, borderRadius: 1.5, zIndex: 9 },
  gapH: { position: 'absolute', left: -3, right: -3, height: 6, flexDirection: 'row', alignItems: 'center', zIndex: 3 },
  gapLine: { flex: 1, height: 2 },
  gapDot: { width: 6, height: 6, borderRadius: 3 },
  gapV: { position: 'absolute', width: 2.5, borderRadius: 1.25, zIndex: 3 },
  /* a sticker's shadow follows its own outline: on the phone from the picture's edge, on the web as a drop-shadow filter */
  stickerShadow: Platform.OS === 'web' ? ({ filter: 'drop-shadow(0 1.5px 2px rgba(0,0,0,0.18))' } as object)
    : { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2.5, shadowOffset: { width: 0, height: 1.5 } },
  pick: { position: 'absolute', zIndex: 5, borderWidth: 2, borderRadius: 10 },
  check: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkT: { fontSize: 12, fontWeight: '700', marginTop: -1 },
  stamp: { position: 'absolute', left: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { fontSize: 12, letterSpacing: 0.3, fontVariant: ['tabular-nums'], fontFamily: F.serif },   // the same in either language
  bar: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 22, paddingLeft: 3, paddingRight: 9, borderRadius: 11 },
  play: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tri: { width: 0, height: 0, marginLeft: 1.5, borderLeftWidth: 6, borderTopWidth: 4, borderBottomWidth: 4, borderLeftColor: '#fff', borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  pause: { flexDirection: 'row', gap: 2 },
  pauseBar: { width: 2, height: 7, borderRadius: 1, backgroundColor: '#fff' },
  waves: { flexDirection: 'row', alignItems: 'center', gap: 1.5, height: 12 },
  barT: { fontSize: 11, letterSpacing: 0.2, fontVariant: ['tabular-nums'] },
  tx: { fontSize: 16, lineHeight: 28 },
  page: { paddingTop: 6 },
  title: { fontSize: 17, lineHeight: 24 },
  titleEn: { fontSize: 19, lineHeight: 24, letterSpacing: -0.1 },
  meta: { fontSize: 11.5, marginTop: 3 },
});
