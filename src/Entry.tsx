import React, { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layout, parseAsk } from './data';
import { PHOTO } from './images';
import { F } from './theme';
import { Icon, Meta, Panel, Ring, s as us, useFace, useLang, useS, useT } from './ui';

const BARS = [5, 9, 6, 12, 8, 14, 7, 10, 4, 11, 13, 6, 9, 5, 12, 8, 6, 10, 7, 4];

function Fig({ p, ratio, cap, bleed }: { p: string; ratio: number; cap?: string; bleed?: boolean }) {
  return (
    <View style={[{ gap: 8, flex: 1 }, bleed && { marginHorizontal: -24 }]}>
      <Image source={PHOTO[p]} style={{ width: '100%', aspectRatio: ratio, borderRadius: bleed ? 0 : 3 }} contentFit="cover" transition={300} />
      {cap ? <Meta style={[{ fontSize: 12.5 }, bleed && { paddingHorizontal: 24 }]}>{cap}</Meta> : null}
    </View>
  );
}

/* The day's walk: a dotted line between two named places, labels in plain text below. */
function Route() {
  const t = useT();
  const S = useS();
  return (
    <View style={{ gap: 6 }}>
      <Svg width="100%" height={60} viewBox="0 0 300 60" preserveAspectRatio="none">
        <Path d="M6 48 C 60 50, 70 12, 120 18 S 190 54, 230 32 S 270 8, 294 12" stroke={t.pInk} strokeWidth={1} strokeDasharray="2 3" fill="none" />
        <Circle cx={6} cy={48} r={3} fill={t.pInk} />
        <Circle cx={294} cy={12} r={3} fill={t.pInk} />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Meta>{S.routeFrom}</Meta><Meta>{S.routeLen}</Meta><Meta>{S.routeTo}</Meta>
      </View>
    </View>
  );
}

export function Entry({ open, onClose, onArchive, voiceUri }: { open: boolean; onClose: () => void; onArchive: () => void; voiceUri: string | null }) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const zh = useLang() === 'zh';
  const ins = useSafeAreaInsets();
  const [layout, setLayout] = useState<Layout>('mix');
  const [prev, setPrev] = useState<Layout | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [kb, setKb] = useState(0);
  const fade = useState(() => new Animated.Value(1))[0];
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const player = useAudioPlayer(voiceUri ?? undefined);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKb(e.endCoordinates.height));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
    return () => { a.remove(); b.remove(); };
  }, []);

  function apply(to: Layout, undo = false) {
    if (to === layout || busy) return;
    setBusy(true); setLog(null);
    Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setPrev(undo ? null : layout); setLayout(to);
      scroll.current?.scrollTo({ y: 0, animated: true });
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      setLog(undo ? null : S.done[to]); setBusy(false);
    });
  }
  function submit() {
    const v = q.trim(); if (!v) return;
    setQ(''); Keyboard.dismiss();
    const to = parseAsk(v);
    if (to) apply(to); else { setPrev(null); setLog(S.notLearned); }
  }
  function togglePlay() {
    if (!voiceUri) return;
    if (status.playing) player.pause(); else { if (status.didJustFinish || status.currentTime >= status.duration) player.seekTo(0); player.play(); }
  }

  const tx = [zh ? st.tx : st.txEn, { color: t.pInk, fontFamily: face.body }];
  const body = {
    mix: (<>
      <Text style={tx}>{S.t1}</Text>
      <View style={st.row}><View style={{ flex: 3 }}><Fig p="cafe" ratio={3 / 4} cap={S.cap.cafe} /></View><View style={{ flex: 2 }}><Fig p="latte" ratio={1} cap={S.cap.latte} /></View></View>
      <Text style={tx}>{S.t2}</Text>
      <Fig p="sunset" ratio={4 / 3} cap={S.cap.sunset} bleed />
      <Route />
      <Text style={[tx, { color: t.pMuted }]}>{S.t3}</Text>
    </>),
    big: (<>
      <Fig p="sunset" ratio={4 / 5} cap={S.cap.sunset} bleed />
      <Text style={tx}>{S.t1}</Text>
      <Text style={tx}>{S.t2}</Text>
      <View style={st.row}><Fig p="cafe" ratio={1} /><Fig p="latte" ratio={1} /><Fig p="causeway" ratio={1} /></View>
    </>),
    quote: (<>
      <Text style={[zh ? st.big : st.bigEn, { color: t.pInk, fontFamily: face.body }]}>{S.bigQuote}</Text>
      <Meta>{S.quoteSrc}</Meta>
      <Fig p="sunset" ratio={16 / 10} />
    </>),
    time: (<>
      {([['14:10', S.t1, 'cafe'], ['17:42', S.t2, 'sunset'], ['19:05', S.t3, 'osmanthus']] as const).map(([tm, txt, p]) => (
        <View key={tm} style={st.tl}>
          <Text style={[st.tlTime, { color: t.pInk, borderTopColor: t.pInk }]}>{tm}</Text>
          <View style={{ flex: 1, gap: 12 }}><Text style={tx}>{txt}</Text><Fig p={p} ratio={16 / 10} /></View>
        </View>
      ))}
    </>),
  }[layout];

  return (
    <Panel open={open} onBack={onClose}
      top={<><Ring icon="down" label={S.back} onPress={onClose} /><Text style={[us.topLbl, { color: t.ink }]}>{S.today}</Text><Ring icon="list" label={S.archive} onPress={onArchive} /></>}
      footer={
        <View style={[st.ask, { paddingBottom: Math.max(ins.bottom, 12) + 4, transform: [{ translateY: kb ? -kb + ins.bottom : 0 }] }]}>
          <LinearGradient colors={['transparent', t.paperSolid]} locations={[0, 0.5]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={st.sugg}>
            {log ? (
              <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap', flex: 1 }}>
                <Text style={{ fontSize: 13.5, color: t.pInk, flexShrink: 1 }}>{log}</Text>
                {prev ? <Pressable onPress={() => apply(prev, true)}><Text style={{ fontSize: 13.5, color: t.pInk, textDecorationLine: 'underline' }}>{S.undo}</Text></Pressable> : null}
              </View>
            ) : busy ? <Text style={{ fontSize: 13.5, color: t.pMuted }}>{S.reflowing}</Text> : S.sugg.filter(([, l]) => l !== layout).map(([label, l]) => (
              <Pressable key={l} onPress={() => apply(l)} hitSlop={8}><Text style={{ fontSize: 13.5, color: t.pMuted }}>{label}</Text></Pressable>
            ))}
          </View>
          <View style={[st.field, { backgroundColor: t.paperSolid, borderColor: t.pLine }]}>
            <TextInput value={q} onChangeText={setQ} onSubmitEditing={submit} returnKeyType="send" placeholder={S.askPh} placeholderTextColor={t.pMuted}
              style={[st.input, { color: t.pInk }]} />
            <Pressable accessibilityLabel={S.speak} style={st.mic}><Icon name="mic" color={t.pMuted} /></Pressable>
            <Pressable accessibilityLabel={S.ask} onPress={submit} style={[st.go, { backgroundColor: t.pInk }]}><Icon name="up" color={t.paperSolid} /></Pressable>
          </View>
        </View>
      }>
      <ScrollView ref={scroll} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 24, paddingTop: 28, paddingBottom: 180 }} showsVerticalScrollIndicator={false}>
        <Meta>{S.place}</Meta>
        <Text style={[zh ? st.title : st.titleEn, { color: t.pInk, fontFamily: face.title }]}>{S.todayTitle}</Text>
        <Text style={[st.quote, { color: t.pMuted, fontFamily: face.italic }]}>{S.quote}</Text>
        <View style={st.voiceRow}>
          <Pressable onPress={togglePlay} style={[st.voice, { borderColor: t.pLine }]} accessibilityRole="button">
            <View style={[st.play, { backgroundColor: t.pInk }]}><Text style={{ color: t.paperSolid, fontSize: 9 }}>{status.playing ? '❚❚' : '▶'}</Text></View>
            <View style={st.bars}>{BARS.map((v, i) => <View key={i} style={{ width: 2, height: v, borderRadius: 1, backgroundColor: status.playing ? t.pInk : t.pFaint }} />)}</View>
            <Text style={{ fontSize: 13, color: t.pInk }}>{voiceUri ? S.playNew : S.playVoice}</Text>
          </Pressable>
        </View>
        <Meta style={{ marginTop: 10 }}>{S.voiceLen}</Meta>
        <Animated.View style={{ marginTop: 28, gap: 20, opacity: fade }}>{body}</Animated.View>
        <View style={[st.stats, { borderTopColor: t.pLine }]}>
          {S.stats.map(([n, l]) => (
            <View key={l} style={{ flex: 1, gap: 2 }}><Text style={[st.num, { color: t.pInk }]}>{n}</Text><Meta style={{ fontSize: 12.5 }}>{l}</Meta></View>
          ))}
        </View>
      </ScrollView>
      {/* while the keyboard is up, a tap anywhere on the page puts it away */}
      {kb > 0 && <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} accessibilityLabel={S.back} />}
    </Panel>
  );
}

export const st = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 40, marginTop: 8 },
  titleEn: { fontSize: 32, lineHeight: 38, marginTop: 8, letterSpacing: -0.3 },
  quote: { fontSize: 17, lineHeight: 26, marginTop: 6, marginBottom: 18 },
  voiceRow: { flexDirection: 'row' },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, paddingRight: 16, borderRadius: 999, borderWidth: 1 },
  play: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bars: { flexDirection: 'row', gap: 2, alignItems: 'center', height: 14 },
  tx: { fontSize: 16, lineHeight: 30 },
  txEn: { fontSize: 18, lineHeight: 28 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  big: { fontSize: 30, lineHeight: 46, marginTop: 6 },
  bigEn: { fontSize: 34, lineHeight: 40, marginTop: 6, letterSpacing: -0.4 },
  tl: { flexDirection: 'row', gap: 14 },
  tlTime: { width: 48, paddingTop: 6, borderTopWidth: 1, alignSelf: 'flex-start', fontFamily: F.serif, fontSize: 15, fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row', gap: 8, marginTop: 30, paddingTop: 18, borderTopWidth: 1 },
  num: { fontFamily: F.serifLight, fontSize: 26, lineHeight: 30 },
  ask: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 44, paddingHorizontal: 14, gap: 12, zIndex: 3 },
  sugg: { flexDirection: 'row', gap: 18, paddingHorizontal: 10, minHeight: 20, flexWrap: 'wrap' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 52, paddingLeft: 18, paddingRight: 6, borderRadius: 26, borderWidth: 1 },
  input: { flex: 1, fontSize: 15, height: 52 },
  mic: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  go: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
