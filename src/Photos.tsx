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
export function Mosaic({ pics, w, h, r }: { pics: Pic[]; w: number; h: number; r: number }) {
  const t = useT();
  const four = pics.length >= 4, list = pics.slice(0, four ? 4 : 2);
  return (
    <View style={{ width: w, height: h, borderRadius: r, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', gap: 2, backgroundColor: t.gray }}>
      {list.map((p, i) => <Image key={i} source={src(p)} contentFit="cover" style={{ width: (w - 2) / 2, height: four ? (h - 2) / 2 : h }} />)}
    </View>
  );
}

export function Badge({ text, big, mid }: { text: string; big?: boolean; mid?: boolean }) {
  const t = useT();
  return (
    <View style={[g.badge, mid && g.badgeMid, big && g.badgeBig, { backgroundColor: t.dark ? 'rgba(18,18,17,0.82)' : 'rgba(255,255,255,0.94)' }]}>
      <Text style={{ color: t.ink, fontSize: big ? 13 : mid ? 12.5 : 11.5, fontVariant: ['tabular-nums'] }}>{text}</Text>
    </View>
  );
}

const label = (u: Unit) => (u.idx.length > 1 ? `${u.idx[0] + 1}–${u.idx[u.idx.length - 1] + 1}` : String(u.idx[0] + 1));

/* ---------- the photos you picked, and talking about them right here by number ---------- */
export function Grid({ open, photos, groups, setGroups, onBack, onCamera, onMore, onRecord, onDone }: {
  open: boolean; photos: Pic[]; groups: number[][]; setGroups: (g: number[][]) => void; onBack: () => void;
  onCamera: () => void; onMore: () => void;
  onRecord: { start: () => void; stop: () => void; cancel: () => void }; onDone: (s: Said) => void;
}) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const ins = useSafeAreaInsets();
  const W = Dimensions.get('window').width;
  const [select, setSelect] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  const [rec, setRec] = useState<RecState>('idle');
  const [k, setK] = useState(-1);                       // the photo or group being talked about
  const [said, setSaid] = useState<Record<number, string>>({});
  const [strike, setStrike] = useState(false);
  const secs = useTimer(rec !== 'idle');
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const win$ = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);

  const units = unitsOf(photos.length, groups);
  /* few photos stay big: three across up to three photos, four across up to eight, then five */
  const cols = photos.length <= 3 ? 3 : photos.length <= 8 ? 4 : 5;
  /* count rows the way flex-wrap lays them out: a group takes two cells and moves down if it doesn't fit */
  const rowOf: number[] = [];
  let rows = units.length ? 1 : 0, used = 0;
  units.forEach((u) => { const w = u.idx.length > 1 ? 2 : 1; if (used + w > cols) { rows++; used = 0; } used += w; rowOf.push(rows - 1); });
  /* only past three rows do the photos go into a white window that scrolls, showing three and a half rows */
  const win = rows > 3;
  const gap = SZ.tileGap, pad = win ? 8 : 0, wx = win ? 14 : SZ.px;
  const tile = (W - wx * 2 - pad * 2 - gap * (cols - 1)) / cols;
  const r = tile > 90 ? 14 : SZ.tileR;
  const winH = win ? pad + 3 * (tile + gap) + tile * 0.5 : rows * tile + (rows - 1) * gap;
  const grouped = new Set(groups.flat());
  const recording = rec !== 'idle';

  function toggle(i: number) { setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i])); }
  function make() { if (sel.length < 2) return; setGroups([...groups, sel.slice().sort((a, b) => a - b)]); setSel([]); setSelect(false); }

  const line = (i: number) => S.demoLines[i % S.demoLines.length];
  function go(i: number) {
    setK(i); setStrike(true); setTimeout(() => setStrike(false), 1100);
    if (win) win$.current?.scrollTo({ y: Math.max(0, (rowOf[i] - 1) * (tile + gap)), animated: true });
  }
  function start() {
    onRecord.start(); setSaid({}); go(0);
    let i = 0;
    /* demo: as you go "one is…, two is…", the matching photo lights up */
    tick.current = setInterval(() => {
      setSaid((m) => ({ ...m, [i]: line(i) }));
      i++; if (i < units.length) go(i); else if (tick.current) clearInterval(tick.current);
    }, 3200);
  }
  function stop(keep: boolean) {
    if (tick.current) clearInterval(tick.current);
    setRec('idle');
    const at = k; setK(-1);
    if (!keep) { onRecord.cancel(); return; }
    onRecord.stop();
    const all = { ...said, [at]: line(at) };
    onDone({ kind: 'photos', parts: units.map((u, i) => ({ unit: u, text: all[i] || '' })).filter((p) => p.text) });
  }

  const cur = units[k];
  const tag = cur ? S.rangeWord(cur.idx[0] + 1, cur.idx[cur.idx.length - 1] + 1, S.numWord) : '';
  const ring = <View style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 2.5, borderColor: t.ink }]} />;

  return (
    <Screen open={open}>
      <View style={[g.tb, { top: ins.top + 8 }]}>
        {select ? <Pressable onPress={() => { setSelect(false); setSel([]); }}><Text style={[g.txt, { color: t.mut }]}>{S.cancel}</Text></Pressable>
          : <Round icon="back" label={S.back} onPress={recording ? undefined : onBack} dim={recording} />}
        <Text style={[g.mid, { color: t.ink, fontFamily: face.title }]}>{select ? S.selTitle : S.nPhotos(photos.length, groups.length)}</Text>
        {select ? <Text style={[g.txt, { color: t.ink }]}>{S.selN(sel.length)}</Text>
          : <Pressable disabled={recording} onPress={() => setSelect(true)}><Text style={[g.txt, { color: t.mut, opacity: recording ? 0.35 : 1 }]}>{S.groupBtn}</Text></Pressable>}
      </View>

      {recording ? <Glow top={ins.top + 30} size={winH + 80} /> : null}
      <View style={[g.win, { top: ins.top + 60, left: wx, right: wx, height: winH }, win && { backgroundColor: t.panel, borderRadius: SZ.panelR }]}>
        <ScrollView ref={win$} scrollEnabled={win} contentContainerStyle={{ padding: pad, flexDirection: 'row', flexWrap: 'wrap', gap }} showsVerticalScrollIndicator={false}>
          {units.map((u, n) => {
            const dim = recording && n !== k ? 0.45 : 1;
            if (u.idx.length > 1) {
              return (
                <View key={'g' + u.idx[0]} style={{ opacity: select ? 0.5 : dim }}>
                  <Mosaic pics={u.idx.map((i) => photos[i])} w={tile * 2 + gap} h={tile} r={r} />
                  <Badge text={label(u)} mid={tile > 90} />
                  {n === k ? ring : null}
                </View>
              );
            }
            const i = u.idx[0], on = sel.includes(i);
            return (
              <Pressable key={i} disabled={!select || grouped.has(i)} onPress={() => toggle(i)} style={{ width: tile, height: tile, opacity: dim }}>
                <Image source={src(photos[i])} contentFit="cover" style={{ width: tile, height: tile, borderRadius: r }} />
                <Badge text={String(i + 1)} mid={tile > 90} />
                {on || n === k ? ring : null}
                {on ? <View style={[g.check, { backgroundColor: t.ink }]}><Svg width={16} height={16} viewBox="0 0 16 16"><Path d="M4.5 8.2l2.3 2.3 4.7-4.9" stroke={t.b} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg></View> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={[g.how, { top: ins.top + 60 + winH + 22 }]}>
        {select ? (<>
          <Text style={[g.howB, { color: t.ink, fontFamily: face.title }]}>{S.selHow}</Text>
          <Text style={[g.howS, { color: t.mut }]}>{S.selHowSub}</Text>
        </>) : recording && cur ? (
          <Text style={[g.cap, { color: t.ink, fontFamily: face.body }]}>
            {tag}{S.is}{strike ? <Text style={{ color: t.strike, textDecorationLine: 'line-through' }}>{S.fillers[k % 4]}</Text> : null}{said[k] || line(k)}
          </Text>
        ) : (
          <Text style={[g.hint, { color: t.mut, fontFamily: face.body }]}>{S.photoHow}</Text>
        )}
      </View>

      <View style={[g.bottom, { bottom: ins.bottom + 30 }]}>
        {select ? (
          <>
            <Pressable onPress={() => setSel([])} style={[g.ghost, { backgroundColor: t.panel }]}><Text style={{ color: t.ink, fontSize: 14.5 }}>{S.clear}</Text></Pressable>
            <Pressable onPress={make} style={[g.pill, { backgroundColor: t.pill, opacity: sel.length < 2 ? 0.4 : 1 }]}><Text style={{ color: t.pillText, fontSize: 14.5, fontWeight: '500' }}>{S.makeGroup(sel.length)}</Text></Pressable>
          </>
        ) : (
          <TalkKey left={{ icon: 'camera', label: S.camera, onPress: onCamera }} right={{ icon: 'photo', label: S.library, onPress: onMore }}
            state={rec} setState={setRec} secs={secs} onStart={start} onStop={() => stop(true)} onCancel={() => stop(false)} />
        )}
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
  badgeMid: { left: 7, bottom: 7, height: 22, minWidth: 22, paddingHorizontal: 7, borderRadius: 11 },
  badgeBig: { left: 10, bottom: 10, height: 28, minWidth: 28, paddingHorizontal: 10, borderRadius: 14 },
  check: { position: 'absolute', right: 4, top: 4, width: 16, height: 16, borderRadius: 8 },
  how: { position: 'absolute', left: 28, right: 28, alignItems: 'center' },
  howB: { fontSize: 18 },
  howS: { fontSize: 12.5, marginTop: 4, textAlign: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  ghost: { height: SZ.key, paddingHorizontal: 18, borderRadius: SZ.key / 2, justifyContent: 'center' },
  pill: { height: SZ.key, paddingHorizontal: 22, borderRadius: SZ.key / 2, flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  cap: { textAlign: 'center', fontSize: 16.5, lineHeight: 28 },
  hint: { textAlign: 'center', fontSize: 14.5, lineHeight: 24 },
  rail: { position: 'absolute', left: 0, right: 0, height: 46, flexGrow: 0 },
});
