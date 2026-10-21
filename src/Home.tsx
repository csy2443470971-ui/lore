import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Page, Stream } from './Doc';
import { Tray } from './Photos';
import { Pic, Said, unitsOf } from './session';
import { SZ } from './theme';
import { Glow, RecState, Round, TalkKey, useFace, useLang, useS, useT, useTimer } from './ui';

/* The one writing page. Empty, with photos, or carrying on later, it is the same page:
   today's photos (if any), what has been laid out, the tidied words not laid out yet, and the talk row. */
export function Home({ hidden, night, photos, groups, setGroups, said, laid, making, onCamera, onPick, onOpen, onRecord, onSaved, onLayout }: {
  hidden: boolean; night: boolean; photos: Pic[]; groups: number[][]; setGroups: (g: number[][]) => void;
  said: Said[]; laid: number; making: boolean;
  onCamera: () => void; onPick: () => void;
  onOpen: (p: 'archive' | 'settings') => void;
  onRecord: { start: () => void; stop: () => void; cancel: () => void };
  onSaved: (s: Said) => void; onLayout: () => void;
}) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const zh = useLang() === 'zh';
  const ins = useSafeAreaInsets();
  const W = Dimensions.get('window').width;
  const [rec, setRec] = useState<RecState>('idle');
  const [mode, setMode] = useState<'talk' | 'photos'>('talk');
  const [shown, setShown] = useState(0);
  const [cleaned, setCleaned] = useState(false);
  const [k, setK] = useState(-1);                                    // the photo or group being talked about
  const [lines, setLines] = useState<Record<number, string>>({});
  const [select, setSelect] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  const secs = useTimer(rec !== 'idle');
  const fade = useState(() => new Animated.Value(1))[0];
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => { Animated.timing(fade, { toValue: hidden ? 0 : 1, duration: 360, useNativeDriver: true }).start(); }, [hidden, fade]);
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);

  const units = unitsOf(photos.length, groups);
  const talked = new Set(said.flatMap((x) => (x.kind === 'photos' ? x.parts.map((p) => p.unit.idx[0]) : [])));
  const laidIdx = new Set(said.slice(0, laid).flatMap((x) => (x.kind === 'photos' ? x.parts.map((p) => p.unit.idx[0]) : [])));
  const pending = units.map((u, n) => (talked.has(u.idx[0]) ? -1 : n)).filter((n) => n >= 0);
  const showTray = units.some((u) => !laidIdx.has(u.idx[0]));
  const raws = [S.raw, S.raw2, S.raw3];
  const raw = raws[said.filter((x) => x.kind === 'talk').length % raws.length];
  const line = (n: number) => S.demoLines[n % S.demoLines.length];

  function start() {
    onRecord.start();
    if (showTray && pending.length) {
      /* demo: the person goes "one is…, two is…"; which photo each sentence belongs to is only settled at Lay out */
      setMode('photos'); setLines({}); setK(pending[0]);
      let j = 0;
      tick.current = setInterval(() => {
        const n = pending[j];
        setLines((m) => ({ ...m, [n]: line(n) }));
        j++; if (j < pending.length) setK(pending[j]); else if (tick.current) clearInterval(tick.current);
      }, 3200);
    } else {
      setMode('talk'); setShown(1); setCleaned(false);
      tick.current = setInterval(() => setShown((n) => Math.min(raw.length, n + 1)), 450);
    }
  }
  function finish(keep: boolean) {
    if (tick.current) clearInterval(tick.current);
    setRec('idle');
    if (!keep) { onRecord.cancel(); setShown(0); setK(-1); setLines({}); return; }
    onRecord.stop();
    if (mode === 'photos') {
      const all = k >= 0 ? { ...lines, [k]: line(k) } : lines;
      onSaved({ kind: 'photos', parts: pending.filter((n) => all[n]).map((n) => ({ unit: units[n], text: all[n] })) });
      setK(-1); setLines({});
      return;
    }
    setCleaned(true);            // the filler words drop out in place, then the words settle into the transcript
    const text = raw.slice(0, Math.max(shown, 4)).filter((w) => w[1] !== 1).map((w) => w[0]).join('');
    setTimeout(() => { onSaved({ kind: 'talk', text }); setShown(0); setCleaned(false); }, 900);
  }
  function toggle(i: number) { setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i])); }
  function group() { if (sel.length < 2) return; setGroups([...groups, sel.slice().sort((a, b) => a - b)]); setSel([]); setSelect(false); }

  const recording = rec !== 'idle';
  const liveTalk = mode === 'talk' && (recording || shown > 0);
  const livePhotos = mode === 'photos' && recording;
  const unlaid = said.slice(laid);
  const nothing = !said.length && !photos.length && !liveTalk && !making;
  const canLayout = unlaid.length > 0 && !recording && !shown && !making && !select;
  const top = ins.top + 8;
  const ctlBottom = ins.bottom + 30;
  const ctlH = SZ.talk + 28;
  const listBottom = ctlBottom + ctlH + (canLayout ? 70 : 30);
  const tx = [zh ? h.tx : h.txEn, { color: t.ink, fontFamily: face.body }];
  const reached = livePhotos ? pending.filter((n) => lines[n] || n === k) : [];

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[StyleSheet.absoluteFill, { opacity: fade }]}>
      {making ? (
        <View style={[StyleSheet.absoluteFill, h.making]} pointerEvents="none">
          <Glow top={Dimensions.get('window').height / 2 - 200} size={320} />
          <Text style={{ fontSize: 22, color: t.ink }}>✦</Text>
          <Text style={[h.makingT, { color: t.ink, fontFamily: face.body }]}>{S.making}</Text>
        </View>
      ) : (
        <ScrollView ref={scroll} style={[StyleSheet.absoluteFill, { top: top + 50 }]} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SZ.px, paddingTop: 10, paddingBottom: listBottom, gap: 24 }}
          onContentSizeChange={() => { if (!select && !livePhotos && said.length) scroll.current?.scrollToEnd({ animated: true }); }}>
          {laid > 0 ? <Page items={said.slice(0, laid)} photos={photos} /> : null}

          {showTray ? (
            <View style={{ gap: 10 }}>
              <View style={h.trayHead}>
                <Text style={{ fontSize: 13, color: t.mut }}>{select ? S.selN(sel.length) : groups.length ? S.photosOfG(photos.length, groups.length) : S.photosOf(photos.length)}</Text>
                <Pressable disabled={recording} hitSlop={8} onPress={() => { setSelect(!select); setSel([]); }}>
                  <Text style={{ fontSize: 13.5, color: select ? t.ink : t.mut, opacity: recording ? 0.35 : 1 }}>{select ? S.cancel : S.groupBtn}</Text>
                </Pressable>
              </View>
              <Tray photos={photos} groups={groups} width={W - 2 * SZ.px} select={select} sel={sel} onToggle={toggle} cur={-1} />
              {select ? <Text style={[h.hint, { color: t.mut }]}>{S.selHow}</Text>
                : !said.length && !recording ? <Text style={[h.hint, { color: t.mut, fontFamily: face.body }]}>{S.photoHow}</Text> : null}
            </View>
          ) : null}

          {unlaid.length ? <Stream items={unlaid} /> : null}

          {livePhotos && reached.length ? <Stream items={[{ kind: 'photos', parts: reached.map((n) => ({ unit: units[n], text: lines[n] || line(n) })) }]} /> : null}
          {liveTalk ? (
            <Text style={tx}>
              {raw.slice(0, shown).map((w, i) => {
                if (w[1] === 1 && cleaned) return null;
                return <Text key={i} style={w[1] === 1 ? { color: t.strike, textDecorationLine: 'line-through' } : null}>{w[0]}</Text>;
              })}
            </Text>
          ) : null}

          {nothing ? (
            <View style={{ marginTop: 24, gap: 8 }}>
              <Text style={{ fontSize: 14, color: t.mut, fontFamily: face.body }}>{S.hi(night)}</Text>
              <Text style={[h.ask, { color: t.ink, fontFamily: face.title }]}>{S.ask0}</Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      {!making ? <LinearGradient colors={[t.b + '00', t.b]} locations={[0, 0.45]} style={[h.fadeOut, { height: listBottom }]} pointerEvents="none" /> : null}

      <View style={[h.tb, { top, backgroundColor: t.b }]}>
        <Text style={[h.title, { color: t.ink, fontFamily: face.title }]}>{S.navToday}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Round icon="cal" label={S.archive} onPress={() => onOpen('archive')} />
          <Round icon="gear" label={S.settings} onPress={() => onOpen('settings')} />
        </View>
      </View>

      {canLayout ? (
        <Pressable onPress={onLayout} style={({ pressed }) => [h.layout, { bottom: ctlBottom + ctlH + 18, backgroundColor: t.panel, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={{ fontSize: 14, color: t.ink }}>✦</Text>
          <Text style={{ fontSize: 14.5, color: t.ink }}>{S.layoutBtn}</Text>
        </Pressable>
      ) : null}

      <View style={[h.ctl, { bottom: ctlBottom, height: ctlH }]} pointerEvents={making ? 'none' : 'box-none'}>
        {select ? (
          <View style={h.selRow}>
            <Pressable onPress={() => setSel([])} style={[h.ghost, { backgroundColor: t.panel }]}><Text style={{ color: t.ink, fontSize: 14.5 }}>{S.clear}</Text></Pressable>
            <Pressable onPress={group} style={[h.pill, { backgroundColor: t.pill, opacity: sel.length < 2 ? 0.4 : 1 }]}><Text style={{ color: t.pillText, fontSize: 14.5, fontWeight: '500' }}>{S.makeGroup(sel.length)}</Text></Pressable>
          </View>
        ) : (
          <TalkKey left={{ icon: 'camera', label: S.camera, onPress: onCamera }} right={{ icon: 'photo', label: S.library, onPress: onPick }}
            state={rec} setState={setRec} secs={secs} onStart={start} onStop={() => finish(true)} onCancel={() => finish(false)} />
        )}
      </View>
    </Animated.View>
  );
}

const h = StyleSheet.create({
  tb: { position: 'absolute', left: 0, right: 0, paddingLeft: SZ.px, paddingRight: SZ.px - 4, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22 },
  ask: { fontSize: 28, lineHeight: 38 },
  tx: { fontSize: 16, lineHeight: 29 },
  txEn: { fontSize: 17.5, lineHeight: 27 },
  trayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  hint: { fontSize: 13.5, lineHeight: 21 },
  making: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 },
  makingT: { fontSize: 15.5 },
  fadeOut: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  layout: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, height: 38, paddingHorizontal: 18, borderRadius: 19 },
  ctl: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'flex-start' },
  selRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: (SZ.talk - SZ.key) / 2 },
  ghost: { height: SZ.key, paddingHorizontal: 18, borderRadius: SZ.key / 2, justifyContent: 'center' },
  pill: { height: SZ.key, paddingHorizontal: 22, borderRadius: SZ.key / 2, justifyContent: 'center' },
});
