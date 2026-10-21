import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PHOTO } from './images';
import { Pic, Said } from './session';
import { F, SZ } from './theme';
import { Icon, Meta, Panel, Round, s as us, useFace, useLang, useS, useT } from './ui';

const src = (p: Pic) => (p.uri ? { uri: p.uri } : p.asset);

/* one property line: icon, name, value — like the top of a Notion page */
function Prop({ icon, k, v }: { icon: 'cal' | 'pin' | 'mic' | 'photo'; k: string; v: string }) {
  const t = useT();
  return (
    <View style={st.prop}>
      <Icon name={icon} color={t.mut} size={14} />
      <Text style={[st.propK, { color: t.mut }]}>{k}</Text>
      <Text style={[st.propV, { color: t.ink }]}>{v}</Text>
    </View>
  );
}

/* a group of photos: up to four in a 2×2 block, with its number range in the corner */
function Group({ pics, tag }: { pics: Pic[]; tag?: string }) {
  const t = useT();
  return (
    <View style={st.mos}>
      {pics.slice(0, 4).map((p, i) => <Image key={i} source={src(p)} contentFit="cover" style={st.mosI} />)}
      {tag ? <View style={[st.tag, { backgroundColor: t.dark ? 'rgba(18,18,17,0.82)' : 'rgba(255,255,255,0.95)' }]}><Text style={{ fontSize: 12, color: t.ink }}>{tag}</Text></View> : null}
    </View>
  );
}

/* one big photo on the left, two stacked on the right */
function Three({ pics }: { pics: Pic[] }) {
  return (
    <View style={st.three}>
      <Image source={src(pics[0])} contentFit="cover" style={[st.r, { flex: 2 }]} />
      <View style={{ flex: 1, gap: SZ.tileGap }}>
        <Image source={src(pics[1])} contentFit="cover" style={[st.r, { flex: 1 }]} />
        <Image source={src(pics[2])} contentFit="cover" style={[st.r, { flex: 1 }]} />
      </View>
    </View>
  );
}

export function Entry({ open, onClose, onArchive, voiceUri, photos, said }: {
  open: boolean; onClose: () => void; onArchive: () => void; voiceUri: string | null; photos: Pic[]; said: Said[];
}) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const zh = useLang() === 'zh';
  const ins = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [kb, setKb] = useState(0);
  const [fold, setFold] = useState(false);
  const player = useAudioPlayer(voiceUri ?? undefined);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKb(e.endCoordinates.height));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
    return () => { a.remove(); b.remove(); };
  }, []);

  function togglePlay() {
    if (!voiceUri) return;
    if (status.playing) player.pause(); else { if (status.didJustFinish || status.currentTime >= status.duration) player.seekTo(0); player.play(); }
  }

  const tx = [zh ? st.tx : st.txEn, { color: t.ink, fontFamily: face.body }];
  const sample: Pic[] = [PHOTO.cafe, PHOTO.latte, PHOTO.causeway, PHOTO.sunset, PHOTO.osmanthus, PHOTO.noodles, PHOTO.lanterns, PHOTO.hotpot].map((a) => ({ asset: a }));
  const nPics = photos.length || 12;
  const cover = photos[0] || { asset: PHOTO.sunset };
  const tagOf = (idx: number[]) => (idx.length > 1 ? `${idx[0] + 1}–${idx[idx.length - 1] + 1}` : String(idx[0] + 1));

  return (
    <Panel open={open} onBack={onClose}
      top={<><Round icon="down" label={S.back} onPress={onClose} /><Text style={[us.topLbl, { color: t.ink }]}>{S.today}</Text><Round icon="list" label={S.archive} onPress={onArchive} /></>}
      footer={
        <View style={[st.ask, { paddingBottom: Math.max(ins.bottom, 12) + 4, transform: [{ translateY: kb ? -kb + ins.bottom : 0 }] }]}>
          <LinearGradient colors={[t.dark ? 'rgba(30,29,27,0)' : 'rgba(255,255,255,0)', t.panel]} locations={[0, 0.5]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[st.field, { backgroundColor: t.b }]}>
            <TextInput value={q} onChangeText={setQ} onSubmitEditing={() => { setQ(''); Keyboard.dismiss(); }} returnKeyType="send" placeholder={S.askPh} placeholderTextColor={t.mut}
              style={[st.input, { color: t.ink }]} />
            <Pressable accessibilityLabel={S.speak} style={st.mic}><Icon name="mic" color={t.mut} /></Pressable>
            <Pressable accessibilityLabel={S.ask} onPress={() => { setQ(''); Keyboard.dismiss(); }} style={[st.go, { backgroundColor: t.pill }]}><Icon name="up" color={t.pillText} /></Pressable>
          </View>
        </View>
      }>
      <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: SZ.px, paddingTop: 18, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
        <Image source={src(cover)} contentFit="cover" style={st.cover} />
        <Text style={[zh ? st.title : st.titleEn, { color: t.ink, fontFamily: face.title }]}>{S.todayTitle}</Text>
        <View style={st.props}>
          <Prop icon="cal" k={S.pDate} v={S.date} />
          <Prop icon="pin" k={S.pPlace} v={S.place} />
          <Prop icon="mic" k={S.pSaid} v={S.voiceLen} />
          <Prop icon="photo" k={S.pPhotos} v={S.nPhotos(nPics, 0)} />
        </View>

        {voiceUri ? (
          <Pressable onPress={togglePlay} style={[st.voice, { backgroundColor: t.b }]} accessibilityRole="button">
            <View style={[st.play, { backgroundColor: t.pill }]}><Text style={{ color: t.pillText, fontSize: 9 }}>{status.playing ? '❚❚' : '▶'}</Text></View>
            <Text style={{ fontSize: 13.5, color: t.ink }}>{S.playNew}</Text>
          </Pressable>
        ) : null}

        {/* what was said just now, newest first */}
        {said.slice().reverse().map((x, i) => x.kind === 'talk' ? (
          <View key={'s' + i} style={st.block}><Meta style={{ marginBottom: 4 }}>{S.justNow}</Meta><Text style={tx}>{x.text}</Text></View>
        ) : (
          <View key={'s' + i} style={st.block}>
            <Meta style={{ marginBottom: 6 }}>{S.justNow}</Meta>
            {x.parts.map((p, j) => (
              <View key={j} style={{ gap: 10, marginBottom: 14 }}>
                {p.unit.idx.length > 1 ? <Group pics={p.unit.idx.map((k) => photos[k]).filter(Boolean)} tag={tagOf(p.unit.idx)} />
                  : photos[p.unit.idx[0]] ? <Image source={src(photos[p.unit.idx[0]])} contentFit="cover" style={st.one} /> : null}
                <Text style={tx}>{p.text}</Text>
              </View>
            ))}
          </View>
        ))}

        {/* the sample day */}
        <View style={st.block}>
          <Group pics={sample.slice(0, 4)} tag="3–6" />
          <Text style={tx}>{S.t1}</Text>
        </View>
        <View style={st.block}>
          <Three pics={[sample[3], sample[4], sample[1]]} />
          <Text style={tx}>{S.t2}</Text>
        </View>
        <Text style={[tx, { color: t.mut }]}>{S.t3}</Text>

        <Pressable onPress={() => setFold(!fold)} style={st.fold}>
          <Icon name={fold ? 'down' : 'chev'} color={t.mut} size={14} />
          <Text style={{ fontSize: 14, color: t.ink }}>{S.foldMore(5)}</Text>
          <View style={st.mini}>{sample.slice(4, 8).map((p, i) => <Image key={i} source={src(p)} contentFit="cover" style={[st.miniI, { borderColor: t.panel }]} />)}</View>
        </Pressable>
        {fold ? <View style={st.foldGrid}>{sample.slice(3, 8).map((p, i) => <Image key={i} source={src(p)} contentFit="cover" style={st.foldI} />)}</View> : null}

        <View style={[st.callout, { backgroundColor: t.b }]}>
          <Text style={{ fontSize: 15 }}>✦</Text>
          <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 21, color: t.mut }}>{S.callout}</Text>
        </View>
      </ScrollView>
      {/* while the keyboard is up, a tap anywhere on the page puts it away */}
      {kb > 0 && <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} accessibilityLabel={S.back} />}
    </Panel>
  );
}

export const st = StyleSheet.create({
  cover: { height: 112, borderRadius: SZ.panelR - 8, marginBottom: 18 },
  title: { fontSize: 26, lineHeight: 36 },
  titleEn: { fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  props: { marginTop: 14, marginBottom: 22, gap: 9 },
  prop: { flexDirection: 'row', alignItems: 'center' },
  propK: { width: 54, marginLeft: 9, fontSize: 13.5 },
  propV: { flex: 1, fontSize: 13.5 },
  voice: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 10, padding: 6, paddingRight: 16, borderRadius: 999, marginBottom: 20 },
  play: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  block: { gap: 12, marginBottom: 18 },
  tx: { fontSize: 15.5, lineHeight: 29 },
  txEn: { fontSize: 17.5, lineHeight: 27 },
  mos: { flexDirection: 'row', flexWrap: 'wrap', gap: SZ.tileGap },
  mosI: { width: '48.7%', aspectRatio: 1, borderRadius: 12 },
  tag: { position: 'absolute', left: 6, top: 6, height: 22, paddingHorizontal: 8, borderRadius: 11, justifyContent: 'center' },
  three: { flexDirection: 'row', gap: SZ.tileGap, aspectRatio: 3 / 2 },
  r: { borderRadius: 12 },
  one: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, marginTop: 4 },
  mini: { flexDirection: 'row', marginLeft: 'auto' },
  miniI: { width: 26, height: 26, borderRadius: 8, marginLeft: -7, borderWidth: 2 },
  foldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SZ.tileGap, marginBottom: 8 },
  foldI: { width: '32%', aspectRatio: 1, borderRadius: SZ.tileR },
  callout: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, marginTop: 14 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 26 },
  num: { fontFamily: F.serifLight, fontSize: 26, lineHeight: 30 },
  ask: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 40, paddingHorizontal: 14, zIndex: 3 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 50, paddingLeft: 18, paddingRight: 5, borderRadius: 25 },
  input: { flex: 1, fontSize: 15, height: 50 },
  mic: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  go: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
