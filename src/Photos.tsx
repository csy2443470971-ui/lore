import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

/* Today's photos on the writing page. Few photos stay big (three across up to three, four across up to eight,
   then five); only past three rows do they sit in a white window that scrolls and shows three and a half rows.
   Photos already on the page are left out. Long-press one to drag it onto the page, or to delete it. */
export function Tray({ photos, groups, skip, width, select, sel, onToggle, onLong, onRelease, cur }: {
  photos: Pic[]; groups: number[][]; skip?: Set<number>; width: number; select: boolean; sel: number[]; onToggle: (i: number) => void;
  onLong: (u: Unit, x: number, y: number) => void; onRelease: () => void; cur: number;
}) {
  const t = useT();
  const box = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const units = unitsOf(photos.length, groups).filter((u) => !skip?.has(u.idx[0]));
  const cols = photos.length <= 3 ? 3 : photos.length <= 8 ? 4 : 5;
  /* count rows the way flex-wrap lays them out: a group takes two cells and moves down if it doesn't fit */
  const rowOf: number[] = [];
  let rows = units.length ? 1 : 0, used = 0;
  units.forEach(() => { if (used + 1 > cols) { rows++; used = 0; } used += 1; rowOf.push(rows - 1); });   // a group is one stack, one cell
  const win = rows > 3;
  const gap = SZ.tileGap, pad = win ? 8 : 0;
  const tile = (width - pad * 2 - gap * (cols - 1)) / cols;
  const r = tile > 90 ? 14 : SZ.tileR;
  const h = win ? pad + 3 * (tile + gap) + tile * 0.5 : rows * tile + (rows - 1) * gap;
  const grouped = new Set(groups.flat());
  const curRow = cur >= 0 ? rowOf[cur] : -1;
  useEffect(() => {
    if (win && curRow >= 0) box.current?.scrollTo({ y: Math.max(0, (curRow - 1) * (tile + gap)), animated: true });
  }, [win, curRow, tile, gap]);
  const ring = <View style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 2.5, borderColor: t.ink }]} />;
  return (
    <View style={[{ height: h, overflow: 'hidden' }, win && { backgroundColor: t.panel, borderRadius: SZ.panelR }]}>
      <ScrollView ref={box} scrollEnabled={win} nestedScrollEnabled contentContainerStyle={{ padding: pad, flexDirection: 'row', flexWrap: 'wrap', gap }} showsVerticalScrollIndicator={false}>
        {units.map((u, n) => {
          const dim = cur >= 0 && n !== cur ? 0.45 : 1;
          if (u.idx.length > 1) {
            return (
              <Pressable key={'g' + u.idx[0]} disabled={select} delayLongPress={350} onLongPress={(e) => onLong(u, e.nativeEvent.pageX, e.nativeEvent.pageY)} onPressOut={onRelease} style={{ opacity: select ? 0.5 : dim }}>
                <Stack pics={u.idx.map((i) => photos[i])} size={tile} r={r} />
                <Badge text={label(u)} mid={tile > 90} />
                {n === cur ? ring : null}
              </Pressable>
            );
          }
          const i = u.idx[0], on = sel.includes(i);
          return (
            <Pressable key={i} disabled={select && grouped.has(i)} onPress={() => select && onToggle(i)} delayLongPress={350} onLongPress={(e) => !select && onLong(u, e.nativeEvent.pageX, e.nativeEvent.pageY)} onPressOut={onRelease} style={{ width: tile, height: tile, opacity: dim }}>
              <Image source={src(photos[i])} contentFit="cover" style={{ width: tile, height: tile, borderRadius: r }} />
              <Badge text={String(i + 1)} mid={tile > 90} />
              {on || n === cur ? ring : null}
              {on ? <View style={[g.check, { backgroundColor: t.ink }]}><Svg width={16} height={16} viewBox="0 0 16 16"><Path d="M4.5 8.2l2.3 2.3 4.7-4.9" stroke={t.b} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg></View> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const g = StyleSheet.create({
  badge: { position: 'absolute', left: 3, bottom: 3, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeMid: { left: 7, bottom: 7, height: 22, minWidth: 22, paddingHorizontal: 7, borderRadius: 11 },
  check: { position: 'absolute', right: 4, top: 4, width: 16, height: 16, borderRadius: 8 },
});
