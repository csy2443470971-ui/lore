import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PHOTO } from './images';
import { Pic } from './session';
import { SZ } from './theme';
import { EASE, Icon, RecState, Round, TalkKey, useFace, useS, useT, useTimer } from './ui';

/* one photo that drifts a few points up and down, out of step with the others */
function Float({ src, x, y, size, delay }: { src: Pic; x: number; y: number; size: number; delay: number }) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(v, { toValue: -5, duration: 3000, easing: EASE, useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: 3000, easing: EASE, useNativeDriver: true })]));
    a.start(); return () => a.stop();
  }, [v, delay]);
  return (
    <Animated.View style={{ position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: 18, overflow: 'hidden', transform: [{ translateY: v }] }}>
      <Image source={src.uri ? { uri: src.uri } : src.asset} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

export function Home({ hidden, night, photos, saidCount, onPick, onOpen, onRecord, onSaved }: {
  hidden: boolean; night: boolean; photos: Pic[]; saidCount: number; onPick: () => void;
  onOpen: (p: 'entry' | 'archive' | 'settings') => void;
  onRecord: { start: () => void; stop: () => void; cancel: () => void };
  onSaved: (text: string) => void;
}) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const ins = useSafeAreaInsets();
  const W = Dimensions.get('window').width;
  const [rec, setRec] = useState<RecState>('idle');
  const [shown, setShown] = useState(0);
  const [cleaned, setCleaned] = useState(false);
  const secs = useTimer(rec !== 'idle');
  const fade = useState(() => new Animated.Value(1))[0];
  const words = useRef<number | null>(null);

  useEffect(() => { Animated.timing(fade, { toValue: hidden ? 0 : 1, duration: 360, useNativeDriver: true }).start(); }, [hidden, fade]);

  function start() {
    setShown(1); setCleaned(false); onRecord.start();
    words.current = setInterval(() => setShown((n) => Math.min(S.raw.length, n + 1)), 450) as unknown as number;
  }
  function finish(keep: boolean) {
    if (words.current) clearInterval(words.current);
    setRec('idle');
    if (!keep) { onRecord.cancel(); setShown(0); return; }
    onRecord.stop();
    setCleaned(true);
    const text = S.raw.slice(0, Math.max(shown, 4)).filter((w) => w[1] !== 1).map((w) => w[0]).join('');
    setTimeout(() => { onSaved(text); setShown(0); setCleaned(false); }, 1600);
  }

  const talking = rec !== 'idle' || shown > 0;
  const top = ins.top + 8;
  const fl: Pic[] = photos.length ? photos.slice(0, 3) : [{ asset: PHOTO.cafe }, { asset: PHOTO.sunset }, { asset: PHOTO.latte }];
  const under = rec === 'tap' ? S.tapToEnd : rec === 'hold' ? S.slideCancel : S.holdToo;
  const status = rec === 'tap' ? S.listening : S.holding;
  const mm = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[StyleSheet.absoluteFill, { opacity: fade }]}>
      <View style={[h.tb, { top }]}>
        <Text style={[h.title, { color: t.ink, fontFamily: face.title }]}>{S.navToday}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Round icon="cal" label={S.archive} onPress={() => onOpen('archive')} />
          <Round icon="gear" label={S.settings} onPress={() => onOpen('settings')} />
        </View>
      </View>

      {!talking ? (
        <>
          <View style={[h.hello, { top: top + 64 }]}>
            <Text style={[h.small, { color: t.mut, fontFamily: face.body }]}>{S.hi(night)}</Text>
            <Text style={[h.h3, { color: t.ink, fontFamily: face.title }]}>{S.ask0}</Text>
          </View>
          <Float src={fl[0]} x={38} y={top + 194} size={62} delay={0} />
          {fl[1] ? <Float src={fl[1]} x={W - 36 - 80} y={top + 182} size={80} delay={900} /> : null}
          {fl[2] ? <Float src={fl[2]} x={W / 2 - 34} y={top + 252} size={48} delay={1800} /> : null}
          <Pressable onPress={() => saidCount && onOpen('entry')} style={[h.bubble, { top: top + 336, backgroundColor: t.panel }]}>
            <Text style={[h.bubbleT, { color: t.ink, fontFamily: face.body }]}>{saidCount ? S.bubbleMore : S.bubbleNone}</Text>
            {saidCount ? <Icon name="chev" color={t.mut} size={14} /> : null}
          </Pressable>
        </>
      ) : (
        <View style={[h.live, { top: top + 70 }]}>
          <Text style={[h.status, { color: cleaned ? t.mut : t.red }]}>{cleaned ? S.cleaning : `${status}，${mm}`}</Text>
          <Text style={[h.liveT, { color: t.ink, fontFamily: face.body }]}>
            {S.raw.slice(0, shown).map((w, i) => {
              if (w[1] === 1 && cleaned) return null;
              return <Text key={i} style={w[1] === 1 ? { color: t.strike, textDecorationLine: 'line-through' } : null}>{w[0]}</Text>;
            })}
          </Text>
        </View>
      )}

      <View style={[h.ctl, { bottom: ins.bottom + 92 }]}>
        <TalkKey label={S.tapTalk} sideIcon="photo" onSide={onPick} state={rec} setState={setRec} secs={secs}
          onStart={start} onStop={() => finish(true)} onCancel={() => finish(false)} />
        <Text style={[h.under, { color: t.mut }]}>{under}</Text>
      </View>

      <View style={[h.nav, { bottom: ins.bottom + 14, backgroundColor: t.panel, opacity: talking ? 0.3 : 1 }]} pointerEvents={talking ? 'none' : 'auto'}>
        {([['mic', S.navToday, null], ['book', S.navBack, 'archive'], ['user', S.navMe, 'settings']] as const).map(([ic, lb, to], k) => (
          <Pressable key={lb} onPress={() => to && onOpen(to)} style={[h.navI, k === 0 && { backgroundColor: t.gray }]}>
            <Icon name={ic} color={k === 0 ? t.ink : t.mut} size={17} />
            <Text style={{ fontSize: 11, color: k === 0 ? t.ink : t.mut }}>{lb}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

const h = StyleSheet.create({
  tb: { position: 'absolute', left: SZ.px, right: SZ.px - 4, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22 },
  hello: { position: 'absolute', left: SZ.px, right: SZ.px, alignItems: 'center' },
  small: { fontSize: 13.5, letterSpacing: 0.3 },
  h3: { fontSize: 28, lineHeight: 38, textAlign: 'center', marginTop: 6 },
  bubble: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  bubbleT: { fontSize: 13 },
  live: { position: 'absolute', left: 26, right: 26, alignItems: 'center' },
  status: { fontSize: 12.5, marginBottom: 10, fontVariant: ['tabular-nums'] },
  liveT: { fontSize: 19, lineHeight: 33, textAlign: 'center' },
  ctl: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 10 },
  under: { fontSize: 12.5 },
  nav: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', gap: 2, padding: 4, borderRadius: 26 },
  navI: { width: 64, paddingTop: 5, paddingBottom: 4, borderRadius: 22, alignItems: 'center' },
});
