import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SET, stickerSrc } from './stickers';
import { SZ } from './theme';
import { Text, useFace, useS, useT } from './ui';

/* The sticker box: make one from a photo, the ones made before, then Lore's set. A tap puts one on the page. */
export function StickerBox({ mine, onPick, onMake, onClose }: { mine: string[]; onPick: (s: string) => void; onMake: () => void; onClose: () => void }) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const ins = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const gap = 10, cell = (width - 2 * SZ.px - 3 * gap) / 4;
  const one = (s: string) => {
    const source = stickerSrc(s);
    return source ? (
      <Pressable key={s} onPress={() => onPick(s)} style={({ pressed }) => [{ width: cell, height: cell, padding: 6, opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
        <Image source={source} contentFit="contain" style={{ flex: 1 }} />
      </Pressable>
    ) : null;
  };
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 25 }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} onPress={onClose} accessibilityLabel={S.cancel} />
      <View style={[b.sheet, { backgroundColor: t.panel, maxHeight: height * 0.62, paddingBottom: ins.bottom + 10 }]}>
        <View style={[b.grip, { backgroundColor: t.gray }]} />
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          <View style={[b.grid, { gap }]}>
            <Pressable onPress={onMake} style={({ pressed }) => [b.make, { width: cell, height: cell, borderColor: t.mut, opacity: pressed ? 0.6 : 1 }]}>
              <Text style={{ fontSize: 22, color: t.ink, lineHeight: 24 }}>+</Text>
              <Text style={{ fontSize: 11.5, color: t.mut }}>{S.fromPhoto}</Text>
            </Pressable>
            {mine.map((f) => one('file:' + f))}
          </View>
          <Text style={[b.label, { color: t.mut, fontFamily: face.body }]}>{S.stickerSet}</Text>
          {SET.length ? <View style={[b.grid, { gap }]}>{SET.map((x) => one('set:' + x.name))}</View>
            : <Text style={{ fontSize: 13, color: t.mut }}>{S.stickersSoon}</Text>}
        </ScrollView>
      </View>
    </View>
  );
}

const b = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: SZ.panelR, borderTopRightRadius: SZ.panelR, paddingHorizontal: SZ.px, paddingTop: 10, gap: 12 },
  grip: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  make: { borderWidth: 1.2, borderStyle: 'dashed', borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 12.5, marginTop: 4 },
});
