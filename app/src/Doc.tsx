import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { hyphenateSync } from 'hyphen/en';
import { CN, Metric, SERIF } from './metrics';
import { Mosaic } from './Photos';
import { Pic, Placed, Pos, Said } from './session';
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

/* ---------- flowing text: lines are broken in JS around the photos, one paragraph at a time ---------- */
type Rect = { x: number; y: number; w: number; h: number };
type Tok = { s: string; o: number };              // a word or a Chinese character, and where it starts in its paragraph
type Line = { x: number; y: number; w: number; p: number; toks: Tok[]; last: boolean };   // w: the width of the gap it fills
/* where a photo, or a set of photos, sits: beside paragraph p, from its line k down, n lines tall */
type Spot = { key: string; x: number; w: number; p: number; k: number; n: number };

const PAD = 9;                                    // the space between a photo and the words, the same on every side

const adv = (m: Metric, size: number, s: string) => {
  let w = 0;
  for (const ch of s) w += (m.w[ch.codePointAt(0)!] ?? m.def) / m.upm * size;
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
function flow(paras: string[], spots: Spot[], width: number, m: Metric, size: number, lh: number, gap: number, heads: number[] = [], indent = 0) {
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
        segs = segs.flatMap(([s, f]) => (b <= s || a >= f ? [[s, f]] : [[s, Math.max(s, a)], [Math.min(f, b), f]] as [number, number][]));
      }
      return segs.filter(([s, f]) => f - s >= minSeg);
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

/* one photo (or group) on the page that can be dragged anywhere with one finger, and made bigger or smaller with two;
   the words get out of its way. The responder is made once, so a drag isn't reset as the position updates under the finger. */
function Movable({ id, r, z, grab, drag, pinch, drop, children }: {
  id: string; r: Rect; z: number; grab: (id: string) => void; drag: (id: string, dx: number, dy: number) => void;
  pinch: (id: string, scale: number) => void; drop: () => void; children: React.ReactNode;
}) {
  const lift = useState(() => new Animated.Value(1))[0];
  const pr = useMemo(() => {
    const two = { spread: 0 };                     // the distance between two fingers when the second one came down
    const settle = () => { two.spread = 0; drop(); Animated.spring(lift, { toValue: 1, useNativeDriver: true, friction: 6 }).start(); };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        grab(id);
        Haptics.selectionAsync().catch(() => {});
        Animated.spring(lift, { toValue: 1.04, useNativeDriver: true, friction: 6 }).start();
      },
      onPanResponderMove: (ev, g) => {
        const tt = ev.nativeEvent.touches;
        if (tt.length >= 2) {
          const dist = Math.hypot(tt[0].pageX - tt[1].pageX, tt[0].pageY - tt[1].pageY);
          if (!two.spread) two.spread = dist || 1;
          pinch(id, dist / two.spread);
        } else if (!two.spread) drag(id, g.dx, g.dy);   // once pinched, lifting one finger doesn't make the photo jump
      },
      onPanResponderRelease: settle,
      onPanResponderTerminate: settle,
    });
  }, [id, grab, drag, pinch, drop, lift]);
  return (
    <Animated.View {...pr.panHandlers} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, zIndex: z, transform: [{ scale: lift }] }}>
      {/* the photo itself takes no touches: on the web an <img> would start the browser's own image drag and end ours */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>{children}</View>
    </Animated.View>
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
export function Page({ items, photos, placed, moved, preview, voice, indent, onTitle, title, meta, area, onDrag, onMove, onEdit }: {
  items: Said[]; photos: Pic[]; placed?: Placed[]; moved?: Record<string, Pos>; preview?: { pics: Pic[]; x: number; y: number } | null;
  voice?: boolean;                                                // voice bars at the top left of what was said (a setting)
  indent?: boolean;                                               // first-line indent (a setting)
  onTitle?: () => void;                                           // the date at the top: choose which day the page belongs to
  title: string; meta: string;
  area?: React.RefObject<View | null>;                           // the text area, for finding where a photo from the tray was dropped
  onDrag: (on: boolean) => void; onMove: (key: string, at: Pos) => void; onEdit: (item: number, part: number) => void;
}) {
  const t = useT();
  const face = useFace();
  const zh = useLang() === 'zh';
  const W = Dimensions.get('window').width - 2 * SZ.px;     // the page is today itself: no card, the full width
  const size = zh ? 14 : 15, lh = zh ? 21 : 19.5, gap = 17;
  const m = zh ? CN : SERIF;
  const run = (spots: Spot[]) => flow(paras, spots, W, m, size, lh, gap, heads, indent ? size * (zh ? 2 : 1.25) : 0);

  /* one paragraph per recording; a recording about photos brings its photos (a group counts as one tile) */
  const paras: string[] = [];
  const srcs: Src[][] = [];
  const sets: { para: number; tiles: { key: string; pics: Pic[] }[] }[] = [];
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
    for (let c = 0; c < tiles.length; c += 4) sets.push({ para: paras.length, tiles: tiles.slice(c, c + 4) });
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
  const e = PAD - (lh - size) / 2;
  const linesFor = (h: number) => Math.max(2, Math.round((h + 2 * e) / lh));

  /* each set that hasn't been taken apart is one block beside the start of its paragraph (the next set of the same
     paragraph below it), sets alternating right and left; its tiles are stretched to the block's whole lines */
  const [live, setLive] = useState<Record<string, Pos>>({});      // positions changed since this page was opened
  const pos: Record<string, Pos> = { ...moved, ...live };
  const [front, setFront] = useState('');           // the photo picked up last sits above the others
  const blocks: { spot: Spot; ch: number; tiles: { key: string; pics: Pic[]; r: Rect }[] }[] = [];
  const singles: { key: string; pics: Pic[]; w: number; h: number; at: Pos }[] = [];
  const below: Record<number, number> = {};
  sets.forEach((st, n) => {
    const all = cluster(st.tiles.length, W);
    st.tiles.forEach((tl, i) => { const at = pos[tl.key]; if (at) singles.push({ key: tl.key, pics: tl.pics, w: at.w ?? all[i].w, h: all[i].h * (at.w ?? all[i].w) / all[i].w, at }); });
    const stay = st.tiles.filter((tl) => !pos[tl.key]);
    if (!stay.length) return;
    const shape = cluster(stay.length, W);
    const cw = Math.max(...shape.map((r) => r.x + r.w)), ch = Math.max(...shape.map((r) => r.y + r.h));
    const k = below[st.para] ?? 0, rowsN = linesFor(ch);
    below[st.para] = k + rowsN;
    blocks.push({ spot: { key: `set${n}`, x: n % 2 ? 0 : W - cw, w: cw, p: st.para, k, n: rowsN }, ch, tiles: stay.map((tl, i) => ({ ...tl, r: shape[i] })) });
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
  const { lines, rects, tops, height } = run(ghost ? [...spots, ghost] : spots);
  const tiles: { key: string; pics: Pic[]; r: Rect }[] = [];
  for (const b of blocks) {
    const r = rects[b.spot.key], sy = r.h / b.ch;
    for (const tl of b.tiles) tiles.push({ key: tl.key, pics: tl.pics, r: { x: r.x + tl.r.x, y: r.y + tl.r.y * sy, w: tl.r.w, h: tl.r.h * sy } });
  }
  for (const sg of singles) tiles.push({ key: sg.key, pics: sg.pics, r: rects[sg.key] });

  /* where each photo was when the finger went down; read only inside the gesture handlers */
  const now = useRef({ rects: {} as Record<string, Rect>, base, sizes: {} as Record<string, { w: number; h: number }> });
  const origin = useRef({ x: 0, y: 0 });
  const last = useRef<{ id: string; at: Pos } | null>(null);
  const moveTo = useRef(onMove);
  useEffect(() => {
    now.current = {
      rects: Object.fromEntries(tiles.map((tl) => [tl.key, tl.r])), base,
      sizes: Object.fromEntries([...singles.map((sg) => [sg.key, { w: sg.w, h: sg.h }]), ...blocks.flatMap((b) => b.tiles.map((tl) => [tl.key, { w: tl.r.w, h: tl.r.h }]))]),
    };
    moveTo.current = onMove;
  });
  /* positions read from an older version are saved once in paragraph and line */
  const freshKey = JSON.stringify(fresh);
  useEffect(() => { for (const [k, at] of JSON.parse(freshKey) as [string, Pos][]) moveTo.current(k, at); }, [freshKey]);
  const grab = useCallback((id: string) => {
    const r = now.current.rects[id]; if (r) origin.current = { x: r.x, y: r.y };
    setFront(id); onDrag(true);
  }, [onDrag]);
  const drag = useCallback((id: string, dx: number, dy: number) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const sz = now.current.sizes[id] ?? { w: 0, h: 0 };
    const y = Math.max(0, origin.current.y + dy);
    const sp = toSpot(id, origin.current.x + dx, y, sz.w, sz.h, now.current.base, W, lh, size);
    const at = { x: sp.x, y, p: sp.p, k: sp.k, w: sz.w };
    last.current = { id, at };
    setLive((s) => ({ ...s, [id]: at }));
  }, [W, lh, size]);
  /* two fingers: the photo grows or shrinks from its top-left corner, between a quarter of the page and all of it */
  const pinch = useCallback((id: string, scale: number) => {
    const sz = now.current.sizes[id] ?? { w: 0, h: 0 };
    if (!sz.w || !Number.isFinite(scale)) return;
    const w = Math.round(Math.max(W * 0.25, Math.min(W, sz.w * scale))), h = sz.h * w / sz.w;
    const sp = toSpot(id, Math.min(origin.current.x, W - w), origin.current.y, w, h, now.current.base, W, lh, size);
    const at = { x: sp.x, y: origin.current.y, p: sp.p, k: sp.k, w };
    last.current = { id, at };
    setLive((s) => ({ ...s, [id]: at }));
  }, [W, lh, size]);
  const drop = useCallback(() => {
    if (last.current) moveTo.current(last.current.id, last.current.at);
    last.current = null;
    onDrag(false);
  }, [onDrag]);

  /* a tap edits the words under the finger: their recording, or the caption of the photo they belong to */
  const edit = (p: number, o: number) => { const sr = srcs[p].reduce((r, c) => (c.from <= o ? c : r), srcs[p][0]); onEdit(sr.item, sr.part); };
  const ink = { position: 'absolute' as const, fontSize: size, lineHeight: lh, color: t.ink, fontFamily: face.body };
  /* justified: the room left on a line goes between its words (or characters); the last line of a paragraph, and a
     line where the gaps would grow wide, stay set to the left */
  const setLine = (l: Line, li: number) => {
    const toks = l.toks.map((tk) => ({ ...tk, w: adv(m, size, tk.s.trimEnd()), full: adv(m, size, tk.s) }));
    const natural = toks.reduce((a, tk, j) => a + (j === toks.length - 1 ? tk.w : tk.full), 0);
    const cuts = toks.slice(1).filter((tk) => !NO_START.test(tk.s)).length;
    const chars = toks.every((tk) => tk.s.length === 1);
    const room = l.w - natural;
    const narrow = l.w < W * 0.6;                   // a column beside a photo: its edge faces the photo, so it stretches further
    const each = !l.last && cuts > 0 && room > 0 && room / cuts <= size * (chars ? 0.3 : narrow ? 1.5 : 0.6) ? room / cuts : 0;
    if (chars) {
      /* letter spacing also follows the last character, so the room is shared by every character, less a little slack;
         a line whose closing punctuation hangs past the edge is drawn a hair tighter instead, so it is never cut off */
      const ls = each ? Math.max(0, (room - 2) / toks.length) : room < 0 ? (room - 1) / toks.length : 0;
      const step = (x: number) => Math.max(0, Math.min(toks.length - 1, Math.floor(x / ((natural / toks.length) + ls))));
      return (
        <Text key={li} numberOfLines={1} ellipsizeMode="clip" onPress={(ev) => edit(l.p, toks[step(ev.nativeEvent.locationX)].o)}
          style={[ink, { left: l.x, top: l.y, letterSpacing: ls }]}>{toks.map((tk) => tk.s).join('')}</Text>
      );
    }
    let x = l.x;
    return toks.map((tk, j) => {
      const at = x;
      x += tk.full + (j < toks.length - 1 && !NO_START.test(toks[j + 1].s) ? each : 0);
      return <Text key={`${li}-${j}`} numberOfLines={1} onPress={() => edit(l.p, tk.o)} style={[ink, { left: at, top: l.y }]}>{tk.s.trimEnd()}</Text>;
    });
  };

  return (
    <View style={d.page}>
      {title ? <Text onPress={onTitle} suppressHighlighting style={[zh ? d.title : d.titleEn, { color: t.ink, fontFamily: face.title }]}>{title}{onTitle ? <Text style={{ fontSize: 13, color: t.mut }}>  ▾</Text> : null}</Text> : null}
      {meta ? <Text style={[d.meta, { color: t.mut }]}>{meta}</Text> : null}
      <View ref={area} collapsable={false} style={{ height, marginTop: 12 }}>
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
          <Movable key={tl.key} id={tl.key} r={tl.r} z={tl.key === front ? 2 : 1} grab={grab} drag={drag} pinch={pinch} drop={drop}>
            {tl.pics.length > 1 ? <Mosaic pics={tl.pics} w={tl.r.w} h={tl.r.h} r={8} />
              : <Image source={src(tl.pics[0])} contentFit="cover" style={{ width: tl.r.w, height: tl.r.h, borderRadius: 8 }} />}
          </Movable>
        ))}
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
