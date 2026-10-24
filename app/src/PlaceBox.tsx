import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { canSearch, FROM, fromLink, Found, linkIn, mapsFor, Pin, search } from './places';
import { fileUri } from './store';
import { SZ } from './theme';
import { Text, TextInput, useFace, useLang, useS, useT } from './ui';

/* a card is a little taller than wide: the map on top, the name, address and where the link is from below it */
export const CARD_R = 0.92;
/* a chip is one line high, as wide as its name */
export function chipW(name: string, h = 30) {
  const fs = h * 0.44;
  let w = 0;
  for (const ch of name) w += /[㐀-鿿　-〿＀-￯]/.test(ch) ? fs : ch === ' ' ? fs * 0.3 : fs * 0.58;
  return Math.ceil(h * 0.34 * 2 + h * 0.5 + h * 0.18 + w + fs);   // room to spare: a face a little wider than guessed still fits
}
export const pinSize = (p: Pin, W: number) => {
  if (p.look === 'chip') { const w = Math.min(Math.round(W * 0.72), chipW(p.name)); return { w, r: 30 / w }; }
  return { w: Math.round(W * 0.48), r: CARD_R };
};

function PinMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 22s-7-6.1-7-11.6a7 7 0 0 1 14 0C19 15.9 12 22 12 22z" fill={color} />
      <Circle cx={12} cy={10.3} r={2.6} fill="#fff" />
    </Svg>
  );
}

/* a place on the page, at the size the page gives it */
export function PinTile({ pin, w, h }: { pin: Pin; w: number; h: number }) {
  const t = useT();
  const face = useFace();
  const lang = useLang();
  if (pin.look === 'chip') {
    return (
      <View style={[StyleSheet.absoluteFill, p.chip, { borderRadius: h / 2, paddingHorizontal: h * 0.34, gap: h * 0.18, backgroundColor: t.panel, borderColor: t.gray }]}>
        <PinMark size={h * 0.5} color={t.red} />
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: h * 0.44, color: t.ink, fontFamily: face.title }}>{pin.name}</Text>
      </View>
    );
  }
  const mapH = Math.round(h * 0.58), fs = Math.max(8.5, w * 0.08);
  const map = t.dark ? pin.map?.dark ?? pin.map?.light : pin.map?.light ?? pin.map?.dark;
  const from = pin.from ? FROM[pin.from][lang] : null;
  const room = h - mapH - 12;
  return (
    <View style={[StyleSheet.absoluteFill, p.card, { backgroundColor: t.panel, borderColor: t.gray }]}>
      <View style={{ height: mapH, backgroundColor: t.gray, overflow: 'hidden' }}>
        {map ? <Image source={{ uri: fileUri(map) }} contentFit="cover" style={StyleSheet.absoluteFill} />
          : <View style={[StyleSheet.absoluteFill, p.noMap]}><PinMark size={Math.min(28, mapH * 0.4)} color={t.red} /></View>}
      </View>
      <View style={{ flex: 1, paddingHorizontal: w * 0.06, justifyContent: 'center', gap: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: fs, color: t.ink, fontWeight: '600', fontFamily: face.title }}>{pin.name}</Text>
        {pin.address && room > fs * 2.3 ? <Text numberOfLines={1} style={{ fontSize: fs * 0.8, color: t.mut }}>{pin.address}</Text> : null}
        {from && room > fs * 3.4 ? <Text numberOfLines={1} style={{ fontSize: fs * 0.72, color: t.mut }}>{from} ↗</Text> : null}
      </View>
    </View>
  );
}

/* The place sheet: type to search Apple Maps, or paste a Google Maps, 高德 or Apple Maps link (or the message it came
   in). Choose how it shows, a card or a chip, then tap the place. */
export function PlaceBox({ onPick, onClose }: { onPick: (p: Pin) => void; onClose: () => void }) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const lang = useLang();
  const ins = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [q, setQ] = useState('');
  const [look, setLook] = useState<Pin['look']>('card');
  const [hits, setHits] = useState<Found[]>([]);
  const [linked, setLinked] = useState<(Found & { url: string; from?: Pin['from'] }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [making, setMaking] = useState(false);
  const [kb, setKb] = useState(false);                     // the keyboard is up: the sheet's foot needs no room for the home bar
  useEffect(() => {
    const on = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true));
    const off = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false));
    return () => { on.remove(); off.remove(); };
  }, []);
  /* each change of the words looks again, a moment after typing stops (a pasted link at once); only the latest answer shows */
  const asked = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const type = (v: string) => {
    setQ(v);
    const text = v.trim(), n = ++asked.current, link = linkIn(text);
    if (timer.current) clearTimeout(timer.current);
    if (!text) { setHits([]); setLinked(null); setBusy(false); return; }
    setBusy(true);
    timer.current = setTimeout(async () => {
      if (link) { const f = await fromLink(text); if (n === asked.current) { setLinked(f); setHits([]); setBusy(false); } }
      else { const r = await search(text); if (n === asked.current) { setHits(r); setLinked(null); setBusy(false); } }
    }, link ? 0 : 320);
  };
  const choose = async (f: Found & { url?: string; from?: Pin['from'] }) => {
    if (making) return;
    setMaking(true);
    const map = look === 'card' ? await mapsFor(f) : undefined;
    onPick({ ...f, name: f.name || q.trim(), look, map });
  };
  const typed = q.trim() && !linkIn(q) ? q.trim() : '';
  const row = (f: Found & { url?: string; from?: Pin['from'] }, key: string, note?: string) => (
    <Pressable key={key} onPress={() => choose(f)} style={({ pressed }) => [p.row, { borderColor: t.gray, opacity: pressed ? 0.6 : 1 }]}>
      <PinMark size={18} color={f.lat !== undefined ? t.red : t.mut} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, color: t.ink }}>{f.name || typed}</Text>
        {note || f.address ? <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.mut }}>{note ?? f.address}</Text> : null}
      </View>
    </Pressable>
  );
  const option = (k: Pin['look'], label: string) => {
    const on = look === k;
    return (
      <Pressable onPress={() => setLook(k)} style={({ pressed }) => [p.opt, { borderColor: on ? t.ink : t.gray, opacity: pressed ? 0.7 : 1 }]}>
        <View style={{ height: 54, alignItems: 'center', justifyContent: 'center' }}>
          {k === 'card' ? (
            <View style={[p.miniCard, { backgroundColor: t.panel, borderColor: t.gray }]}>
              <View style={{ height: 22, backgroundColor: t.gray, alignItems: 'center', justifyContent: 'center' }}><PinMark size={10} color={t.red} /></View>
              <View style={{ height: 3, width: 26, marginTop: 5, marginLeft: 5, borderRadius: 2, backgroundColor: t.ink }} />
              <View style={{ height: 3, width: 18, marginTop: 3, marginLeft: 5, borderRadius: 2, backgroundColor: t.mut }} />
            </View>
          ) : (
            <View style={[p.chip, { height: 22, borderRadius: 11, paddingHorizontal: 8, gap: 4, backgroundColor: t.panel, borderColor: t.gray }]}>
              <PinMark size={11} color={t.red} /><View style={{ height: 3, width: 30, borderRadius: 2, backgroundColor: t.ink }} />
            </View>
          )}
        </View>
        <Text style={{ fontSize: 12.5, color: on ? t.ink : t.mut, textAlign: 'center' }}>{label}</Text>
      </Pressable>
    );
  };
  /* the sheet sits in the flow at the bottom (not pinned there), so the keyboard pushes all of it up above itself; with
     the keyboard up it may shrink, and the list inside scrolls */
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[StyleSheet.absoluteFill, p.wrap, { paddingTop: ins.top + 56 }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} onPress={onClose} accessibilityLabel={S.cancel} />
      <View style={[p.sheet, { backgroundColor: t.panel, maxHeight: height * 0.72, paddingBottom: kb ? 10 : ins.bottom + 10 }]}>
        <View style={[p.grip, { backgroundColor: t.gray }]} />
        <Text style={[p.title, { color: t.ink, fontFamily: face.title }]}>{S.placeTitle}</Text>
        <View style={[p.field, { backgroundColor: t.b }]}>
          <TextInput value={q} onChangeText={type} placeholder={S.placeAsk} placeholderTextColor={t.mut} returnKeyType="search"
            style={[p.input, { color: t.ink }]} autoCorrect={false} />
          {busy || making ? <ActivityIndicator size="small" color={t.mut} /> : q ? (
            <Pressable onPress={() => type('')} hitSlop={10}><Text style={{ color: t.mut, fontSize: 15 }}>✕</Text></Pressable>
          ) : null}
        </View>
        <View style={p.opts}>{option('card', S.placeCard)}{option('chip', S.placeChip)}</View>
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 6 }} showsVerticalScrollIndicator={false}>
          {linked ? row(linked, 'link', [linked.from ? FROM[linked.from][lang] : null, linked.address].filter(Boolean).join(' · ') || undefined) : null}
          {hits.map((f, i) => row(f, `h${i}`))}
          {typed && !busy ? row({ name: typed }, 'typed', S.placeAsTyped) : null}
          {!q.trim() ? <Text style={[p.hint, { color: t.mut }]}>{canSearch ? S.placeHint : S.placeNeedsApp}</Text>
            : !busy && !linked && !hits.length && canSearch ? <Text style={[p.hint, { color: t.mut }]}>{S.placeNone}</Text> : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const p = StyleSheet.create({
  wrap: { zIndex: 25, justifyContent: 'flex-end' },
  sheet: { flexShrink: 1, borderTopLeftRadius: SZ.panelR, borderTopRightRadius: SZ.panelR, paddingHorizontal: SZ.px, paddingTop: 10, gap: 12 },
  grip: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  title: { fontSize: 16, textAlign: 'center' },
  field: { height: 44, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, fontSize: 15.5, paddingVertical: 0 },
  opts: { flexDirection: 'row', gap: 10 },
  opt: { flex: 1, borderWidth: 1.2, borderRadius: 14, paddingVertical: 6, gap: 2 },
  miniCard: { width: 44, height: 44, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  hint: { fontSize: 13, lineHeight: 19, paddingVertical: 10 },
  card: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  noMap: { alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
});
