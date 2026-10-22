import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { CN, Metric, SERIF } from './metrics';
import { Mosaic } from './Photos';
import { Pic, Said } from './session';
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
   the spoken numbers ("one is…") stay in the text and are matched to photos at Lay out. */
export function Stream({ items }: { items: Said[] }) {
  const S = useS();
  const tx = useTx();
  return (
    <View style={{ gap: 16 }}>
      {items.map((x, i) => (
        <Text key={i} style={tx}>
          {x.kind === 'talk' ? x.text : x.parts.map((p) => p.spoken ?? p.text).join(S.is === '是' ? '' : ' ')}
        </Text>
      ))}
    </View>
  );
}

/* ---------- flowing text: lines are broken in JS around the photos' rectangles ---------- */
type Rect = { x: number; y: number; w: number; h: number };
type Line = { x: number; y: number; s: string };

const adv = (m: Metric, size: number, s: string) => {
  let w = 0;
  for (const ch of s) w += (m.w[ch.codePointAt(0)!] ?? m.def) / m.upm * size;
  return w;
};
/* Chinese breaks between any two characters, other scripts between words */
const tokens = (s: string) => s.match(/[⺀-鿿豈-﫿　-〿＀-￯]|[^\s⺀-鿿豈-﫿　-〿＀-￯]+\s*|\s+/g) ?? [];
const NO_START = /^[，。、！？；：）」』”’》,.!?;:)\]]/;

function flow(paras: string[], rects: Rect[], width: number, m: Metric, size: number, lh: number, gap: number) {
  const pad = 12, minSeg = size * 2.5;
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
  for (const p of paras) {
    const tk = tokens(p);
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
        if (i > from) lines.push({ x: s, y, s: tk.slice(from, i).join('').trimEnd() });
      }
      y += lh;
    }
    y += gap;
  }
  const bottom = Math.max(y - gap, ...rects.map((r) => r.y + r.h));
  return { lines, starts, height: bottom };
}

/* one photo (or group) on the page that can be dragged anywhere; the words get out of its way.
   The responder is made once, so a drag isn't reset as the position updates under the finger. */
function Movable({ id, r, grab, drag, drop, children }: {
  id: string; r: Rect; grab: (id: string) => void; drag: (id: string, dx: number, dy: number) => void; drop: () => void; children: React.ReactNode;
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
    <Animated.View {...pr.panHandlers} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, transform: [{ scale: lift }] }}>
      {children}
    </Animated.View>
  );
}

/* After Lay out: the words and photos set as a page. Drag a photo and the paragraphs reflow around it. */
export function Page({ items, photos, title, meta, onDrag }: { items: Said[]; photos: Pic[]; title: string; meta: string; onDrag: (on: boolean) => void }) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const zh = useLang() === 'zh';
  const W = Dimensions.get('window').width - 2 * SZ.px - 40;
  const size = zh ? 16 : 17.5, lh = zh ? 29 : 27, gap = 14;
  const m = zh ? CN : SERIF;

  /* paragraphs, and the photo (or group) each caption belongs to */
  const paras: string[] = [];
  const pics: { key: string; para: number; pics: Pic[] }[] = [];
  items.forEach((x, i) => {
    if (x.kind === 'talk') { paras.push(x.text); return; }
    x.parts.forEach((p, j) => {
      const ps = p.unit.idx.map((k) => photos[k]).filter(Boolean);
      if (ps.length) pics.push({ key: `${i}-${j}`, para: paras.length, pics: ps });
      paras.push(p.text);
    });
  });

  /* where each photo starts: alternating sides, each beside the start of its own caption */
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  const [touched, setTouched] = useState(false);
  const rects: Rect[] = [];
  pics.forEach((p, n) => {
    const w = Math.round(W * (p.pics.length > 1 ? 0.62 : 0.5));
    const h = Math.round(p.pics.length >= 4 ? w : p.pics.length > 1 ? w / 2 : w * 0.8);
    const at = moved[p.key];
    if (at) { rects.push({ x: at.x, y: at.y, w, h }); return; }
    const y = flow(paras, rects, W, m, size, lh, gap).starts[p.para] ?? 0;
    rects.push({ x: n % 2 ? 0 : W - w, y: y + 4, w, h });
  });
  const { lines, height } = flow(paras, rects, W, m, size, lh, gap);

  /* where each photo was when the finger went down; read only inside the gesture handlers */
  const placed = useRef<Record<string, Rect>>({});
  const origin = useRef({ x: 0, y: 0 });
  useEffect(() => { placed.current = Object.fromEntries(pics.map((p, n) => [p.key, rects[n]])); });
  const grab = useCallback((id: string) => {
    const r = placed.current[id]; if (r) origin.current = { x: r.x, y: r.y };
    setTouched(true); onDrag(true);
  }, [onDrag]);
  const drag = useCallback((id: string, dx: number, dy: number) => {
    const w = placed.current[id]?.w ?? 0;
    setMoved((s) => ({ ...s, [id]: { x: Math.max(0, Math.min(W - w, origin.current.x + dx)), y: Math.max(0, origin.current.y + dy) } }));
  }, [W]);
  const drop = useCallback(() => onDrag(false), [onDrag]);

  return (
    <View style={[d.page, { backgroundColor: t.panel }]}>
      <Text style={[zh ? d.title : d.titleEn, { color: t.ink, fontFamily: face.title }]}>{title}</Text>
      <Text style={[d.meta, { color: t.mut }]}>{meta}</Text>
      {pics.length && !touched ? <Text style={[d.hint, { color: t.mut }]}>{S.dragHint}</Text> : null}
      <View style={{ height, marginTop: 20 }}>
        {lines.map((l, i) => (
          <Text key={i} numberOfLines={1} style={{ position: 'absolute', left: l.x, top: l.y, fontSize: size, lineHeight: lh, color: t.ink, fontFamily: face.body }}>{l.s}</Text>
        ))}
        {pics.map((p, n) => (
          <Movable key={p.key} id={p.key} r={rects[n]} grab={grab} drag={drag} drop={drop}>
            {p.pics.length > 1 ? <Mosaic pics={p.pics} w={rects[n].w} h={rects[n].h} r={14} />
              : <Image source={src(p.pics[0])} contentFit="cover" style={{ width: rects[n].w, height: rects[n].h, borderRadius: 14 }} />}
          </Movable>
        ))}
      </View>
    </View>
  );
}

const d = StyleSheet.create({
  tx: { fontSize: 16, lineHeight: 29 },
  txEn: { fontSize: 17.5, lineHeight: 27 },
  page: { borderRadius: SZ.panelR, padding: 20 },
  title: { fontSize: 25, lineHeight: 35 },
  titleEn: { fontSize: 29, lineHeight: 35, letterSpacing: -0.3 },
  meta: { fontSize: 13, marginTop: 6 },
  hint: { fontSize: 12.5, marginTop: 10 },
});
