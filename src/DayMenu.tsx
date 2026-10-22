import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SZ } from './theme';
import { useFace, useT } from './ui';

/* the menu under the title: today, yesterday, the day before and this week. A small red dot marks a day that
   has something written; the one open now is set in bold */
export type DayOpt = { key: string; label: string; date: string; has: boolean };
export function DayMenu({ opts, cur, onPick, onClose }: { opts: DayOpt[]; cur: string; onPick: (key: string) => void; onClose: () => void }) {
  const t = useT();
  const top = useSafeAreaInsets().top + 58;            // just under the title bar
  const face = useFace();
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="close" />
      <View style={[m.card, { top, backgroundColor: t.panel }]}>
        {opts.map((o, i) => (
          <Pressable key={o.key} onPress={() => onPick(o.key)} style={({ pressed }) => [m.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.gray }, pressed && { opacity: 0.6 }]}>
            <View style={[m.dot, { backgroundColor: o.has ? t.red : 'transparent' }]} />
            <Text style={[m.label, { color: t.ink, fontFamily: face.title, fontWeight: o.key === cur ? '600' : '400' }]}>{o.label}</Text>
            <Text style={[m.date, { color: t.mut }]}>{o.date}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const m = StyleSheet.create({
  card: { position: 'absolute', left: SZ.px - 6, width: 250, borderRadius: 18, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 46 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 16, flex: 1 },
  date: { fontSize: 13 },
});
