import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayKey } from './store';
import { SZ } from './theme';
import { Text, useFace, useLang, useS, useT } from './ui';

/* Choosing days to write as one page: a month of days, Monday first. Tap the first day and then the last, or drag
   across them; the days between join into one band. Days with something written have a small red dot. */
export function RangePicker({ today, has, onPick, onClose }: { today: string; has: (key: string) => boolean; onPick: (from: string, to: string) => void; onClose: () => void }) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const zh = useLang() === 'zh';
  const ins = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [ty, tm] = today.split('-').map(Number);
  const [month, setMonth] = useState({ y: ty, m: tm });          // m: 1 to 12
  const [sel, setSel] = useState<{ a: string; b: string } | null>(null);
  const cw = (width - 2 * SZ.px) / 7, chh = 44;

  /* the month's days, in rows of seven */
  const cells = useMemo(() => {
    const first = new Date(month.y, month.m - 1, 1), lead = (first.getDay() + 6) % 7;
    const n = new Date(month.y, month.m, 0).getDate();
    return Array.from({ length: lead + n }, (_, i) => (i < lead ? null : dayKey(new Date(month.y, month.m - 1, i - lead + 1))));
  }, [month]);
  const lo = sel ? (sel.a < sel.b ? sel.a : sel.b) : '', hi = sel ? (sel.a < sel.b ? sel.b : sel.a) : '';
  const count = sel ? Math.round((Date.parse(hi) - Date.parse(lo)) / 86400000) + 1 : 0;

  /* the finger on the grid: a tap starts a choice (or, after one tap, ends it), a drag stretches it */
  const grid = useRef({ cells, cw });
  useEffect(() => { grid.current = { cells, cw }; });
  const pr = useMemo(() => {
    const at = (x: number, y: number) => {
      const { cells: cs, cw: w } = grid.current;
      const k = cs[Math.floor(y / chh) * 7 + Math.floor(x / w)];
      return k && k <= today ? k : null;
    };
    /* the handlers only run during a gesture, never while rendering */
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (ev) => {
        const k = at(ev.nativeEvent.locationX, ev.nativeEvent.locationY);
        if (k) setSel((cur) => (cur && cur.a === cur.b && cur.a !== k ? { a: cur.a, b: k } : { a: k, b: k }));
      },
      onPanResponderMove: (ev) => {
        const k = at(ev.nativeEvent.locationX, ev.nativeEvent.locationY);
        if (k) setSel((cur) => (cur && k !== cur.b ? { a: cur.a, b: k } : cur));
      },
    });
  }, [today]);

  const title = zh ? `${month.y}年${month.m}月` : `${S.months[month.m - 1]} ${month.y}`;
  const heads = zh ? ['一', '二', '三', '四', '五', '六', '日'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const canNext = month.y < ty || (month.y === ty && month.m < tm);
  const go = (d: number) => setMonth(({ y, m }) => { const n = new Date(y, m - 1 + d, 1); return { y: n.getFullYear(), m: n.getMonth() + 1 }; });

  /* the band behind the chosen days, one piece per row */
  const rows = Math.ceil(cells.length / 7);
  const bands: { row: number; c0: number; c1: number; start: boolean; end: boolean }[] = [];
  if (sel) for (let r = 0; r < rows; r++) {
    const inRow = cells.slice(r * 7, r * 7 + 7).map((k, c) => ({ k, c })).filter((x) => x.k && x.k >= lo && x.k <= hi);
    if (inRow.length) bands.push({ row: r, c0: inRow[0].c, c1: inRow[inRow.length - 1].c, start: inRow[0].k === lo, end: inRow[inRow.length - 1].k === hi });
  }

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 25 }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} onPress={onClose} accessibilityLabel={S.cancel} />
      <View style={[r.sheet, { backgroundColor: t.panel, paddingBottom: ins.bottom + 16 }]}>
        <View style={r.head}>
          <Pressable onPress={() => go(-1)} hitSlop={10}><Text style={[r.arrow, { color: t.ink }]}>‹</Text></Pressable>
          <Text style={[r.month, { color: t.ink, fontFamily: face.title }]}>{title}</Text>
          <Pressable onPress={() => canNext && go(1)} hitSlop={10}><Text style={[r.arrow, { color: t.ink, opacity: canNext ? 1 : 0.2 }]}>›</Text></Pressable>
        </View>
        <Text style={[r.hint, { color: t.mut }]}>{S.rangeAsk}</Text>
        <View style={r.week}>
          {heads.map((h, i) => <Text key={i} style={[r.wd, { width: cw, color: t.mut }]}>{h}</Text>)}
        </View>
        <View {...pr.panHandlers} style={[{ height: rows * chh }, r.noSelect]}>
          {bands.map((b) => (
            <View key={b.row} pointerEvents="none" style={[r.band, {
              top: b.row * chh + 4, height: chh - 8, left: b.c0 * cw + (b.start ? 4 : 0), width: (b.c1 - b.c0 + 1) * cw - (b.start ? 4 : 0) - (b.end ? 4 : 0),
              backgroundColor: t.gray, borderTopLeftRadius: b.start ? 18 : 0, borderBottomLeftRadius: b.start ? 18 : 0, borderTopRightRadius: b.end ? 18 : 0, borderBottomRightRadius: b.end ? 18 : 0,
            }]} />
          ))}
          {cells.map((k, i) => {
            if (!k) return null;
            const edge = k === lo || k === hi, future = k > today;
            return (
              <View key={k} pointerEvents="none" style={[r.cell, { left: (i % 7) * cw, top: Math.floor(i / 7) * chh, width: cw, height: chh }]}>
                <View style={[r.num, edge && { backgroundColor: t.pill }]}>
                  <Text style={{ fontSize: 15, color: edge ? t.pillText : t.ink, opacity: future ? 0.25 : 1 }}>{Number(k.slice(8))}</Text>
                </View>
                <View style={[r.dot, { backgroundColor: has(k) && !edge ? t.red : 'transparent' }]} />
              </View>
            );
          })}
        </View>
        <Pressable disabled={count < 2} onPress={() => onPick(lo, hi)} style={({ pressed }) => [r.go, { backgroundColor: t.pill, opacity: count < 2 ? 0.3 : pressed ? 0.8 : 1 }]}>
          <Text style={{ fontSize: 15.5, color: t.pillText }}>{S.rangeGo(Math.max(count, 2))}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const r = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: SZ.panelR, borderTopRightRadius: SZ.panelR, paddingHorizontal: SZ.px, paddingTop: 18, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  arrow: { fontSize: 26, lineHeight: 28, paddingHorizontal: 8 },
  month: { fontSize: 18 },
  hint: { fontSize: 12.5, textAlign: 'center' },
  week: { flexDirection: 'row', marginTop: 4 },
  wd: { textAlign: 'center', fontSize: 12 },
  band: { position: 'absolute' },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  num: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, position: 'absolute', bottom: 3 },
  go: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  noSelect: { userSelect: 'none' } as object,   // the web preview: dragging across the days doesn't select their numbers
});
