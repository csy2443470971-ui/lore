import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EASE, Icon, Ring, useFace, useLang, useS, useT } from './ui';

type Phase = 'idle' | 'rec' | 'clean' | 'cut' | 'done';
const R = 46, C = 2 * Math.PI * R;

export function Home({ hidden, sceneName, onSwipe, onOpen, onRecorded }: {
  hidden: boolean; sceneName: string; onSwipe: (dir: 1 | -1) => void;
  onOpen: (v: 'entry' | 'archive' | 'settings') => void; onRecorded: (uri: string | null) => void;
}) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const zh = useLang() === 'zh';
  const ins = useSafeAreaInsets();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<Phase>('idle');
  const [secs, setSecs] = useState(0);
  const [shown, setShown] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const t0 = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fade = useState(() => new Animated.Value(1))[0];
  const greet = useState(() => new Animated.Value(1))[0];
  const scale = useState(() => new Animated.Value(1))[0];
  const nameO = useState(() => new Animated.Value(0))[0];
  const first = useRef(true);

  useEffect(() => { Animated.timing(fade, { toValue: hidden ? 0 : 1, duration: 450, easing: EASE, useNativeDriver: true }).start(); }, [hidden, fade]);
  useEffect(() => { Animated.timing(greet, { toValue: phase === 'idle' ? 1 : 0, duration: 500, useNativeDriver: true }).start(); }, [phase, greet]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); if (tick.current) clearInterval(tick.current); }, []);
  /* the scene's name surfaces for a moment after each swipe */
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    nameO.setValue(0);
    Animated.sequence([Animated.timing(nameO, { toValue: 1, duration: 300, useNativeDriver: true }), Animated.delay(1100), Animated.timing(nameO, { toValue: 0, duration: 600, useNativeDriver: true })]).start();
  }, [sceneName, nameO]);

  const pan = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 60 || Math.abs(g.vx) > 0.5) { onSwipe(g.dx < 0 ? 1 : -1); Haptics.selectionAsync().catch(() => {}); }
    },
  }), [onSwipe]);

  /* pick several photos at once; they keep the order they were picked in and get numbered 1, 2, 3… */
  async function pick() {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, orderedSelection: true, selectionLimit: 12, quality: 0.7 });
      if (!r.canceled && r.assets.length) { setPhotos(r.assets.map((a) => a.uri)); Haptics.selectionAsync().catch(() => {}); }
    } catch { /* picker unavailable */ }
  }

  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  async function start() {
    if (phase === 'rec') return;
    timers.current.forEach(clearTimeout); timers.current = [];
    setPhase('rec'); setShown(1); setSecs(0); t0.current = Date.now();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.spring(scale, { toValue: 1.06, useNativeDriver: true, friction: 5 }).start();
    tick.current = setInterval(() => {
      const sec = (Date.now() - t0.current) / 1000;
      setSecs(sec);
      setShown(Math.min(S.raw.length, Math.floor(sec / 0.45) + 1));
    }, 100);
    try {
      const p = await requestRecordingPermissionsAsync();
      if (p.granted) {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
    } catch { /* the demo still runs without a mic */ }
  }
  async function stop() {
    if (phase !== 'rec') return;
    if (tick.current) clearInterval(tick.current);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPhase('clean');
    try { if (recorder.isRecording) { await recorder.stop(); onRecorded(recorder.uri); await setAudioModeAsync({ allowsRecording: false }); } } catch { /* ignore */ }
    later(() => setPhase('cut'), 400);
    later(() => { setPhase('done'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }, 1500);
    later(reset, 9000);
  }
  function reset() { timers.current.forEach(clearTimeout); timers.current = []; setPhase('idle'); setShown(0); setSecs(0); }

  const tokens = S.raw.slice(0, shown);
  const cut = tokens.filter((w) => w[1] === 1).length;
  const kept = tokens.filter((w) => w[1] === 2).map((w) => w[0]);
  const prog = phase === 'rec' ? Math.min(secs / 60, 1) : 0;
  const mmss = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, { opacity: fade }]} {...(phase === 'idle' ? pan.panHandlers : {})}>
      <View style={[h.hdr, { top: ins.top + 14 }]}>
        <Text style={[h.date, { color: t.ink, fontFamily: face.body }]}>{S.date}</Text>
        <Ring icon="settings" label={S.settings} onPress={() => onOpen('settings')} />
      </View>

      <Animated.View style={[h.greet, { top: ins.top + 92, opacity: greet }]} pointerEvents={phase === 'idle' ? 'box-none' : 'none'}>
        <Text style={[zh ? h.h2 : h.h2en, { color: t.ink, fontFamily: face.body }]}>{t.dark ? S.greetNight : S.greetDay}</Text>
        <Text style={[h.sub, { color: t.muted, fontFamily: face.italic }]}>{t.dark ? S.subNight : S.subDay}</Text>
        <Pressable onPress={() => onOpen('entry')} style={[h.prev, { borderTopColor: t.line }]} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <Text style={[h.prevK, { color: t.muted }]}>{S.todayLink}</Text>
            <Text style={[h.prevT, { color: t.ink, fontFamily: face.title }]}>{S.todayTitle}</Text>
          </View>
          <Text style={[h.prevK, { color: t.muted }]}>{S.segs}  →</Text>
        </Pressable>
      </Animated.View>

      {phase !== 'idle' && (
        <Text style={[zh ? h.live : h.liveEn, { top: ins.top + 92, color: t.ink, fontFamily: face.body }]}>
          {tokens.map((w, i) => {
            if (w[1] === 1 && phase === 'done') return null;
            const struck = w[1] === 1 && (phase === 'cut' || phase === 'done');
            const keep = w[1] === 2 && phase === 'done';
            return <Text key={i} style={[struck && { color: t.muted, textDecorationLine: 'line-through' }, keep && { textDecorationLine: 'underline' }]}>{w[0]}</Text>;
          })}
        </Text>
      )}

      <Animated.Text pointerEvents="none" style={[h.scene, { bottom: ins.bottom + (photos.length ? 330 : 210), color: t.ink, opacity: nameO, fontFamily: face.italic }]}>{sceneName}</Animated.Text>

      {photos.length > 0 && (
        <View style={[h.strip, { bottom: ins.bottom + 214 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, gap: 10, alignItems: 'center' }}>
            {photos.map((u, i) => (
              <View key={u + i} style={[h.thumb, { borderColor: t.line }]}>
                <Image source={{ uri: u }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                <View style={[h.badge, { backgroundColor: t.ink }]}><Text style={[h.badgeT, { color: t.dark ? '#111' : '#fff' }]}>{i + 1}</Text></View>
              </View>
            ))}
            <Pressable onPress={() => setPhotos([])} accessibilityLabel={S.clearPhotos} hitSlop={8} style={[h.clear, { borderColor: t.line }]}>
              <Icon name="close" color={t.ink} size={14} />
            </Pressable>
          </ScrollView>
        </View>
      )}

      <View style={[h.recWrap, { bottom: ins.bottom + 64 }]}>
        <View style={h.recRow}>
          <View style={h.side} />
          <Pressable onPressIn={start} onPressOut={stop} accessibilityRole="button" accessibilityLabel={S.hold}>
            <Animated.View style={[h.rec, { backgroundColor: t.glass, borderColor: t.line, transform: [{ scale }] }]}>
              <View style={[h.dot, phase === 'rec' && h.dotOn, { backgroundColor: t.rec }]} />
              <Svg width={94} height={94} style={h.ringSvg}>
                <Circle cx={47} cy={47} r={R} stroke={t.rec} strokeWidth={2} fill="none" strokeLinecap="round"
                  strokeDasharray={`${C}`} strokeDashoffset={C - C * prog} transform="rotate(-90 47 47)" />
              </Svg>
            </Animated.View>
          </Pressable>
          <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel={S.addPhotos} hitSlop={6}
            style={({ pressed }) => [h.side, h.photoBtn, { borderColor: t.line, backgroundColor: pressed ? t.ink + '22' : t.glass }]}>
            <Icon name="photo" color={t.ink} size={20} />
          </Pressable>
        </View>
        <View style={h.lblRow}>
          {phase === 'idle' && <Text style={[h.lbl, { color: photos.length ? t.ink : t.muted, textAlign: 'center' }]}>{photos.length ? S.photoHint(photos.length) : S.hold}</Text>}
          {phase === 'rec' && <Text style={[h.lbl, { color: t.muted, fontVariant: ['tabular-nums'] }]}>{mmss}    {S.release}</Text>}
          {(phase === 'clean' || phase === 'cut') && <Text style={[h.lbl, { color: t.muted }]}>{S.cleaning}</Text>}
          {phase === 'done' && (
            <>
              <Text style={[h.lbl, { color: t.muted, textAlign: 'center' }]}>{photos.length ? S.photoDone(photos.length) : S.cleaned(cut, kept)}</Text>
              <Pressable onPress={() => { reset(); onOpen('entry'); }}><Text style={[h.lbl, h.link, { color: t.ink, borderBottomColor: t.ink }]}>{S.file}</Text></Pressable>
            </>
          )}
        </View>
      </View>

      <Ring icon="list" label={S.archive} onPress={() => onOpen('archive')} style={{ position: 'absolute', left: 22, bottom: ins.bottom + 22 }} />
      <Ring icon="up" label={S.todayLink} onPress={() => onOpen('entry')} style={{ position: 'absolute', right: 22, bottom: ins.bottom + 22 }} />
    </Animated.View>
  );
}

const h = StyleSheet.create({
  hdr: { position: 'absolute', left: 26, right: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 15 },
  greet: { position: 'absolute', left: 26, right: 26 },
  h2: { fontSize: 30, lineHeight: 44 },
  h2en: { fontSize: 32, lineHeight: 38, letterSpacing: -0.3 },
  sub: { fontSize: 17, lineHeight: 24, marginTop: 12 },
  prev: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 30, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth * 2, gap: 12 },
  prevK: { fontSize: 13 },
  prevT: { fontSize: 18, lineHeight: 26, marginTop: 2 },
  live: { position: 'absolute', left: 26, right: 26, fontSize: 22, lineHeight: 38 },
  liveEn: { position: 'absolute', left: 26, right: 26, fontSize: 25, lineHeight: 34 },
  scene: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17 },
  recWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 12 },
  rec: { width: 82, height: 82, borderRadius: 41, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11 },
  dotOn: { width: 24, height: 24, borderRadius: 6 },
  ringSvg: { position: 'absolute', left: -7, top: -7 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 26 },
  side: { width: 52, height: 52 },
  photoBtn: { borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  strip: { position: 'absolute', left: 0, right: 0, height: 96 },
  thumb: { width: 64, height: 86, borderRadius: 8, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  badge: { position: 'absolute', top: 5, left: 5, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeT: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  clear: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  lblRow: { minHeight: 20, alignItems: 'center', gap: 8, paddingHorizontal: 32 },
  lbl: { fontSize: 13.5 },
  link: { borderBottomWidth: 1 },
});
