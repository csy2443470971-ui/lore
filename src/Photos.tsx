import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pic, Said, Unit, unitsOf } from './session';
import { SZ } from './theme';
import { EASE, Glow, RecState, Round, TalkKey, useFace, useS, useT, useTimer } from './ui';

const src = (p: Pic) => (p.uri ? { uri: p.uri } : p.asset);

/* a full screen that slides in from the right */
function Screen({ open, children }: { open: boolean; children: React.ReactNode }) {
  const t = useT();
  const W = Dimensions.get('window').width;
  const x = useState(() => new Animated.Value(open ? 0 : W))[0];
  useEffect(() => { Animated.timing(x, { toValue: open ? 0 : W, duration: 420, easing: EASE, useNativeDriver: true }).start(); }, [open, W, x]);
  return (
    <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: t.b, transform: [{ translateX: x }] }]}>
      {children}
    </Animated.View>
  );
}

/* a group shown as one tile: up to four photos in a little mosaic */
function Mosaic({ pics, w, h, r }: { pics: Pic[]; w: number; h: number; r: number }) {
  const t = useT();
  const four = pics.length >= 4, list = pics.slice(0, four ? 4 : 2);
  return (
    <View style={{ width: w, height: h, borderRadius: r, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', gap: 2, backgroundColor: t.gray }}>
      {list.map((p, i) => <Image key={i} source={src(p)} contentFit="cover" style={{ width: (w - 2) / 2, height: four ? (h - 2) / 2 : h }} />)}
    </View>
  );
}

function Badge({ text, big }: { text: string; big?: boolean }) {
  const t = useT();
  return (
    <View style={[g.badge, big && g.badgeBig, { backgroundColor: t.dark ? 'rgba(18,18,17,0.82)' : 'rgba(255,255,255,0.94)' }]}>
      <Text style={{ color: t.ink, fontSize: big ? 13 : 11.5, fontVariant: ['tabular-nums'] }}>{text}</Text>
    </View>
  );
}

const label = (u: Unit) => (u.idx.length > 1 ? `${u.idx[0] + 1}–${u.idx[u.idx.length - 1] + 1}` : String(u.idx[0] + 1));

/* ---------- the grid: five per row, a window that always shows three and a half rows ---------- */
export function Grid({ open, photos, groups, setGroups, onBack, onMore, onTalk }: {
  open: boolean; photos: Pic[]; groups: number[][]; setGroups: (g: number[][]) => void; onBack: () => void; onMore: () => void; onTalk: () => void;
}) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const ins = useSafeAreaInsets();
  const W = Dimensions.get('window').width;
  const [select, setSelect] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  const pad = 8, gap = SZ.tileGap, wx = 14;
  const tile = (W - wx * 2 - pad * 2 - gap * 4) / 5;
  const winH = pad + 3 * (tile + gap) + tile * 0.5;
  const units = unitsOf(photos.length, groups);
  const grouped = new Set(groups.flat());

  function toggle(i: number) { setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i])); }
  function make() { if (sel.length < 2) return; setGroups([...groups, sel.slice().sort((a, b) => a - b)]); setSel([]); setSelect(false); }

  return (
    <Screen open={open}>
      <View style={[g.tb, { top: ins.top + 8 }]}>
        {select ? <Pressable onPress={() => { setSelect(false); setSel([]); }}><Text style={[g.txt, { color: t.mut }]}>{S.cancel}</Text></Pressable> : <Round icon="back" label={S.back} onPress={onBack} />}
        <Text style={[g.mid, { color: t.ink, fontFamily: face.title }]}>{select ? S.selTitle : S.nPhotos(photos.length, groups.length)}</Text>
        {select ? <Text style={[g.txt, { color: t.ink }]}>{S.selN(sel.length)}</Text>
          : <Pressable onPress={() => setSelect(true)}><Text style={[g.txt, { color: t.mut }]}>{S.groupBtn}</Text></Pressable>}
      </View>

      <View style={[g.win, { top: ins.top + 60, left: wx, right: wx, height: winH, backgroundColor: t.panel, borderRadius: SZ.panelR }]}>
        <ScrollView contentContainerStyle={{ padding: pad, flexDirection: 'row', flexWrap: 'wrap', gap }} showsVerticalScrollIndicator={false}>
          {units.map((u) => {
            if (u.idx.length > 1) {
              return (
                <View key={'g' + u.idx[0]} style={{ opacity: select ? 0.5 : 1 }}>
                  <Mosaic pics={u.idx.map((i) => photos[i])} w={tile * 2 + gap} h={tile} r={SZ.tileR} />
                  <Badge text={label(u)} />
                </View>
              );
            }
            const i = u.idx[0], on = sel.includes(i);
            return (
              <Pressable key={i} disabled={!select || grouped.has(i)} onPress={() => toggle(i)} style={{ width: tile, height: tile }}>
                <Image source={src(photos[i])} contentFit="cover" style={{ width: tile, height: tile, borderRadius: SZ.tileR }} />
                <Badge text={String(i + 1)} />
                {on ? <><View style={[StyleSheet.absoluteFill, { borderRadius: SZ.tileR, borderWidth: 2.5, borderColor: t.ink }]} />
                  <View style={[g.check, { backgroundColor: t.ink }]}><Svg width={16} height={16} viewBox="0 0 16 16"><Path d="M4.5 8.2l2.3 2.3 4.7-4.9" stroke={t.b} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg></View></> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={[g.how, { top: ins.top + 60 + winH + 22 }]}>
        <Text style={[g.howB, { color: t.ink, fontFamily: face.title }]}>{select ? S.selHow : groups.length ? S.grpHow : S.numHow}</Text>
        <Text style={[g.howS, { color: t.mut }]}>{select ? S.selHowSub : groups.length ? S.grpHowSub : S.numHowSub}</Text>
      </View>

      <View style={[g.bottom, { bottom: ins.bottom + 34 }]}>
        {select ? (
          <>
            <Pressable onPress={() => setSel([])} style={[g.ghost, { backgroundColor: t.panel }]}><Text style={{ color: t.ink, fontSize: 14.5 }}>{S.clear}</Text></Pressable>
            <Pressable onPress={make} style={[g.pill, { backgroundColor: t.pill, opacity: sel.length < 2 ? 0.4 : 1 }]}><Text style={{ color: t.pillText, fontSize: 14.5, fontWeight: '500' }}>{S.makeGroup(sel.length)}</Text></Pressable>
          </>
        ) : (
          <>
            <Round icon="plus" label={S.addPhotos} size={SZ.key} onPress={onMore} />
            <Pressable onPress={onTalk} style={[g.pill, { backgroundColor: t.pill }]}>
              <View style={[g.dot, { backgroundColor: t.red }]} /><Text style={{ color: t.pillText, fontSize: 14.5, fontWeight: '500' }}>{S.fromOne}</Text>
            </Pressable>
          </>
        )}
      </View>
    </Screen>
  );
}

/* ---------- talking through the photos, one photo or one group at a time ---------- */
export function Talk({ open, photos, groups, onBack, onRecord, onDone }: {
  open: boolean; photos: Pic[]; groups: number[][]; onBack: () => void;
  onRecord: { start: () => void; stop: () => void; cancel: () => void }; onDone: (s: Said) => void;
}) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const ins = useSafeAreaInsets();
  const W = Dimensions.get('window').width;
  const units = unitsOf(photos.length, groups);
  const [k, setK] = useState(0);
  const [rec, setRec] = useState<RecState>('idle');
  const [said, setSaid] = useState<Record<number, string>>({});
  const [strike, setStrike] = useState(true);
  const secs = useTimer(rec !== 'idle');
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const rail = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const fade = useState(() => new Animated.Value(1))[0];
  const size = W - 104;

  function line(i: number) { return S.demoLines[i % S.demoLines.length]; }
  function go(i: number) {
    Animated.sequence([Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }), Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true })]).start();
    setK(i); setStrike(true); setTimeout(() => setStrike(false), 1100);
    rail.current?.scrollTo({ x: Math.max(0, i * 46 - W / 2 + 40), animated: true });
  }
  function start() {
    onRecord.start(); setSaid({}); go(0);
    let i = 0;
    /* demo: listening moves on to the next number every few seconds */
    tick.current = setInterval(() => {
      setSaid((m) => ({ ...m, [i]: line(i) }));
      i++; if (i < units.length) go(i); else if (tick.current) clearInterval(tick.current);
    }, 3200);
  }
  function stop(keep: boolean) {
    if (tick.current) clearInterval(tick.current);
    setRec('idle');
    if (!keep) { onRecord.cancel(); return; }
    onRecord.stop();
    const all = { ...said, [k]: line(k) };
    onDone({ kind: 'photos', parts: units.map((u, i) => ({ unit: u, text: all[i] || '' })).filter((p) => p.text) });
    setK(0);
  }
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);

  const u = units[k] || { idx: [0] };
  const recording = rec !== 'idle';
  const tag = S.rangeWord(u.idx[0] + 1, u.idx[u.idx.length - 1] + 1, S.numWord);

  return (
    <Screen open={open}>
      <View style={[g.tb, { top: ins.top + 8 }]}>
        <Round icon="back" label={S.back} onPress={onBack} dim={recording} />
        <Text style={[g.mid, { color: t.ink, fontFamily: face.title }]}>{S.itemOf(k + 1, units.length)}</Text>
        <View style={{ width: 36 }} />
      </View>
      <Glow top={ins.top + 30} size={340} />
      {photos.length ? (
        <Animated.View style={{ position: 'absolute', top: ins.top + 70, left: 52, width: size, height: size, opacity: fade }}>
          {u.idx.length > 1 ? <Mosaic pics={u.idx.map((i) => photos[i])} w={size} h={size} r={SZ.stageR} />
            : <Image source={src(photos[u.idx[0]])} contentFit="cover" style={{ width: size, height: size, borderRadius: SZ.stageR }} />}
          <Badge text={u.idx.length > 1 ? tag : String(u.idx[0] + 1)} big />
        </Animated.View>
      ) : null}
      <Text style={[g.cap, { top: ins.top + 70 + size + 18, color: t.ink, fontFamily: face.body }]}>
        {recording ? <>{tag}{S.is}{strike ? <Text style={{ color: t.strike, textDecorationLine: 'line-through' }}>{S.fillers[k % 4]}</Text> : null}{said[k] || line(k)}</> : <Text style={{ color: t.mut }}>{S.numHowSub}</Text>}
      </Text>

      <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} style={[g.rail, { bottom: ins.bottom + 34 + SZ.key + 22 }]} contentContainerStyle={{ paddingHorizontal: 24, gap: 6, alignItems: 'center' }}>
        {units.map((x, i) => {
          const w = x.idx.length > 1 ? 74 : 34;
          return (
            <Pressable key={i} onPress={() => go(i)} style={{ opacity: i === k ? 1 : said[i] ? 0.85 : 0.35 }}>
              {x.idx.length > 1 ? <Mosaic pics={x.idx.slice(0, 2).map((j) => photos[j])} w={w} h={34} r={9} />
                : <Image source={src(photos[x.idx[0]])} contentFit="cover" style={{ width: 34, height: 34, borderRadius: 9 }} />}
              {i === k ? <View style={[StyleSheet.absoluteFill, { borderRadius: 11, borderWidth: 1.5, borderColor: t.ink, margin: -3 }]} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[g.bottom, { bottom: ins.bottom + 34 }]}>
        <TalkKey label={S.tapTalk} sideIcon="plus" state={rec} setState={setRec} secs={secs}
          onStart={start} onStop={() => stop(true)} onCancel={() => stop(false)} />
      </View>
    </Screen>
  );
}

const g = StyleSheet.create({
  tb: { position: 'absolute', left: SZ.px, right: SZ.px - 4, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mid: { fontSize: 17 },
  txt: { fontSize: 14 },
  win: { position: 'absolute', overflow: 'hidden' },
  badge: { position: 'absolute', left: 3, bottom: 3, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeBig: { left: 10, bottom: 10, height: 28, minWidth: 28, paddingHorizontal: 10, borderRadius: 14 },
  check: { position: 'absolute', right: 4, top: 4, width: 16, height: 16, borderRadius: 8 },
  how: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  howB: { fontSize: 18 },
  howS: { fontSize: 12.5, marginTop: 4, textAlign: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  ghost: { height: SZ.key, paddingHorizontal: 18, borderRadius: SZ.key / 2, justifyContent: 'center' },
  pill: { height: SZ.key, paddingHorizontal: 22, borderRadius: SZ.key / 2, flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  cap: { position: 'absolute', left: 26, right: 26, textAlign: 'center', fontSize: 16.5, lineHeight: 28 },
  rail: { position: 'absolute', left: 0, right: 0, height: 46, flexGrow: 0 },
});
