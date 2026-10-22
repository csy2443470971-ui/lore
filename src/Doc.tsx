import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { CN, Metric, SERIF } from './metrics';
import { Mosaic } from './Photos';
import { Pic, Placed, Pos, Said } from './session';
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
      {items.map((x, i) => (x.kind === 'talk' && !x.text ? null : (
        <Text key={i} style={tx} onPress={onEdit && x.kind === 'talk' ? () => onEdit(i) : undefined}>
          {x.kind === 'talk' ? x.text : x.parts.map((p) => p.spoken ?? p.text).join(S.is === '是' ? '' : ' ')}
        </Text>
      )))}
    </View>
  );
}

/* ---------- flowing text: lines are broken in JS around the photos' rectangles ---------- */
type Rect = { x: number; y: number; w: number; h: number };
type Line = { x: number; y: number; s: string; p: number; o: number };   // p: paragraph, o: where in it the line starts

const adv = (m: Metric, size: number, s: string) => {
  let w = 0;
  for (const ch of s) w += (m.w[ch.codePointAt(0)!] ?? m.def) / m.upm * size;
  return w;
};
/* Chinese breaks between any two characters, other scripts between words */
const tokens = (s: string) => s.match(/[⺀-鿿豈-﫿　-〿＀-￯]|[^\s⺀-鿿豈-﫿　-〿＀-￯]+\s*|\s+/g) ?? [];
const CJK = /[\u3400-\u9fff]/;
const NO_START = /^[，。、！？；：）」』”’》,.!?;:)\]]/;

function flow(paras: string[], rects: Rect[], width: number, m: Metric, size: number, lh: number, gap: number) {
  const pad = 7, minSeg = size * 2.5;            // the gap kept around a photo, and the narrowest gap worth filling
  const lines: Line[] = [];
  const starts: number[] = [];
  let y = 0;
  const free = (y0: number, y1: number) => {
    let segs: [number, number][] = [[0, width]];
    for (const r of rects) {
      if (r.y - pad >= y1 || r.y + r.h + pad <= y0) continue;
      const a = r.x - pad, b = r.x + r.w + pad;
      segs = segs.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, Math.max(s, a)], [Math.min(e, b), e]] as [number, number][]));
    }
    return segs.filter(([s, e]) => e - s >= minSeg);
  };
  paras.forEach((p, pi) => {
    const tk = tokens(p);
    const at: number[] = [];
    let c = 0;
    for (const t of tk) { at.push(c); c += t.length; }
    let i = 0;
    starts.push(y);
    while (i < tk.length) {
      for (const [s, e] of free(y, y + lh)) {
        while (i < tk.length && /^\s+$/.test(tk[i])) i++;
        if (i >= tk.length) break;
        let acc = 0;
        const from = i;
        while (i < tk.length) {
          const w = adv(m, size, tk[i].trimEnd());
          const hang = NO_START.test(tk[i]) && acc + w <= e - s + size;    // let closing punctuation hang rather than start a line
          if (acc + w > e - s && !hang && i > from) break;
          if (acc + w > e - s && i === from && e - s < width - 1) break;   // a word too long for a narrow gap: try the next gap
          acc += adv(m, size, tk[i]); i++;
        }
        if (i > from) lines.push({ x: s, y, s: tk.slice(from, i).join('').trimEnd(), p: pi, o: at[from] });
      }
      y += lh;
    }
    y += gap;
  });
  const bottom = Math.max(y - gap, ...rects.map((r) => r.y + r.h));
  return { lines, starts, height: bottom };
}

/* one photo (or group) on the page that can be dragged anywhere; the words get out of its way.
   The responder is made once, so a drag isn't reset as the position updates under the finger. */
function Movable({ id, r, z, grab, drag, drop, children }: {
  id: string; r: Rect; z: number; grab: (id: string) => void; drag: (id: string, dx: number, dy: number) => void; drop: () => void; children: React.ReactNode;
}) {
  const lift = useState(() => new Animated.Value(1))[0];
  const pr = useMemo(() => {
    const settle = () => { drop(); Animated.spring(lift, { toValue: 1, useNativeDriver: true, friction: 6 }).start(); };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        grab(id);
        Haptics.selectionAsync().catch(() => {});
        Animated.spring(lift, { toValue: 1.04, useNativeDriver: true, friction: 6 }).start();
      },
      onPanResponderMove: (_, g) => drag(id, g.dx, g.dy),
      onPanResponderRelease: settle,
      onPanResponderTerminate: settle,
    });
  }, [id, grab, drag, drop, lift]);
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

/* After Lay out: the words and photos set as a page, dense like a printed page. The photos from one
   recording sit together beside its paragraph; photos dragged in from the tray sit where they were dropped.
   Drag any photo and the paragraphs reflow around it; where it ends up is kept. Tap a line to edit it. */
type Src = { item: number; part: number; from: number };          // which recording, or which photo's caption, a stretch of a paragraph is
export function Page({ items, photos, placed, moved, title, meta, area, onDrag, onMove, onEdit }: {
  items: Said[]; photos: Pic[]; placed?: Placed[]; moved?: Record<string, Pos>; title: string; meta: string;
  area?: React.RefObject<View | null>;                           // the text area, for finding where a photo from the tray was dropped
  onDrag: (on: boolean) => void; onMove: (key: string, at: Pos) => void; onEdit: (item: number, part: number) => void;
}) {
  const t = useT();
  const face = useFace();
  const zh = useLang() === 'zh';
  const W = Dimensions.get('window').width - 2 * SZ.px;     // the page is today itself: no card, the full width
  const size = zh ? 14 : 15, lh = zh ? 22 : 20.5, gap = 12;
  const m = zh ? CN : SERIF;

  /* one paragraph per recording; a recording about photos brings its photos (a group counts as one tile) */
  const paras: string[] = [];
  const srcs: Src[][] = [];
  const sets: { para: number; tiles: { key: string; pics: Pic[] }[] }[] = [];
  items.forEach((x, i) => {
    if (x.kind === 'talk') { if (x.text) { paras.push(x.text); srcs.push([{ item: i, part: -1, from: 0 }]); } return; }
    const tiles = x.parts.map((p, j) => ({ key: `${i}-${j}`, pics: p.unit.idx.map((k) => photos[k]).filter(Boolean) })).filter((tl) => tl.pics.length);
    for (let c = 0; c < tiles.length; c += 4) sets.push({ para: paras.length, tiles: tiles.slice(c, c + 4) });
    let text = '';                                  // captions join with a space, except next to Chinese
    srcs.push(x.parts.map((p, j) => {
      if (text && p.text && !CJK.test(text.slice(-1) + p.text[0])) text += ' ';
      const at = { item: i, part: j, from: text.length };
      text += p.text;
      return at;
    }));
    paras.push(text);
  });
  /* a tap on a line edits the words under the finger: their recording, or the caption of the photo they belong to */
  const tapAt = (l: Line, x: number) => {
    let o = l.o, w = 0;
    for (const ch of l.s) { const a = adv(m, size, ch); if (w + a / 2 > x) break; w += a; o += ch.length; }
    const sr = srcs[l.p].reduce((r, c) => (c.from <= o ? c : r), srcs[l.p][0]);
    onEdit(sr.item, sr.part);
  };

  /* where each photo is: where it was dragged to, or else each set beside the start of its paragraph (or under
     the set before it), sets alternating right and left */
  const [live, setLive] = useState<Record<string, Pos>>({});      // positions changed since this page was opened
  const pos = { ...moved, ...live };
  const [front, setFront] = useState('');           // the photo picked up last sits above the others
  const tiles: { key: string; pics: Pic[]; r: Rect }[] = [];
  for (const pl of placed ?? []) {
    const pics = pl.idx.map((k) => photos[k]).filter(Boolean);
    if (pics.length) tiles.push({ key: pl.id, pics, r: { ...solo(W), ...(pos[pl.id] ?? { x: 0, y: 0 }) } });
  }
  let prevPara = -1, prevBottom = 0;
  sets.forEach((st, n) => {
    const shape = cluster(st.tiles.length, W);
    const cw = Math.max(...shape.map((r) => r.x + r.w)), ch = Math.max(...shape.map((r) => r.y + r.h));
    const placedRects = tiles.map((tl) => tl.r);
    const at = flow(paras, placedRects, W, m, size, lh, gap).starts[st.para] ?? 0;
    const y0 = st.para === prevPara ? prevBottom + G * 2 : at + 3;
    const x0 = n % 2 ? 0 : W - cw;
    st.tiles.forEach((tl, i) => {
      const at2 = pos[tl.key];
      tiles.push({ key: tl.key, pics: tl.pics, r: at2 ? { ...shape[i], x: at2.x, y: at2.y } : { ...shape[i], x: x0 + shape[i].x, y: y0 + shape[i].y } });
    });
    prevPara = st.para; prevBottom = y0 + ch;
  });
  const { lines, height } = flow(paras, tiles.map((tl) => tl.r), W, m, size, lh, gap);

  /* where each photo was when the finger went down; read only inside the gesture handlers */
  const rects = useRef<Record<string, Rect>>({});
  const origin = useRef({ x: 0, y: 0 });
  const last = useRef<{ id: string; at: Pos } | null>(null);
  const moveTo = useRef(onMove);
  useEffect(() => { rects.current = Object.fromEntries(tiles.map((tl) => [tl.key, tl.r])); moveTo.current = onMove; });
  const grab = useCallback((id: string) => {
    const r = rects.current[id]; if (r) origin.current = { x: r.x, y: r.y };
    setFront(id); onDrag(true);
  }, [onDrag]);
  const drag = useCallback((id: string, dx: number, dy: number) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const w = rects.current[id]?.w ?? 0;
    const at = { x: Math.max(0, Math.min(W - w, origin.current.x + dx)), y: Math.max(0, origin.current.y + dy) };
    last.current = { id, at };
    setLive((s) => ({ ...s, [id]: at }));
  }, [W]);
  const drop = useCallback(() => {
    if (last.current) moveTo.current(last.current.id, last.current.at);
    last.current = null;
    onDrag(false);
  }, [onDrag]);

  return (
    <View style={d.page}>
      <Text style={[zh ? d.title : d.titleEn, { color: t.ink, fontFamily: face.title }]}>{title}</Text>
      {meta ? <Text style={[d.meta, { color: t.mut }]}>{meta}</Text> : null}
      <View ref={area} collapsable={false} style={{ height, marginTop: 12 }}>
        {lines.map((l, i) => (
          <Text key={i} numberOfLines={1} onPress={(e) => tapAt(l, e.nativeEvent.locationX)}
            style={{ position: 'absolute', left: l.x, top: l.y, fontSize: size, lineHeight: lh, color: t.ink, fontFamily: face.body }}>{l.s}</Text>
        ))}
        {tiles.map((tl) => (
          <Movable key={tl.key} id={tl.key} r={tl.r} z={tl.key === front ? 2 : 1} grab={grab} drag={drag} drop={drop}>
            {tl.pics.length > 1 ? <Mosaic pics={tl.pics} w={tl.r.w} h={tl.r.h} r={8} />
              : <Image source={src(tl.pics[0])} contentFit="cover" style={{ width: tl.r.w, height: tl.r.h, borderRadius: 8 }} />}
          </Movable>
        ))}
      </View>
    </View>
  );
}

const d = StyleSheet.create({
  tx: { fontSize: 16, lineHeight: 29 },
  txEn: { fontSize: 17.5, lineHeight: 27 },
  page: { paddingTop: 6 },
  title: { fontSize: 20, lineHeight: 28 },
  titleEn: { fontSize: 23, lineHeight: 28, letterSpacing: -0.2 },
  meta: { fontSize: 11.5, marginTop: 3 },
});
