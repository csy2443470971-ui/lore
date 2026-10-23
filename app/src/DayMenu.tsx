import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SZ } from './theme';
import { useFace, useT } from './ui';

/* The menu under the title, in three parts. At the top, the last three days side by side as circles: the day before
   and yesterday by their date alone, today by name; the one open now is filled, and a small red dot marks a day with
   something written. Then this week. Then combining days (and splitting them, on a page that runs over several). */
export type DayDot = { key: string; label: string; has: boolean };
export type DayRow = { key: string; label: string; date?: string };
export function DayMenu({ days, cur, rows, more, onPick, onClose }: {
  days: DayDot[]; cur: string; rows: DayRow[]; more: DayRow[];
  onPick: (key: string) => void; onClose: () => void;
}) {
  const t = useT();
  const face = useFace();
  const top = useSafeAreaInsets().top + 58;            // just under the title bar
  const row = (o: DayRow) => (
    <Pressable key={o.key} onPress={() => onPick(o.key)} style={({ pressed }) => [m.row, pressed && { opacity: 0.6 }]}>
      <Text style={[m.label, { color: t.ink, fontFamily: face.title, fontWeight: o.key === cur ? '600' : '400' }]}>{o.label}</Text>
      {o.date ? <Text style={[m.date, { color: t.mut }]}>{o.date}</Text> : null}
    </Pressable>
  );
  const rule = <View style={[m.rule, { backgroundColor: t.gray }]} />;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="close" />
      <View style={[m.card, { top, backgroundColor: t.panel }]}>
        <View style={m.dots}>
          {days.map((d) => {
            const on = d.key === cur;
            return (
              <Pressable key={d.key} onPress={() => onPick(d.key)} style={({ pressed }) => [m.dotWrap, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={d.label}>
                <View style={[m.dot, d.label.length > 2 && m.dotWide, { borderColor: on ? t.pill : t.gray, backgroundColor: on ? t.pill : 'transparent' }]}>
                  <Text style={[m.dotT, { color: on ? t.pillText : t.ink, fontFamily: face.title }]}>{d.label}</Text>
                </View>
                <View style={[m.mark, { backgroundColor: d.has ? t.red : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>
        {rule}
        {rows.map(row)}
        {rule}
        {more.map(row)}
      </View>
    </View>
  );
}

const m = StyleSheet.create({
  card: { position: 'absolute', left: SZ.px - 6, width: 250, borderRadius: 18, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  dots: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  dotWrap: { alignItems: 'center', gap: 5 },
  dot: { minWidth: 44, height: 44, borderRadius: 22, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center' },
  dotWide: { paddingHorizontal: 14 },
  dotT: { fontSize: 16 },
  mark: { width: 5, height: 5, borderRadius: 2.5 },
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: 16, marginVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 44 },
  label: { fontSize: 16, flex: 1 },
  date: { fontSize: 13 },
});
