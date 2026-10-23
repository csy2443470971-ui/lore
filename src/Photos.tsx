import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SharedValue, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { Pic, Unit, unitsOf } from './session';
import { SZ } from './theme';
import { useT } from './ui';

export const src = (p: Pic) => (p.uri ? { uri: p.uri } : p.asset);

/* a group shown as one tile: up to four photos in a little mosaic */
/* a group in the tray: its photos stacked, the top one straight and the ones behind turned a little,
   so their corners show on the left and right and it reads as several photos, not one */
export function Stack({ pics, size, r }: { pics: Pic[]; size: number; r: number }) {
  const t = useT();
  const card = Math.round(size * 0.78);
  const back = pics.length >= 3 ? [{ p: pics[2], rot: '11deg', dx: size * 0.08 }, { p: pics[1], rot: '-11deg', dx: -size * 0.08 }]
    : [{ p: pics[1], rot: '-11deg', dx: -size * 0.07 }];
  const layer = (p: Pic, rot: string, dx: number) => (
    <View style={[st.layer, { width: card, height: card, borderRadius: r, borderColor: t.b, transform: [{ translateX: dx }, { rotate: rot }] }]}>
      <Image source={src(p)} contentFit="cover" style={{ width: '100%', height: '100%', borderRadius: r - 1 }} />
    </View>
  );
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {back.map((b, i) => <View key={i} style={StyleSheet.absoluteFill}><View style={st.center}>{layer(b.p, b.rot, b.dx)}</View></View>)}
      {layer(pics[0], pics.length >= 3 ? '0deg' : '3deg', pics.length >= 3 ? 0 : size * 0.03)}
    </View>
  );
}

const st = StyleSheet.create({
  layer: { overflow: 'hidden', borderWidth: 1.5, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export function Mosaic({ pics, w, h, r }: { pics: Pic[]; w: number; h: number; r: number }) {
  const t = useT();
  const four = pics.length >= 4, list = pics.slice(0, four ? 4 : 2);
  return (
    <View style={{ width: w, height: h, borderRadius: r, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', gap: 2, backgroundColor: t.gray }}>
      {list.map((p, i) => <Image key={i} source={src(p)} contentFit="cover" style={{ width: (w - 2) / 2, height: four ? (h - 2) / 2 : h }} />)}
    </View>
  );
}

export function Badge({ text, mid }: { text: string; mid?: boolean }) {
  const t = useT();
  return (
    <View style={[g.badge, mid && g.badgeMid, { backgroundColor: t.dark ? 'rgba(18,18,17,0.82)' : 'rgba(255,255,255,0.94)' }]}>
      <Text style={{ color: t.ink, fontSize: mid ? 12.5 : 11.5, fontVariant: ['tabular-nums'] }}>{text}</Text>
    </View>
  );
}

export const label = (u: Unit) => (u.idx.length > 1 ? `${u.idx[0] + 1}–${u.idx[u.idx.length - 1] + 1}` : String(u.idx[0] + 1));

/* Every photo of the day, as small square thumbnails, five to a row, numbered. A photo already on the page is dimmed and
   marked. A tap opens a photo to look at and edit; a long press lifts it, and it follows the finger (moved by the
   screen, not the page) onto the words, into a gap between paragraphs, or back; let go without moving and the menu opens. */
export type Lift = {
  gx: SharedValue<number>; gy: SharedValue<number>;                     // the finger, on the screen: the carried photo is drawn there
  start: (u: Unit, x: number, y: number, tile: number, fx: number, fy: number) => void;   // the long press took hold (fx, fy: where on the thumbnail)
  move: (x: number, y: number) => void;
  end: (x: number, y: number) => void;                                  // the finger came up
  stop: () => void;                                                     // the touch was taken away
};
export const COLS = 5;
export function Tray({ photos, groups, used, width, select, sel, onToggle, onOpen, lift }: {
  photos: Pic[]; groups: number[][]; used: Set<number>; width: number; select: boolean; sel: number[]; onToggle: (i: number) => void;
  onOpen: (idx: number[]) => void; lift: Lift;
}) {
  const gap = SZ.tileGap + 1;
  const tile = Math.floor((width - gap * (COLS - 1)) / COLS);
  const units = unitsOf(photos.length, groups);
  const grouped = new Set(groups.flat());
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {units.map((u) => (
        <TrayTile key={u.idx.join('-')} u={u} photos={photos} tile={tile} used={used.has(u.idx[0])} select={select} picked={sel.includes(u.idx[0])}
          locked={select && (grouped.has(u.idx[0]) || used.has(u.idx[0]))} onToggle={onToggle} onOpen={onOpen} lift={lift} />
      ))}
    </View>
  );
}

function TrayTile({ u, photos, tile, used, select, picked, locked, onToggle, onOpen, lift }: {
  u: Unit; photos: Pic[]; tile: number; used: boolean; select: boolean; picked: boolean; locked: boolean;
  onToggle: (i: number) => void; onOpen: (idx: number[]) => void; lift: Lift;
}) {
  const t = useT();
  const r = tile > 90 ? 14 : SZ.tileR;
  const it = useRef({ u, select, locked, onToggle, onOpen, lift, tile });
  useEffect(() => { it.current = { u, select, locked, onToggle, onOpen, lift, tile }; });
  const onTap = useCallback(() => {
    const c = it.current;
    if (c.select) { if (!c.locked && c.u.idx.length === 1) c.onToggle(c.u.idx[0]); return; }
    c.onOpen(c.u.idx);
  }, []);
  const onLift = useCallback((x: number, y: number, fx: number, fy: number) => { const c = it.current; c.lift.start(c.u, x, y, c.tile, fx, fy); }, []);
  const onMove = useCallback((x: number, y: number) => it.current.lift.move(x, y), []);
  const onEnd = useCallback((x: number, y: number) => it.current.lift.end(x, y), []);
  const onStop = useCallback(() => it.current.lift.stop(), []);
  const { gx, gy } = lift;
  const sent = useSharedValue({ x: 0, y: 0 });
  /* the handlers only run during a gesture, never while rendering */
  /* eslint-disable react-hooks/refs */
  const gesture = useMemo(() => {
    const tap = Gesture.Tap().maxDuration(270).maxDistance(12).onEnd((_e, ok) => { if (ok) scheduleOnRN(onTap); });
    const pan = Gesture.Pan().enabled(!select).activateAfterLongPress(280)
      .onStart((e) => { gx.set(e.absoluteX); gy.set(e.absoluteY); sent.set({ x: e.absoluteX, y: e.absoluteY }); scheduleOnRN(onLift, e.absoluteX, e.absoluteY, Math.max(0, Math.min(1, e.x / tile)), Math.max(0, Math.min(1, e.y / tile))); })
      .onUpdate((e) => {
        gx.set(e.absoluteX); gy.set(e.absoluteY);                       // the photo follows the finger on the screen's own thread
        const l = sent.get();
        if (Math.abs(e.absoluteX - l.x) + Math.abs(e.absoluteY - l.y) >= 3) { sent.set({ x: e.absoluteX, y: e.absoluteY }); scheduleOnRN(onMove, e.absoluteX, e.absoluteY); }
      })
      .onEnd((e) => { scheduleOnRN(onEnd, e.absoluteX, e.absoluteY); })
      .onFinalize((_e, ok) => { if (!ok) scheduleOnRN(onStop); });
    return Gesture.Race(tap, pan);
  }, [select, tile, gx, gy, sent, onTap, onLift, onMove, onEnd, onStop]);
  /* eslint-enable react-hooks/refs */
  const ring = <View style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 2.5, borderColor: t.ink }]} />;
  const group = u.idx.length > 1;
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width: tile, height: tile, opacity: select && locked ? 0.4 : used ? 0.55 : 1 }}>
        {group ? <Stack pics={u.idx.map((i) => photos[i])} size={tile} r={r} />
          : <Image source={src(photos[u.idx[0]])} contentFit="cover" style={{ width: tile, height: tile, borderRadius: r }} />}
        <Badge text={label(u)} mid={tile > 90} />
        {picked ? ring : null}
        {picked ? <View style={[g.check, { backgroundColor: t.ink }]}><Svg width={16} height={16} viewBox="0 0 16 16"><Path d="M4.5 8.2l2.3 2.3 4.7-4.9" stroke={t.b} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg></View>
          : used && !select ? <View style={[g.check, { backgroundColor: t.ink, opacity: 0.8 }]}><Svg width={16} height={16} viewBox="0 0 16 16"><Path d="M4.5 8.2l2.3 2.3 4.7-4.9" stroke={t.b} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg></View> : null}
      </View>
    </GestureDetector>
  );
}

const g = StyleSheet.create({
  badge: { position: 'absolute', left: 3, bottom: 3, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeMid: { left: 7, bottom: 7, height: 22, minWidth: 22, paddingHorizontal: 7, borderRadius: 11 },
  check: { position: 'absolute', right: 4, top: 4, width: 16, height: 16, borderRadius: 8 },
});
