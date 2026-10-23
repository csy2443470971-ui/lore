import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Re, { SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { hyphenateSync } from 'hyphen/en';
import { CN, Metric, SERIF } from './metrics';
import { Mosaic } from './Photos';
import { Pic, Placed, Pos, Said, Sticker } from './session';
import { stickerSrc } from './stickers';
import { OUTLINES } from './outlines';
import { fileUri } from './store';
import { SZ } from './theme';
import { useFace, useLang, useS, useT } from './ui';

const src = (p: Pic) => (p.uri ? { uri: p.uri } : p.asset);

function useTx() {
  const t = useT();
  const face = useFace();
  const zh = useLang() === 'zh';
  return [zh ? d.tx : d.txEn, { color: t.ink, fontFamily: face.body }];
}

/* Before layout: only the tidied words, in the order they were said. Photos aren't matched to sentences yet;
   the spoken numbers ("one is…") stay in the text and are matched to photos at Lay out. Tap a recording to edit it. */
export function Stream({ items, onEdit }: { items: Said[]; onEdit?: (i: number) => void }) {
  const S = useS();
  const tx = useTx();
  return (
    <View style={{ gap: 16 }}>
      {items.map((x, i) => (x.kind === 'head' || (x.kind === 'talk' && !x.text) ? null : (
        <Text key={i} style={tx} onPress={onEdit && x.kind === 'talk' ? () => onEdit(i) : undefined}>
          {x.kind === 'talk' ? x.text : x.parts.map((p) => p.spoken ?? p.text).join(S.is === '是' ? '' : ' ')}
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
const Word = React.memo(function Word({ s, x, y, p, o, ink, tap, hold }: { s: string; x: number; y: number; p: number; o: number; ink: Ink; tap: Tap; hold?: (p: number) => void }) {
  return <Text numberOfLines={1} onPress={() => tap(p, o)} onLongPress={hold ? () => hold(p) : undefined} style={[ink, { position: 'absolute', left: x, top: y }]}>{s}</Text>;
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

const adv = (m: Metric, size: number, s: string) => {
  let w = 0;
  /* a Chinese character is a full em wide whatever the page's language: Chinese written on a page set in English
     (or the other way round) is measured per character, so the lines come out right and nothing overlaps */
  for (const ch of s) w += CJK.test(ch) || /[　-〿＀-￯]/.test(ch) ? size : (m.w[ch.codePointAt(0)!] ?? m.def) / m.upm * size;
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

/* A photo belongs to one paragraph and covers whole lines, so it never runs into the next paragraph (which starts
   below it) and its edges sit PAD from the ink of the lines above and below, as they do from the words beside it. */
/* heads: room kept above each paragraph for its time heading and voice bar; tops: where that room starts */
/* indent: how far the first line of each paragraph starts in (0 when first-line indent is off) */
/* a sticker the words go around: the points of its outline, turned as it is, x across the page and y down from the top
   of the paragraph it is tied to; it changes only the lines of that paragraph and the ones after it */
type Float = { p: number; pts: { x: number; y: number }[] };
function flow(paras: string[], spots: Spot[], width: number, m: Metric, size: number, lh: number, gap: number, heads: number[] = [], indent = 0, floats: Float[] = []) {
  const e = PAD - (lh - size) / 2;                // how far a photo's edge sits inside its first and last line
  const minSeg = size * 4;                        // a gap beside a photo narrower than this stays empty
  const lines: Line[] = [], starts: number[] = [], rows: number[] = [], tops: number[] = [];
  const rects: Record<string, Rect> = {};
  let y = 0;
  paras.forEach((para, pi) => {
    tops.push(y);
    const start = y + (heads[pi] ?? 0);
    starts.push(start);
    const own = spots.filter((sp) => sp.p === pi).map((sp) => ({ sp, y0: start + sp.k * lh, y1: start + (sp.k + sp.n) * lh }));
    for (const { sp, y0 } of own) rects[sp.key] = { x: sp.x, y: y0 + e, w: sp.w, h: sp.n * lh - 2 * e };
    const free = (ly: number) => {
      let segs: [number, number][] = [[0, width]];
      for (const { sp, y0, y1 } of own) {
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
        const s = i === 0 ? s0 + indent : s0;
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
    y = Math.max(ly, ...own.map((o) => o.y1)) + gap;
  });
  return { lines, starts, rows, rects, tops, height: Math.max(0, y - gap) };
}

/* a photo let go with its top-left at (x, y): the paragraph its top falls in, the nearest line, and the whole number
   of lines its height rounds to; near an edge it moves to the edge */
function toSpot(key: string, x: number, y: number, w: number, h: number, base: { starts: number[]; rows: number[] }, W: number, lh: number, size: number): Spot {
  const e = PAD - (lh - size) / 2;
  let p = 0;
  base.starts.forEach((st, i) => { if (st <= y + lh / 2) p = i; });
  const k = Math.max(0, Math.min(Math.max(0, (base.rows[p] ?? 1) - 1), Math.round((y - e - (base.starts[p] ?? 0)) / lh)));
  const sx = x < 24 ? 0 : x > W - w - 24 ? W - w : x;
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
function Fluid({ pics }: { pics: Pic[] }) {
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

/* one photo (or group) on the page: one finger drags it anywhere, two make it bigger or smaller (from its top-left
   corner, between a quarter of the page and all of it). While it is held the page hears where it is, a few times a
   frame at most, and makes room for it; let go, it settles into the place the words left for it. When the words move
   it (another photo was dragged, the page was laid out again) it glides to its new place. */
const Movable = React.memo(MovableIn, (a, b) => a.id === b.id && a.r.x === b.r.x && a.r.y === b.r.y && a.r.w === b.r.w && a.r.h === b.r.h
  && a.z === b.z && a.W === b.W && a.locked === b.locked && a.block === b.block && a.pk === b.pk && a.grab === b.grab && a.move === b.move && a.drop === b.drop && !!a.open === !!b.open && a.two === b.two);
function MovableIn({ id, r, z, W, locked, block, grab, move, drop, open, two, children }: {
  two: SharedValue<Two>;
  pk: string;                                      // which photos it shows: it redraws only when these or its place change
  id: string; r: Rect; z: number; W: number; locked?: boolean; block?: React.RefObject<unknown>;
  grab: (id: string) => void; move: (id: string, x: number, y: number, w: number) => void; drop: () => void;
  open?: (id: string) => void;                     // a tap opens the photo full screen
  children: React.ReactNode;
}) {
  const t = useT();
  const x = useSharedValue(r.x), y = useSharedValue(r.y), w = useSharedValue(r.w), h = useSharedValue(r.h);
  const home = useSharedValue(r);                  // where the page keeps it
  const live = useSharedValue(0);                  // the gestures under way, as bits (1 one finger, 2 two)
  const size = useSharedValue({ w: 0, h: 0 });
  const far = useSharedValue({ w: 0, h: 0 });     // its size when a second finger came down elsewhere on the page   // its size when two fingers came down
  const last = useSharedValue({ x: 0, y: 0, n: 0 });   // the finger's last position and how many fingers were down
  /* the page's handlers reach the gesture through a ref, so a re-render of the page never rebuilds a gesture under way */
  const cb = useRef({ grab, move, drop, open });
  useEffect(() => { cb.current = { grab, move, drop, open }; });
  const onOpen = useCallback((k: string) => cb.current.open?.(k), []);
  const onGrab = useCallback((k: string) => cb.current.grab(k), []);
  const onMove = useCallback((k: string, a: number, b: number, c: number) => cb.current.move(k, a, b, c), []);
  const onDrop = useCallback(() => cb.current.drop(), []);
  useEffect(() => {
    const to = { x: r.x, y: r.y, w: r.w, h: r.h };
    home.set(to);
    if (live.get() === 0) { x.set(withSpring(to.x, SPRING)); y.set(withSpring(to.y, SPRING)); w.set(withSpring(to.w, SPRING)); h.set(withSpring(to.h, SPRING)); }
  }, [r.x, r.y, r.w, r.h, home, live, x, y, w, h]);
  /* eslint-disable react-hooks/refs -- the gesture's callbacks run during a gesture, on the UI thread, never while rendering */
  const gesture = useMemo(() => {
    /* each gesture marks itself on when it starts and off when it is over in any way (onFinalize always runs, even when a
       gesture is cancelled), so the photo can never be left thinking it is still held */
    const begin = (bit: number) => {
      'worklet';
      if (live.get() === 0) scheduleOnRN(onGrab, id);
      live.set(live.get() | bit);
      if (two.get().id !== id) two.set({ ...NO_TWO, id });
    };
    const end = (bit: number) => {
      'worklet';
      if (!(live.get() & bit)) return;
      live.set(live.get() & ~bit);
      if (live.get() !== 0) return;
      if (two.get().id === id) two.set(NO_TWO);
      scheduleOnRN(onDrop);
      const to = home.get();
      x.set(withSpring(to.x, SPRING)); y.set(withSpring(to.y, SPRING)); w.set(withSpring(to.w, SPRING)); h.set(withSpring(to.h, SPRING));
    };
    /* the photo moves by how far the fingers moved since the last frame; the frame a finger lands or lifts (when their
       centre jumps) it doesn't move at all, so adding or lifting a finger never makes it jump */
    const pan = Gesture.Pan().enabled(!locked).minDistance(2).averageTouches(true)
      .onStart((e) => { last.set({ x: e.translationX, y: e.translationY, n: e.numberOfPointers }); begin(1); two.set({ ...two.get(), x1: e.absoluteX, y1: e.absoluteY }); })
      .onUpdate((e) => {
        const l = last.get();
        last.set({ x: e.translationX, y: e.translationY, n: e.numberOfPointers });
        if (two.get().id === id) two.set({ ...two.get(), x1: e.absoluteX, y1: e.absoluteY });
        if (e.numberOfPointers !== l.n) return;
        const ww = w.get();
        const nx = Math.max(0, Math.min(W - ww, x.get() + e.translationX - l.x)), ny = Math.max(0, y.get() + e.translationY - l.y);
        x.set(nx); y.set(ny);
        scheduleOnRN(onMove, id, nx, ny, ww);
      })
      .onFinalize(() => end(1));
    const pinch = Gesture.Pinch().enabled(!locked)
      .onStart(() => { size.set({ w: w.get(), h: h.get() }); begin(2); })
      .onUpdate((e) => {
        const s0 = size.get(), nw = Math.max(W * 0.25, Math.min(W, s0.w * e.scale)), nx = Math.min(x.get(), W - nw);
        w.set(nw); h.set(s0.h * nw / s0.w); x.set(nx);
        scheduleOnRN(onMove, id, nx, y.get(), nw);
      })
      .onFinalize(() => end(2));
    if (block && Platform.OS !== 'web') { pan.blocksExternalGesture(block as never); pinch.blocksExternalGesture(block as never); }
    const tap = Gesture.Tap().maxDuration(300).onEnd((_e, ok) => { if (ok) scheduleOnRN(onOpen, id); });
    return Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));
  }, [id, W, locked, block, onGrab, onMove, onDrop, onOpen, x, y, w, h, home, live, size, last, two]);
  /* a second finger elsewhere on the page: the photo grows or shrinks by how far apart the two fingers are */
  useAnimatedReaction(() => { const t = two.get(); return t.on && t.id === id ? spread(t) : 0; }, (s) => {
    if (!s) { far.set({ w: 0, h: 0 }); return; }
    if (!far.get().w) far.set({ w: w.get(), h: h.get() });
    const f = far.get(), nw = Math.max(W * 0.25, Math.min(W, f.w * s)), nx = Math.min(x.get(), W - nw);
    w.set(nw); h.set(f.h * nw / f.w); x.set(nx);
    scheduleOnRN(onMove, id, nx, y.get(), nw);
  }, [id, W]);
  /* eslint-enable react-hooks/refs */
  const style = useAnimatedStyle(() => ({ left: x.get(), top: y.get(), width: w.get(), height: h.get() }));
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
    const pan = Gesture.Pan().enabled(!locked).minDistance(2).averageTouches(true)
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
    if (block && Platform.OS !== 'web') for (const g of [pan, pinch, turn]) g.blocksExternalGesture(block as never);
    const touch = Gesture.Tap().enabled(!locked).maxDuration(300).onEnd((_e, ok) => { if (ok) scheduleOnRN(onTap, id); });
    return Gesture.Race(touch, Gesture.Simultaneous(pan, pinch, turn));
  }, [id, W, locked, block, onPlace, onCarry, onSlide, onTap, onHold, bx, by, bw, br, dx, dy, sc, rot, live, over, s0, r0, binAt, last, wraps, two]);
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

/* A paragraph held by a long press: it lifts off the page as a card, and the rest of the page dims. Drag it up onto the
   paragraph above, or down onto the one below, and let go to join them (the one it would join lights up); or use the
   small glass bar under it: join above, join below, share, select the words (to copy them). A tap on the dim page puts
   it back. */
function Lifted({ text, top, W, ink, up, down, onAim, onUp, onDown, onShare, onSelect, onClose }: {
  text: string; top: number; W: number; ink: Ink; up: boolean; down: boolean;
  onAim: (a: 0 | 1 | 2) => void; onUp: () => void; onDown: () => void; onShare?: () => void; onSelect?: () => void; onClose: () => void;
}) {
  const t = useT();
  const S = useS();
  const ty = useSharedValue(0), pop = useSharedValue(0.97), aim = useSharedValue(0);
  useEffect(() => {
    pop.set(withSpring(1.025, { damping: 13, stiffness: 240, mass: 0.6 }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [pop]);
  const cb = useRef({ onAim, onUp, onDown });
  useEffect(() => { cb.current = { onAim, onUp, onDown }; });
  const aimJS = useCallback((a: 0 | 1 | 2) => { if (a) Haptics.selectionAsync().catch(() => {}); cb.current.onAim(a); }, []);
  const upJS = useCallback(() => cb.current.onUp(), []);
  const downJS = useCallback(() => cb.current.onDown(), []);
  /* eslint-disable react-hooks/refs -- the gesture's callbacks run during a gesture, never while rendering */
  const drag = useMemo(() => Gesture.Pan().minDistance(4)
    .onUpdate((e) => {
      ty.set(e.translationY * 0.55);                 // it follows the finger a little reluctantly, like something lifted
      const a = e.translationY < -44 && up ? 1 : e.translationY > 44 && down ? 2 : 0;
      if (a !== aim.get()) { aim.set(a); scheduleOnRN(aimJS, a as 0 | 1 | 2); }
    })
    .onEnd(() => {
      const a = aim.get();
      if (a === 1) scheduleOnRN(upJS); else if (a === 2) scheduleOnRN(downJS);
      else ty.set(withSpring(0, SPRING));
    }), [up, down, ty, aim, aimJS, upJS, downJS]);
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
            <Text style={[ink, { textAlign: 'justify' }]}>{text}</Text>
          </View>
          <View style={[d.liftBar, { borderColor: t.gray, backgroundColor: t.panel + 'B8' }]}>
            <BlurView intensity={40} tint={t.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            {[up ? btn(S.joinUp, onUp, 'up') : null, down ? btn(S.joinDown, onDown, 'down') : null,
              onShare ? btn(S.share, onShare, 'share') : null, onSelect ? btn(S.selectText, onSelect, 'select') : null]}
          </View>
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

/* a photo dragged onto the page from the tray is the size of a single photo */
export const solo = (w: number) => cluster(1, w)[0];

/* After Lay out: the words and photos set as a page, dense like a printed page. The photos from one recording sit
   together beside its paragraph; photos dragged in from the tray sit where they were dropped. Lines are justified, so
   English lines up at both edges like Chinese. Drag any photo and the paragraphs reflow around it; where it ends up
   is kept. A photo carried in from the tray (preview) moves the words before it is let go. Tap a word to edit it. */
type Src = { item: number; part: number; from: number };          // which recording, or which photo's caption, a stretch of a paragraph is
export function Page({ items, photos, placed, moved, preview, voice, indent, onRename, ownTitle, title, meta, area, onDrag, onMove, onEdit, onMerge, onShare, onSelect, onOpen, chosen, onChoose, stickers, slap, bin, onSticker, onStickerDrag, locked, scroll }: {
  items: Said[]; photos: Pic[]; placed?: Placed[]; moved?: Record<string, Pos>; preview?: { pics: Pic[]; x: number; y: number } | null;
  voice?: boolean;                                                // voice bars at the top left of what was said (a setting)
  indent?: boolean;                                               // first-line indent (a setting)
  onRename?: (text: string) => void; ownTitle?: string;          // the title is renamed right where it is (empty: the date again)
  title: string; meta: string;
  area?: React.RefObject<View | null>;                           // the text area, for finding where a photo from the tray was dropped
  onDrag: (on: boolean) => void; onMove: (key: string, at: Pos) => void; onEdit: (item: number, part: number) => void;
  /* a long press lifts a paragraph: join it to the one above (the item that starts it) or below, share it, or select its words */
  onMerge?: (item: number) => void; onShare?: (item: number) => void; onSelect?: (text: string) => void;
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
  const face = useFace();
  const zh = useLang() === 'zh';
  const W = Dimensions.get('window').width - 2 * SZ.px;     // the page is today itself: no card, the full width
  const size = zh ? 14 : 15, lh = zh ? 21 : 19.5, gap = 17;
  const m = zh ? CN : SERIF;
  const run = (spots: Spot[]) => flow(paras, spots, W, m, size, lh, gap, heads, indent ? (zh ? size * 2 : adv(m, size, 'nnnn')) : 0, floats);

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
  const HEAD = 26, BAR = 30, TIME = 20;
  const heads = marks.map((mk) => (mk.head ? HEAD : 0) + (mk.bar ? BAR : mk.time ? TIME : 0));
  /* stickers the words go around; one being moved goes around where the fingers have it now */
  const [slid, setSlid] = useState<Sticker | null>(null);
  const [picked, setPicked] = useState<string | null>(null);     // the sticker tapped: its switch shows
  const floats: Float[] = [...(stickers ?? []).filter((st) => st.wrap && st.p >= 0 && st.id !== slid?.id), ...(slid && slid.p >= 0 ? [slid] : [])]
    .map((st) => ({ p: Math.min(st.p, Math.max(0, paras.length - 1)), pts: outlineOf(st) }));
  const e = PAD - (lh - size) / 2;
  const linesFor = (h: number) => Math.max(2, Math.round((h + 2 * e) / lh));

  /* each set that hasn't been taken apart is one block beside the start of its paragraph (the next set of the same
     paragraph below it), sets alternating right and left; its tiles are stretched to the block's whole lines */
  const [live, setLive] = useState<Record<string, Pos>>({});      // positions changed since this page was opened
  const pos: Record<string, Pos> = { ...moved, ...live };
  const [front, setFront] = useState('');           // the photo picked up last sits above the others
  const two = useSharedValue<Two>(NO_TWO);
  const [holding, setHolding] = useState<string | null>(null);   // a photo or sticker is held: the clear layer for a second finger is down
  const second = useMemo(() => Gesture.Pan().minDistance(0)
    .onStart((e) => { const t = two.get(); two.set({ ...t, on: !!t.id, x10: t.x1, y10: t.y1, x20: e.absoluteX, y20: e.absoluteY, x2: e.absoluteX, y2: e.absoluteY }); })
    .onUpdate((e) => { two.set({ ...two.get(), x2: e.absoluteX, y2: e.absoluteY }); })
    .onFinalize(() => { two.set({ ...two.get(), on: false }); }), [two]);
  useEffect(() => { if (scroll && Platform.OS !== 'web') second.blocksExternalGesture(scroll as never); }, [second, scroll]);
  /* a tapped tile: its photos by number */
  const opener = useRef({ items, placed, onOpen });
  useEffect(() => { opener.current = { items, placed, onOpen }; });
  const openTile = useCallback((key: string) => {
    const { items: its, placed: pl, onOpen: go } = opener.current, m = /^(\d+)-(\d+)$/.exec(key);
    const x = m ? its[+m[1]] : undefined;
    const idx = m ? (x?.kind === 'photos' ? x.parts[+m[2]]?.unit.idx ?? [] : []) : pl?.find((p) => p.id === key)?.idx ?? [];
    if (idx.length) go?.(idx);
  }, []);
  const blocks: { spot: Spot; ch: number; tiles: { key: string; pics: Pic[]; r: Rect }[] }[] = [];
  const singles: { key: string; pics: Pic[]; w: number; h: number; at: Pos }[] = [];
  const below: Record<number, number> = {};
  sets.forEach((st, n) => {
    const all = cluster(st.tiles.length, W);
    st.tiles.forEach((tl, i) => { const at = pos[tl.key]; if (at) singles.push({ key: tl.key, pics: tl.pics, w: at.w ?? all[i].w, h: all[i].h * (at.w ?? all[i].w) / all[i].w, at }); });
    const stay = st.tiles.filter((tl) => !pos[tl.key]);
    if (!stay.length) return;
    const ratio = Math.min(1.5, Math.max(0.6, st.tiles[0].pics[0]?.r ?? 1.33));
    const pw = Math.round(W * (st.paper === 'only' ? 0.78 : 0.42));
    const shape = st.paper && stay.length === 1 ? [{ x: 0, y: 0, w: pw, h: Math.round(pw * ratio) }] : cluster(stay.length, W);
    const cw = Math.max(...shape.map((r) => r.x + r.w)), ch = Math.max(...shape.map((r) => r.y + r.h));
    const k = below[st.para] ?? 0, rowsN = linesFor(ch);
    below[st.para] = k + rowsN;
    const bx = st.paper === 'only' ? Math.round((W - cw) / 2) : n % 2 ? 0 : W - cw;
    blocks.push({ spot: { key: `set${n}`, x: bx, w: cw, p: st.para, k, n: rowsN }, ch, tiles: stay.map((tl, i) => ({ ...tl, r: shape[i] })) });
  });
  const one = solo(W);
  for (const pl of placed ?? []) {
    const pics = pl.idx.map((k) => photos[k]).filter(Boolean);
    const at = pos[pl.id] ?? { x: 0, y: 0 };
    if (pics.length) singles.push({ key: pl.id, pics, w: at.w ?? one.w, h: one.h * (at.w ?? one.w) / one.w, at });
  }
  /* photos placed by hand: where they were put, in paragraph and line; one saved as a plain position (an older
     version, or just dropped from the tray) is placed against the page without the hand-placed photos */
  const base = run(blocks.map((b) => b.spot));
  const lastP = Math.max(0, paras.length - 1);
  const fresh: [string, Pos][] = [];
  const spots = [...blocks.map((b) => b.spot), ...singles.map((sg) => {
    if (sg.at.p !== undefined && sg.at.k !== undefined) return { key: sg.key, x: Math.min(sg.at.x, W - sg.w), w: sg.w, p: Math.min(sg.at.p, lastP), k: sg.at.k, n: linesFor(sg.h) };
    const sp = toSpot(sg.key, sg.at.x, sg.at.y, sg.w, sg.h, base, W, lh, size);
    fresh.push([sg.key, { ...sg.at, x: sp.x, p: sp.p, k: sp.k }]);
    return sp;
  })];
  const ghost = preview ? toSpot('preview', preview.x, preview.y, one.w, one.h, base, W, lh, size) : null;
  const { lines, rects, tops, starts, height } = run(ghost ? [...spots, ghost] : spots);
  /* where a finger is on the page is turned into a paragraph and line against the page as it stands, with every photo
     in its place except the one being held. (Measured against the page without the photos that had been moved, the
     paragraphs below a moved photo started too high, so a photo there landed lines away from the finger.) */
  const others = front ? run(spots.filter((sp) => sp.key !== front)) : { lines, rects, tops, starts, rows: run(spots).rows, height };
  const [naming, setNaming] = useState<string | null>(null);   // the title being renamed, in place
  const [lifted, setLifted] = useState<number | null>(null);   // the paragraph held up by a long press
  const [aimAt, setAimAt] = useState<number | null>(null);     // the paragraph it would join if let go now
  const tiles: { key: string; pics: Pic[]; r: Rect }[] = [];
  for (const b of blocks) {
    const r = rects[b.spot.key], sy = r.h / b.ch;
    for (const tl of b.tiles) tiles.push({ key: tl.key, pics: tl.pics, r: { x: r.x + tl.r.x, y: r.y + tl.r.y * sy, w: tl.r.w, h: tl.r.h * sy } });
  }
  for (const sg of singles) tiles.push({ key: sg.key, pics: sg.pics, r: rects[sg.key] });

  /* where each photo was when the finger went down; read only inside the gesture handlers */
  const now = useRef({ rects: {} as Record<string, Rect>, base, sizes: {} as Record<string, { w: number; h: number }> });
  const last = useRef<{ id: string; at: Pos } | null>(null);
  const moveTo = useRef(onMove);
  useEffect(() => {
    now.current = {
      rects: Object.fromEntries(tiles.map((tl) => [tl.key, tl.r])), base: others,
      sizes: Object.fromEntries([...singles.map((sg) => [sg.key, { w: sg.w, h: sg.h }]), ...blocks.flatMap((b) => b.tiles.map((tl) => [tl.key, { w: tl.r.w, h: tl.r.h }]))]),
    };
    moveTo.current = onMove;
  });
  /* positions read from an older version are saved once in paragraph and line */
  const freshKey = JSON.stringify(fresh);
  useEffect(() => { for (const [k, at] of JSON.parse(freshKey) as [string, Pos][]) moveTo.current(k, at); }, [freshKey]);
  const tied = useRef({ tops, starts, height, stickers });
  useEffect(() => { tied.current = { tops, starts, height, stickers }; });
  /* the photo under the finger: its size on the page when it was picked up */
  const held = useRef({ w: 0, h: 0 });
  /* the words reflow only when the photo's place really changes (its paragraph, line, or some points across), at most once a frame */
  const shown = useRef('');
  /* While a photo is held the words make room for it as it goes, in real time: each time its place changes (a line,
     or a side) the page reflows on the next frame, and a thin outline marks the place. Only the lines that move are
     redrawn, and photos and stickers whose place didn't change aren't touched, so this keeps up with the finger. */
  const frame = useRef(0);
  const place = useCallback((id: string, at: Pos, h: number) => {
    last.current = { id, at };
    const sig = `${id}|${at.p}|${at.k}|${at.x}|${at.w}`;
    if (sig === shown.current) return;
    shown.current = sig;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setLive((s) => ({ ...s, [id]: at })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lh, e]);
  const grab = useCallback((id: string) => {
    held.current = now.current.sizes[id] ?? { w: 0, h: 0 };
    shown.current = ''; last.current = null;
    setPicked(null); setFront(id); setHolding(id);
  }, []);
  const q = (v: number) => Math.round(v / 6) * 6;  // positions kept in steps of 6 points, so the words don't reflow for every pixel
  /* where the held photo is now (its top-left and width, from the gesture): the place the words make for it */
  const move = useCallback((id: string, x: number, y: number, w: number) => {
    const hd = held.current;
    const same = !hd.w || Math.abs(w - hd.w) < 0.5;
    const ww = same ? hd.w || w : q(w), h = hd.w ? hd.h * ww / hd.w : ww * 0.75;
    const sp = toSpot(id, x, y, ww, h, now.current.base, W, lh, size);
    /* the words go around the photo where the finger has it (in steps of a few points), so photo and words are one layer */
    place(id, { x: q(sp.x), y, p: sp.p, k: sp.k, w: ww }, h);
  }, [W, lh, size, place]);
  const drop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    setHolding(null);
    const lt = last.current;
    if (lt) { setLive((s) => ({ ...s, [lt.id]: lt.at })); moveTo.current(lt.id, lt.at); }
    last.current = null;
  }, []);

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
  const hold = (p: number) => (canLift ? () => { setAimAt(null); setLifted(p); } : undefined);
  const marked = (p: number) => !!chosen?.has(`t${srcs[p][0].item}`) || p === aimAt;
  const ink = useMemo(() => ({ fontSize: size, lineHeight: lh, color: t.ink, fontFamily: face.body }), [size, lh, t.ink, face.body]);
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
    const chars = toks.every((tk) => tk.s.length === 1);
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
      return <Word key={`${key}-${j}`} s={tk.s.trimEnd()} x={at} y={l.y} p={l.p} o={tk.o} ink={ink} tap={tap} hold={canHold ? press : undefined} />;
    })];
  };

  return (
    <View style={d.page}>
      {naming !== null ? (
        <TextInput value={naming} onChangeText={setNaming} autoFocus selectTextOnFocus returnKeyType="done" selectionColor={t.red} placeholder={title}
          placeholderTextColor={t.mut} onSubmitEditing={() => { onRename?.(naming); setNaming(null); }} onBlur={() => { onRename?.(naming); setNaming(null); }}
          style={[zh ? d.title : d.titleEn, { color: t.ink, fontFamily: face.title, padding: 0 }]} />
      ) : title ? (
        <Text onPress={onRename ? () => setNaming(ownTitle || title) : undefined} suppressHighlighting style={[zh ? d.title : d.titleEn, { color: t.ink, fontFamily: face.title }]}>{title}</Text>
      ) : null}
      {meta ? <Text style={[d.meta, { color: t.mut }]}>{meta}</Text> : null}
      <View ref={area} collapsable={false} style={{ height: Math.max(height, ...(stickers ?? []).map((st) => (st.p >= 0 ? (tops[Math.min(st.p, tops.length - 1)] ?? 0) : 0) + st.y + st.w)), marginTop: 12 }}>
        {marks.map((mk, pi) => (
          <React.Fragment key={`m${pi}`}>
            {mk.head ? <Text style={[d.head, { top: tops[pi], color: t.ink, fontFamily: face.title }]}>{mk.head}</Text> : null}
            {mk.bar || mk.time ? (
              <View style={[d.stamp, { top: tops[pi] + (mk.head ? HEAD : 0), height: mk.bar ? 22 : 16 }]}>
                {mk.time ? <Text style={[d.time, { color: t.mut }]}>{clock(mk.time)}</Text> : null}
                {mk.bar ? <VoiceBar bar={mk.bar} /> : null}
              </View>
            ) : null}
          </React.Fragment>
        ))}
        {lines.map(setLine)}
        {tiles.map((tl) => (
          <Movable key={tl.key} id={tl.key} pk={tl.pics.map((pc) => pc.file ?? pc.uri ?? pc.asset).join('|')} r={tl.r} z={tl.key === front ? 2 : 1} W={W} locked={locked || !!onChoose} block={scroll} grab={grab} move={move} drop={drop} open={onOpen ? openTile : undefined} two={two}>
            {tl.pics.length > 1 ? <Fluid pics={tl.pics} />
              : <Image source={src(tl.pics[0])} contentFit="cover" style={[StyleSheet.absoluteFill, { borderRadius: 8 }]} />}
          </Movable>
        ))}
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
              bin={bin} block={scroll} place={stick} carry={onStickerDrag} slide={slide} tap={setPicked} two={two} hold={setHolding} />
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
            <View style={[d.seg, { top: at - 44, left: Math.max(-8, Math.min(W - 176, st.x + st.w / 2 - 88)), backgroundColor: t.panel }]}>
              {seg(!!st.wrap, S.wrapOn, true)}{seg(!st.wrap, S.wrapOff, false)}
            </View>
          );
        })() : null}
        {holding ? <GestureDetector gesture={second}><View style={d.second} /></GestureDetector> : null}
        {lifted !== null && lifted < paras.length ? (() => {
          const p = lifted, put = () => { setLifted(null); setAimAt(null); };
          const first = srcs[p][0].item, next = srcs[p + 1]?.[0].item;
          return (
            <Lifted text={paras[p]} top={starts[p]} W={W} ink={ink} up={p > 0 && !!onMerge} down={next !== undefined && !!onMerge}
              onAim={(a) => setAimAt(a === 1 ? p - 1 : a === 2 ? p + 1 : null)}
              onUp={() => { put(); onMerge?.(first); }} onDown={() => { put(); if (next !== undefined) onMerge?.(next); }}
              onShare={onShare ? () => { put(); onShare(first); } : undefined} onSelect={onSelect ? () => { put(); onSelect(paras[p]); } : undefined}
              onClose={put} />
          );
        })() : null}
        {ghost && preview ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: rects.preview.x, top: rects.preview.y, width: rects.preview.w, height: rects.preview.h, zIndex: 3, opacity: 0.9 }}>
            {preview.pics.length > 1 ? <Mosaic pics={preview.pics} w={rects.preview.w} h={rects.preview.h} r={8} />
              : <Image source={src(preview.pics[0])} contentFit="cover" style={{ width: rects.preview.w, height: rects.preview.h, borderRadius: 8 }} />}
          </View>
        ) : null}
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
  head: { position: 'absolute', left: 0, fontSize: 14.5, lineHeight: 20, fontWeight: '600' },
  marker: { position: 'absolute', borderRadius: 3 },
  second: { position: 'absolute', left: -60, right: -60, top: -600, bottom: -900, zIndex: 9 },
  seg: { position: 'absolute', zIndex: 6, flexDirection: 'row', borderRadius: 17, padding: 3, gap: 2, width: 176, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  segBtn: { flex: 1, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dim: { position: 'absolute', left: -40, right: -40, top: -400, bottom: -800, opacity: 0.72, zIndex: 7 },
  lift: { position: 'absolute', left: -12, zIndex: 8, gap: 10 },
  liftCard: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  liftBar: { alignSelf: 'center', flexDirection: 'row', borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4 },
  liftBtn: { paddingHorizontal: 12, height: 36, justifyContent: 'center' },
  /* a sticker's shadow follows its own outline: on the phone from the picture's edge, on the web as a drop-shadow filter */
  stickerShadow: Platform.OS === 'web' ? ({ filter: 'drop-shadow(0 1.5px 2px rgba(0,0,0,0.18))' } as object)
    : { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2.5, shadowOffset: { width: 0, height: 1.5 } },
  pick: { position: 'absolute', zIndex: 5, borderWidth: 2, borderRadius: 10 },
  check: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkT: { fontSize: 12, fontWeight: '700', marginTop: -1 },
  stamp: { position: 'absolute', left: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { fontSize: 11.5, letterSpacing: 0.3, fontVariant: ['tabular-nums'] },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 22, paddingLeft: 3, paddingRight: 9, borderRadius: 11 },
  play: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tri: { width: 0, height: 0, marginLeft: 1.5, borderLeftWidth: 6, borderTopWidth: 4, borderBottomWidth: 4, borderLeftColor: '#fff', borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  pause: { flexDirection: 'row', gap: 2 },
  pauseBar: { width: 2, height: 7, borderRadius: 1, backgroundColor: '#fff' },
  waves: { flexDirection: 'row', alignItems: 'center', gap: 1.5, height: 12 },
  barT: { fontSize: 11, letterSpacing: 0.2, fontVariant: ['tabular-nums'] },
  tx: { fontSize: 16, lineHeight: 29 },
  txEn: { fontSize: 17.5, lineHeight: 27 },
  page: { paddingTop: 6 },
  title: { fontSize: 20, lineHeight: 28 },
  titleEn: { fontSize: 23, lineHeight: 28, letterSpacing: -0.2 },
  meta: { fontSize: 11.5, marginTop: 3 },
});
