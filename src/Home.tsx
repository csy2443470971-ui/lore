import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Page, Stream } from './Doc';
import { PHOTO } from './images';
import { Pic, Said } from './session';
import { SZ } from './theme';
import { EASE, Glow, RecState, Round, TalkKey, useFace, useLang, useS, useT, useTimer } from './ui';

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

/* Home is today's writing window. What you say stays here as tidied words; Lay out turns it into a page when you choose. */
export function Home({ hidden, night, photos, said, laid, making, onCamera, onPick, onOpen, onRecord, onSaved, onLayout }: {
  hidden: boolean; night: boolean; photos: Pic[]; said: Said[]; laid: number; making: boolean;
  onCamera: () => void; onPick: () => void;
  onOpen: (p: 'archive' | 'settings') => void;
  onRecord: { start: () => void; stop: () => void; cancel: () => void };
  onSaved: (text: string) => void; onLayout: () => void;
}) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const zh = useLang() === 'zh';
  const ins = useSafeAreaInsets();
  const W = Dimensions.get('window').width;
  const [rec, setRec] = useState<RecState>('idle');
  const [shown, setShown] = useState(0);
  const [cleaned, setCleaned] = useState(false);
  const secs = useTimer(rec !== 'idle');
  const fade = useState(() => new Animated.Value(1))[0];
  const words = useRef<ReturnType<typeof setInterval> | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => { Animated.timing(fade, { toValue: hidden ? 0 : 1, duration: 360, useNativeDriver: true }).start(); }, [hidden, fade]);

  function start() {
    setShown(1); setCleaned(false); onRecord.start();
    words.current = setInterval(() => setShown((n) => Math.min(S.raw.length, n + 1)), 450);
  }
  function finish(keep: boolean) {
    if (words.current) clearInterval(words.current);
    setRec('idle');
    if (!keep) { onRecord.cancel(); setShown(0); return; }
    onRecord.stop();
    setCleaned(true);            // the filler words drop out in place, then the words settle into the transcript
    const text = S.raw.slice(0, Math.max(shown, 4)).filter((w) => w[1] !== 1).map((w) => w[0]).join('');
    setTimeout(() => { onSaved(text); setShown(0); setCleaned(false); }, 900);
  }

  const live = rec !== 'idle' || shown > 0;
  const empty = !said.length && !live && !making;
  const unlaid = said.slice(laid);
  const canLayout = unlaid.length > 0 && !live && !making;
  const top = ins.top + 8;
  const ctlBottom = ins.bottom + 30;
  const ctlH = SZ.talk + 28;
  const listBottom = ctlBottom + ctlH + (canLayout ? 70 : 30);
  const fl: Pic[] = photos.length ? photos.slice(0, 3) : [{ asset: PHOTO.cafe }, { asset: PHOTO.sunset }, { asset: PHOTO.latte }];
  const tx = [zh ? h.tx : h.txEn, { color: t.ink, fontFamily: face.body }];

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[StyleSheet.absoluteFill, { opacity: fade }]}>
      {empty ? (
        <>
          <View style={[h.hello, { top: top + 64 }]}>
            <Text style={[h.small, { color: t.mut, fontFamily: face.body }]}>{S.hi(night)}</Text>
            <Text style={[h.h3, { color: t.ink, fontFamily: face.title }]}>{S.ask0}</Text>
          </View>
          <Float src={fl[0]} x={38} y={top + 194} size={62} delay={0} />
          {fl[1] ? <Float src={fl[1]} x={W - 36 - 80} y={top + 182} size={80} delay={900} /> : null}
          {fl[2] ? <Float src={fl[2]} x={W / 2 - 34} y={top + 252} size={48} delay={1800} /> : null}
        </>
      ) : making ? (
        <View style={[StyleSheet.absoluteFill, h.making]} pointerEvents="none">
          <Glow top={Dimensions.get('window').height / 2 - 200} size={320} />
          <Text style={{ fontSize: 22, color: t.ink }}>✦</Text>
          <Text style={[h.makingT, { color: t.ink, fontFamily: face.body }]}>{S.making}</Text>
        </View>
      ) : (
        <ScrollView ref={scroll} style={[StyleSheet.absoluteFill, { top: top + 50 }]} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: listBottom, gap: 24 }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          {laid > 0 ? <Page items={said.slice(0, laid)} photos={photos} /> : null}
          {unlaid.length ? <View style={{ paddingHorizontal: 8 }}><Stream items={unlaid} photos={photos} /></View> : null}
          {live ? (
            <Text style={[tx, { paddingHorizontal: 8 }]}>
              {S.raw.slice(0, shown).map((w, i) => {
                if (w[1] === 1 && cleaned) return null;
                return <Text key={i} style={w[1] === 1 ? { color: t.strike, textDecorationLine: 'line-through' } : null}>{w[0]}</Text>;
              })}
            </Text>
          ) : null}
        </ScrollView>
      )}

      {!empty && !making ? <LinearGradient colors={[t.b + '00', t.b]} locations={[0, 0.45]} style={[h.fadeOut, { height: listBottom }]} pointerEvents="none" /> : null}

      <View style={[h.tb, { top, backgroundColor: empty || making ? 'transparent' : t.b }]}>
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

      <View style={[h.ctl, { bottom: ctlBottom }]} pointerEvents={making ? 'none' : 'box-none'}>
        <TalkKey left={{ icon: 'camera', label: S.camera, onPress: onCamera }} right={{ icon: 'photo', label: S.library, onPress: onPick }}
          state={rec} setState={setRec} secs={secs} onStart={start} onStop={() => finish(true)} onCancel={() => finish(false)} />
      </View>
    </Animated.View>
  );
}

const h = StyleSheet.create({
  tb: { position: 'absolute', left: 0, right: 0, paddingLeft: SZ.px, paddingRight: SZ.px - 4, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22 },
  hello: { position: 'absolute', left: SZ.px, right: SZ.px, alignItems: 'center' },
  small: { fontSize: 13.5, letterSpacing: 0.3 },
  h3: { fontSize: 28, lineHeight: 38, textAlign: 'center', marginTop: 6 },
  tx: { fontSize: 16, lineHeight: 29 },
  txEn: { fontSize: 17.5, lineHeight: 27 },
  making: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 },
  makingT: { fontSize: 15.5 },
  fadeOut: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  layout: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, height: 38, paddingHorizontal: 18, borderRadius: 19 },
  ctl: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
