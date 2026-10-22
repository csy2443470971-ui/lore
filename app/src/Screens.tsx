import React, { useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ent, Kind, Lang, MONTH_MIN } from './data';
import { PHOTO } from './images';
import { F, SZ } from './theme';
import { Icon, Meta, Panel, Round, s as us, useFace, useLang, useS, useT } from './ui';

type Mode = 'light' | 'dark' | 'auto';

function Heading({ title, side }: { title: string; side: string }) {
  const t = useT();
  const face = useFace();
  const zh = useLang() === 'zh';
  return (
    <View style={a.hRow}>
      <Text style={[zh ? a.h3 : a.h3en, { color: t.ink, fontFamily: face.title }]}>{title}</Text>
      <Text style={{ fontSize: 14, color: t.mut }}>{side}</Text>
    </View>
  );
}

/* the pictures on the right of an entry: one photo for a day, a fan of three for three days, a 2×2 block for a week */
function Thumbs({ e }: { e: Ent }) {
  const t = useT();
  if (e.k === 'week') {
    return <View style={a.th4}>{e.p.slice(0, 4).map((p, i) => <Image key={i} source={PHOTO[p]} contentFit="cover" style={a.th4i} />)}</View>;
  }
  if (e.k === 'three') {
    return (
      <View style={{ width: 70, height: 52 }}>
        {e.p.slice(0, 3).map((p, i) => <Image key={i} source={PHOTO[p]} contentFit="cover" style={[a.th3, { left: i * 15, borderColor: t.b, zIndex: 3 - i }]} />)}
      </View>
    );
  }
  return <Image source={PHOTO[e.p[0]]} contentFit="cover" style={a.th} />;
}

function Tag({ k }: { k: Kind }) {
  const t = useT();
  const S = useS();
  const bg = k === 'week' ? t.pill : k === 'three' ? t.gray : t.panel;
  const fg = k === 'week' ? t.pillText : k === 'three' ? t.ink : t.mut;
  return <View style={[a.tag, { backgroundColor: bg }]}><Text style={{ fontSize: 11.5, color: fg }}>{k === 'week' ? S.kWeek : k === 'three' ? S.kThree : S.kDay}</Text></View>;
}

/* ---------- look back: the month first, then everything written, each one labelled ---------- */
export function Archive({ open, onClose, onEntry, onInsights }: { open: boolean; onClose: () => void; onEntry: (i: number) => void; onInsights: () => void }) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const ins = useSafeAreaInsets();
  const [kind, setKind] = useState<'all' | Kind>('all');
  const byDay = (d: number) => S.entries.findIndex((e) => e.day === d);
  const cells: React.ReactNode[] = [];
  for (let b = 0; b < 3; b++) cells.push(<View key={'b' + b} style={a.cell} />);
  for (let d = 1; d <= 31; d++) {
    const m = MONTH_MIN[d - 1] ?? 0, fut = d > 17, today = d === 17;
    const size = m ? Math.min(26, 8 + m * 2.2) : 3;
    cells.push(
      <Pressable key={d} disabled={byDay(d) < 0} onPress={() => onEntry(byDay(d))} style={a.cell}>
        <Text style={[a.cn, { color: today ? t.red : fut ? t.strike : t.mut, fontWeight: today ? '600' : '400' }]}>{d}</Text>
        <View style={a.dotBox}>
          {!fut && <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: m ? t.ink : t.gray }} />}
          {today && <View style={[a.todayRing, { borderColor: t.red, width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 }]} />}
        </View>
      </Pressable>
    );
  }
  const list = S.entries.map((e, i) => ({ e, i })).filter(({ e }) => kind === 'all' || e.k === kind);
  return (
    <Panel open={open} onBack={onClose} top={<><Round icon="back" label={S.back} onPress={onClose} /><Text style={[us.topLbl, { color: t.ink }]}>{S.look}</Text><View style={{ width: 36 }} /></>}>
      <ScrollView contentContainerStyle={{ padding: SZ.px, paddingTop: 24, paddingBottom: ins.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Heading title={S.monthTitle} side={S.monthSub} />
        <View style={a.cal}>
          {S.wd.map((d, i) => <Text key={i} style={[a.wd, { color: t.mut }]}>{d}</Text>)}
          {cells}
        </View>

        <Pressable onPress={onInsights} style={({ pressed }) => [a.gen, { backgroundColor: t.b, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={{ fontSize: 15, color: t.ink }}>✦</Text>
          <Text style={{ flex: 1, fontSize: 14.5, color: t.ink }}>{S.insightsBtn}</Text>
          <Icon name="chev" color={t.mut} size={15} />
        </Pressable>

        <View style={a.listHead}>
          <Text style={[a.sec, { color: t.ink, fontFamily: face.title }]}>{S.written}</Text>
          <Seg value={kind} onChange={setKind} options={[['all', S.kAll], ['day', S.kDay], ['three', S.kThree], ['week', S.kWeek]]} />
        </View>
        {list.map(({ e, i }) => (
          <Pressable key={i} onPress={() => onEntry(i)} style={[a.ent, { backgroundColor: t.b }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Tag k={e.k} />
                <Text style={{ fontSize: 12.5, color: e.today ? t.red : t.mut, flexShrink: 1 }} numberOfLines={1}>{e.when}</Text>
              </View>
              <Text style={[a.dt, { color: t.ink, fontFamily: face.title }]}>{e.t}</Text>
              <Text numberOfLines={2} style={{ fontSize: 13.5, lineHeight: 20, color: t.mut }}>{e.s}</Text>
            </View>
            <Thumbs e={e} />
          </Pressable>
        ))}
      </ScrollView>
    </Panel>
  );
}

/* ---------- insights: the numbers live here, one tap away from the month ---------- */
export function Insights({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const ins = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setReady(true), 1400);
    return () => { clearTimeout(id); setReady(false); };
  }, [open]);
  /* minutes per weekday; October 1 2026 is a Thursday */
  const sum = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0];
  MONTH_MIN.forEach((m, i) => { const w = (3 + i) % 7; sum[w] += m; cnt[w]++; });
  const avg = sum.map((x, i) => (cnt[i] ? x / cnt[i] : 0));
  const top = Math.max(...avg), maxWord = S.words[0][1];
  return (
    <Panel open={open} onBack={onClose} top={<><Round icon="back" label={S.back} onPress={onClose} /><Text style={[us.topLbl, { color: t.ink }]}>{S.insights}</Text><View style={{ width: 36 }} /></>}>
      {!ready ? (
        <View style={a.gening}><Text style={{ fontSize: 22, color: t.ink }}>✦</Text><Text style={{ fontSize: 14.5, color: t.mut, fontFamily: face.body }}>{S.insightsGen}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SZ.px, paddingTop: 24, paddingBottom: ins.bottom + 40 }} showsVerticalScrollIndicator={false}>
          <Heading title={S.monthTitle} side={S.monthSub} />
          <Text style={[a.lede, { color: t.ink, fontFamily: face.body }]}>{S.monthLede}</Text>
          <Meta style={{ marginTop: 6 }}>{S.insightsLede}</Meta>
          <View style={a.grid}>
            {S.mstats.map(([n, l]) => (
              <View key={l} style={[a.stat, { backgroundColor: t.b }]}><Text style={[a.num, { color: t.ink }]}>{n}</Text><Meta>{l}</Meta></View>
            ))}
          </View>
          <Text style={[a.sec, { color: t.ink, fontFamily: face.title }]}>{S.whenTalk}</Text>
          <View style={[a.bars, { backgroundColor: t.b }]}>
            {avg.map((v, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
                <View style={{ height: 90, justifyContent: 'flex-end' }}>
                  <View style={{ width: 18, height: Math.max(4, (v / top) * 90), borderRadius: 9, backgroundColor: v === top ? t.red : t.ink }} />
                </View>
                <Text style={{ fontSize: 12, color: t.mut }}>{S.wd[i]}</Text>
              </View>
            ))}
          </View>
          <Text style={[a.sec, { color: t.ink, fontFamily: face.title }]}>{S.wordsTitle}</Text>
          {S.words.map(([w, n]) => (
            <View key={w} style={[a.word, { backgroundColor: t.b }]}>
              <View style={[a.wordBar, { width: `${(n / maxWord) * 100}%`, backgroundColor: t.gray }]} />
              <Text style={{ fontFamily: face.body, fontSize: 15.5, color: t.ink }}>{w}</Text>
              <Text style={{ fontSize: 13.5, color: t.mut }}>{S.times(n)}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </Panel>
  );
}

/* ---------- settings ---------- */
function Toggle({ on: init, onChange, locked }: { on: boolean; onChange?: (v: boolean) => void; locked?: boolean }) {
  const t = useT();
  const [on, setOnState] = useState(init);
  const setOn = (v: boolean) => { if (locked) return; setOnState(v); onChange?.(v); };
  const x = useState(() => new Animated.Value(init ? 1 : 0))[0];
  useEffect(() => { Animated.spring(x, { toValue: on ? 1 : 0, useNativeDriver: true, friction: 7 }).start(); }, [on, x]);
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={() => setOn(!on)}
      style={[a.tg, { backgroundColor: on ? t.pill : t.gray, opacity: locked ? 0.45 : 1 }]}>
      <Animated.View style={[a.knob, { backgroundColor: on ? t.pillText : t.panel, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }] }]} />
    </Pressable>
  );
}
function Chip({ label, on: init }: { label: string; on: boolean }) {
  const t = useT();
  const [on, setOn] = useState(init);
  return (
    <Pressable onPress={() => setOn(!on)} style={[a.chip, { backgroundColor: on ? t.pill : t.panel }]}>
      <Text style={{ fontSize: 13.5, color: on ? t.pillText : t.mut }}>{label}</Text>
    </Pressable>
  );
}
function Seg<V extends string>({ value, options, onChange }: { value: V; options: [V, string][]; onChange: (v: V) => void }) {
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'flex-start', padding: 3, borderRadius: 17, marginTop: 10, backgroundColor: t.gray }}>
      {options.map(([v, l]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={{ height: 28, paddingHorizontal: 14, borderRadius: 14, justifyContent: 'center', backgroundColor: value === v ? t.panel : 'transparent' }}>
          <Text style={{ fontSize: 13.5, color: value === v ? t.ink : t.mut }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function Row({ k, sub, children, extra }: { k: string; sub: string; children?: React.ReactNode; extra?: React.ReactNode }) {
  const t = useT();
  return (
    <View style={[a.set, { backgroundColor: t.b }]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 16, fontWeight: '500', color: t.ink }}>{k}</Text>
        <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.mut }}>{sub}</Text>
        {extra}
      </View>
      {children}
    </View>
  );
}

/* Writing style: what the agent may change. Filler removal is the floor and always on; the rest are opt-in. */
function Sub({ k, sub, children }: { k: string; sub: string; children?: React.ReactNode }) {
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, color: t.ink }}>{k}</Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: t.mut }}>{sub}</Text>
      </View>
      {children}
    </View>
  );
}
/* filler words always go; grammar is fixed unless turned off (both by Lore's backend); learning a style is not built yet */
function WritingStyle({ grammar, setGrammar }: { grammar: boolean; setGrammar: (g: boolean) => void }) {
  const t = useT();
  const S = useS();
  const [train, setTrain] = useState(false);
  const [docs, setDocs] = useState(0);
  async function add() {
    try {
      const r = await DocumentPicker.getDocumentAsync({ multiple: true, type: ['text/plain', 'text/markdown', 'application/pdf'], copyToCacheDirectory: true });
      if (!r.canceled) setDocs((n) => n + r.assets.length);
    } catch { /* picker unavailable */ }
  }
  return (
    <View style={[a.set, { backgroundColor: t.b, flexDirection: 'column', alignItems: 'stretch', gap: 0 }]}>
      <Text style={{ fontSize: 16, fontWeight: '500', color: t.ink }}>{S.sStyle}</Text>
      <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.mut, marginTop: 3, marginBottom: 4 }}>{S.sStyleSub}</Text>
      <Sub k={S.wsClean} sub={S.wsCleanSub}><Toggle on locked /></Sub>
      <Sub k={S.wsGrammar} sub={S.wsGrammarSub}><Toggle key={String(grammar)} on={grammar} onChange={setGrammar} /></Sub>
      <Sub k={S.wsTrain} sub={S.wsTrainSub}><Toggle on={false} onChange={setTrain} /></Sub>
      {train && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 }}>
          <Pressable onPress={add} style={[a.chip, { backgroundColor: t.pill }]}><Text style={{ fontSize: 13.5, color: t.pillText }}>{S.wsImport}</Text></Pressable>
          <Text style={{ fontSize: 13, color: t.mut, flexShrink: 1 }}>{docs ? S.wsImported(docs) : S.wsImportHint}</Text>
        </View>
      )}
    </View>
  );
}
function Reminders() {
  const S = useS();
  const [r, setR] = useState<'night' | 'week' | 'off'>('night');
  return <Row k={S.sRemind} sub={S.sRemindSub} extra={<Seg value={r} onChange={setR} options={[['night', S.rNight], ['week', S.rWeek], ['off', S.rOff]]} />} />;
}

export function Settings({ open, onClose, mode, setMode, lang, setLang, grammar, setGrammar, voice, setVoice, indent, setIndent }: {
  open: boolean; onClose: () => void; mode: Mode; setMode: (m: Mode) => void; lang: Lang; setLang: (l: Lang) => void;
  grammar: boolean; setGrammar: (g: boolean) => void; voice: boolean; setVoice: (v: boolean) => void;
  indent: boolean; setIndent: (v: boolean) => void;
}) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const ins = useSafeAreaInsets();
  return (
    <Panel open={open} onBack={onClose} top={<><Round icon="back" label={S.back} onPress={onClose} /><Text style={[us.topLbl, { color: t.ink }]}>{S.settings}</Text><View style={{ width: 44 }} /></>}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 28, paddingBottom: ins.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text style={[a.lede, { color: t.mut, fontFamily: face.italic, marginTop: 0, marginBottom: 18 }]}>{S.setLede}</Text>
        <Row k={S.sLook} sub={S.sLookSub} extra={<Seg value={mode} onChange={setMode} options={[['light', S.light], ['dark', S.dark], ['auto', S.auto]]} />} />
        <Row k={S.sLang} sub={S.sLangSub} extra={<Seg value={lang} onChange={setLang} options={[['zh', '中文'], ['en', 'English']]} />} />
        <WritingStyle grammar={grammar} setGrammar={setGrammar} />
        <Row k={S.sVoice} sub={S.sVoiceSub}><Toggle key={String(voice)} on={voice} onChange={setVoice} /></Row>
        <Row k={S.sIndent} sub={S.sIndentSub}><Toggle key={String(indent)} on={indent} onChange={setIndent} /></Row>
        <Reminders />
        <Row k={S.sAuto} sub={S.sAutoSub}
          extra={<View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>{S.sources.map((l, i) => <Chip key={l} label={l} on={i < 3} />)}</View>} />
        <Row k={S.sLocal} sub={S.sLocalSub}><Toggle on={false} /></Row>
        <Row k={S.sExport} sub={S.sExportSub}><Text style={{ color: t.mut, fontSize: 16 }}>→</Text></Row>
        <Meta style={{ marginTop: 24 }}>{S.colophon}</Meta>
      </ScrollView>
    </Panel>
  );
}

const a = StyleSheet.create({
  hRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  h3: { fontSize: 26, lineHeight: 36 },
  h3en: { fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  lede: { fontSize: 16.5, lineHeight: 25, marginTop: 8 },
  ent: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, paddingLeft: 16, borderRadius: 18, marginBottom: 6 },
  tag: { height: 20, paddingHorizontal: 8, borderRadius: 10, justifyContent: 'center' },
  th4: { width: 52, height: 52, flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderRadius: SZ.tileR, overflow: 'hidden' },
  th4i: { width: 25, height: 25 },
  th3: { position: 'absolute', top: 6, width: 40, height: 40, borderRadius: 10, borderWidth: 2 },
  gen: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 16, borderRadius: 25, marginTop: 18 },
  listHead: { marginTop: 28, marginBottom: 12 },
  gening: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 120 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  stat: { width: '48.5%', padding: 16, borderRadius: 18, gap: 2 },
  num: { fontFamily: F.serifLight, fontSize: 30, lineHeight: 34 },
  bars: { flexDirection: 'row', padding: 16, borderRadius: 18 },
  wordBar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  n: { fontFamily: F.serifLight, fontSize: 32, lineHeight: 36 },
  todayDot: { position: 'absolute', top: 2, right: 6, width: 5, height: 5, borderRadius: 3 },
  dt: { fontSize: 17, lineHeight: 24 },
  th: { width: 52, height: 52, borderRadius: SZ.tileR },
  cal: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 22 },
  wd: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 13, paddingBottom: 8 },
  cell: { width: `${100 / 7}%`, height: 54, alignItems: 'center' },
  cn: { fontFamily: F.serif, fontSize: 13, height: 16, fontVariant: ['tabular-nums'] },
  dotBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  todayRing: { position: 'absolute', borderWidth: 1 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  sec: { fontSize: 18, lineHeight: 26, marginTop: 28, marginBottom: 10 },
  word: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, marginBottom: 5, overflow: 'hidden' },
  set: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18, marginBottom: 8 },
  sth: { width: 32, height: 46, borderRadius: 5 },
  tg: { width: 42, height: 24, borderRadius: 12, padding: 3, justifyContent: 'center' },
  knob: { width: 18, height: 18, borderRadius: 9 },
  chip: { height: 32, paddingHorizontal: 14, borderRadius: 16, justifyContent: 'center' },
});
