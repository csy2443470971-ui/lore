import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Page, Stream } from './Doc';
import { Day } from './session';
import { SZ } from './theme';
import { Round, useFace, useS, useT } from './ui';

const still = () => {};

/* This week, Monday to today: each day's page under its date, as it was laid out (and what was said after).
   A tap anywhere in a day opens that day on the writing page. */
export function Week({ days, keys, labelOf, title, voice, indent, onTitle, onOpen, onDay }: {
  days: Record<string, Day>; keys: string[]; labelOf: (key: string) => string; title: string; voice: boolean; indent: boolean;
  onTitle: () => void; onOpen: (p: 'archive' | 'settings') => void; onDay: (key: string) => void;
}) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const ins = useSafeAreaInsets();
  const top = ins.top + 8;
  return (
    <View style={StyleSheet.absoluteFill}>
      <ScrollView style={[StyleSheet.absoluteFill, { top: top + 50 }]} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SZ.px, paddingTop: 10, paddingBottom: ins.bottom + 60, gap: 30 }}>
        {keys.map((k) => {
          const d = days[k];
          const has = !!d && (d.said.length > 0 || d.photos.length > 0);
          return (
            <View key={k} style={{ gap: 6 }}>
              <Pressable onPress={() => onDay(k)} hitSlop={6}>
                <Text style={[w.day, { color: t.ink, fontFamily: face.title }]}>{labelOf(k)}</Text>
              </Pressable>
              {!has ? <Text style={[w.none, { color: t.mut, fontFamily: face.body }]}>{S.weekNone}</Text> : null}
              {has && d.laid > 0 ? (
                <Page items={d.said.slice(0, d.laid)} photos={d.photos} placed={d.placed} moved={d.moved} voice={voice} indent={indent} title="" meta=""
                  onDrag={still} onMove={still} onEdit={() => onDay(k)} />
              ) : null}
              {has && d.said.length > d.laid ? <Stream items={d.said.slice(d.laid)} onEdit={() => onDay(k)} /> : null}
            </View>
          );
        })}
      </ScrollView>
      <View style={[w.tb, { top, backgroundColor: t.b }]}>
        <Pressable onPress={onTitle} hitSlop={8} style={w.titleBtn} accessibilityRole="button">
          <Text style={[w.title, { color: t.ink, fontFamily: face.title }]}>{title}</Text>
          <Text style={[w.caret, { color: t.mut }]}>▾</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Round icon="cal" label={S.archive} onPress={() => onOpen('archive')} />
          <Round icon="gear" label={S.settings} onPress={() => onOpen('settings')} />
        </View>
      </View>
    </View>
  );
}

const w = StyleSheet.create({
  tb: { position: 'absolute', left: 0, right: 0, paddingLeft: SZ.px, paddingRight: SZ.px - 4, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 22 },
  caret: { fontSize: 13, marginTop: 3 },
  day: { fontSize: 17, lineHeight: 24 },
  none: { fontSize: 14 },
});
