import React, { useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lang, MONTH_MIN, Scene, SCENES } from './data';
import { IMG, PHOTO } from './images';
import { F } from './theme';
import { Meta, Panel, Ring, s as us, useFace, useLang, useS, useT } from './ui';
import { st } from './Entry';

type Mode = 'light' | 'dark' | 'auto';

function Stats({ items }: { items: [string, string][] }) {
  const t = useT();
  return (
    <View style={[st.stats, { borderTopColor: t.pLine }]}>
      {items.map(([n, l]) => (<View key={l} style={{ flex: 1, gap: 2 }}><Text style={[st.num, { color: t.pInk }]}>{n}</Text><Meta style={{ fontSize: 12.5 }}>{l}</Meta></View>))}
    </View>
  );
}

function Tab({ id, label, tab, setTab }: { id: 'week' | 'month'; label: string; tab: 'week' | 'month'; setTab: (t: 'week' | 'month') => void }) {
  const t = useT();
  const on = tab === id;
  return (
    <Pressable onPress={() => setTab(id)} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: on ? t.ink : 'transparent' }}>
      <Text style={{ fontSize: 15, fontWeight: on ? '500' : '400', color: on ? t.ink : t.muted }}>{label}</Text>
    </Pressable>
  );
}

function Heading({ title, side }: { title: string; side: string }) {
  const t = useT();
  const face = useFace();
  const zh = useLang() === 'zh';
  return (
    <View style={a.hRow}>
      <Text style={[zh ? a.h3 : a.h3en, { color: t.pInk, fontFamily: face.title }]}>{title}</Text>
      <Text style={{ fontSize: 14, color: t.pMuted }}>{side}</Text>
    </View>
  );
}

/* ---------- week + month ---------- */
export function Archive({ open, tab, setTab, onClose, onEntry }: { open: boolean; tab: 'week' | 'month'; setTab: (t: 'week' | 'month') => void; onClose: () => void; onEntry: () => void }) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const sep = useLang() === 'zh' ? '，' : ', ';
  const ins = useSafeAreaInsets();
  const cells: React.ReactNode[] = [];
  for (let b = 0; b < 3; b++) cells.push(<View key={'b' + b} style={a.cell} />);
  for (let d = 1; d <= 31; d++) {
    const m = MONTH_MIN[d - 1] ?? 0, fut = d > 17, today = d === 17;
    const size = m ? Math.min(28, 8 + m * 2.4) : 3;
    cells.push(
      <View key={d} style={a.cell}>
        <Text style={[a.cn, { color: today ? t.rec : fut ? t.pFaint : t.pMuted, fontWeight: today ? '600' : '400' }]}>{d}</Text>
        <View style={a.dotBox}>
          {!fut && <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: m ? t.pInk : t.pFaint }} />}
          {today && <View style={[a.todayRing, { borderColor: t.rec, width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 }]} />}
        </View>
      </View>
    );
  }
  return (
    <Panel open={open} onBack={onClose} top={<><Ring icon="back" label={S.back} onPress={onClose} /><View style={{ flexDirection: 'row', gap: 24 }}><Tab id="week" label={S.week} tab={tab} setTab={setTab} /><Tab id="month" label={S.month} tab={tab} setTab={setTab} /></View><View style={{ width: 44 }} /></>}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 28, paddingBottom: ins.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {tab === 'week' ? (<>
          <Heading title={S.weekTitle} side={S.weekNo} />
          <Text style={[a.lede, { color: t.pMuted, fontFamily: face.italic }]}>{S.weekLede}</Text>
          <View style={{ marginTop: 20 }}>
            {S.days.map((w) => {
              const empty = !!(w.empty || w.future);
              return (
                <Pressable key={w.n} disabled={empty} onPress={onEntry} style={[a.day, { borderTopColor: t.pLine }]}>
                  <View style={{ width: 46 }}>
                    <Text style={[a.n, { color: empty ? t.pFaint : t.pInk }]}>{w.n}</Text>
                    {w.today && <View style={[a.todayDot, { backgroundColor: t.rec }]} />}
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ fontSize: 13, color: w.today ? t.rec : t.pMuted }}>{[w.d, w.today ? S.isToday : '', w.m].filter(Boolean).join(sep)}</Text>
                    <Text style={[a.dt, { color: empty ? t.pFaint : t.pInk, fontFamily: face.title }]}>{w.future ? S.tomorrow : w.empty ? S.silent : w.t}</Text>
                    {!empty && <Text numberOfLines={1} style={{ fontSize: 13.5, color: t.pMuted }}>{w.s}</Text>}
                  </View>
                  {w.p ? <Image source={PHOTO[w.p]} style={a.th} contentFit="cover" /> : <View style={[a.th, { borderWidth: 1, borderColor: t.pLine }]} />}
                </Pressable>
              );
            })}
          </View>
        </>) : (<>
          <Heading title={S.monthTitle} side={S.monthSub} />
          <Text style={[a.lede, { color: t.pMuted, fontFamily: face.italic }]}>{S.monthLede}</Text>
          <View style={a.cal}>
            {S.wd.map((d, i) => <Text key={i} style={[a.wd, { color: t.pMuted }]}>{d}</Text>)}
            {cells}
          </View>
          <View style={a.legend}>
            <Meta>{S.less}</Meta>
            {[4, 10, 16, 22].map((z) => <View key={z} style={{ width: z, height: z, borderRadius: z / 2, backgroundColor: t.pInk }} />)}
            <Meta>{S.more}</Meta>
          </View>
          <Stats items={S.mstats} />
          <Text style={[a.sec, { color: t.pInk, fontFamily: face.title }]}>{S.wordsTitle}</Text>
          {S.words.map(([w, n]) => (
            <View key={w} style={[a.word, { borderTopColor: t.pLine }]}>
              <Text style={{ fontFamily: face.body, fontSize: 16, color: t.pInk }}>{w}</Text>
              <Text style={{ fontSize: 14, color: t.pMuted }}>{S.times(n)}</Text>
            </View>
          ))}
        </>)}
      </ScrollView>
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
      style={[a.tg, { borderColor: on ? t.pInk : t.pFaint, backgroundColor: on ? t.pInk : 'transparent', opacity: locked ? 0.4 : 1 }]}>
      <Animated.View style={[a.knob, { backgroundColor: on ? t.paperSolid : t.pInk, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 16] }) }] }]} />
    </Pressable>
  );
}
function Chip({ label, on: init }: { label: string; on: boolean }) {
  const t = useT();
  const [on, setOn] = useState(init);
  return (
    <Pressable onPress={() => setOn(!on)} style={[a.chip, { borderColor: on ? t.pInk : t.pLine }]}>
      <Text style={{ fontSize: 13.5, color: on ? t.pInk : t.pMuted }}>{label}</Text>
    </Pressable>
  );
}
function Seg<V extends string>({ value, options, onChange }: { value: V; options: [V, string][]; onChange: (v: V) => void }) {
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', gap: 18, marginTop: 10 }}>
      {options.map(([v, l]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: value === v ? t.pInk : 'transparent' }}>
          <Text style={{ fontSize: 14.5, color: value === v ? t.pInk : t.pMuted }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function Row({ k, sub, children, extra }: { k: string; sub: string; children?: React.ReactNode; extra?: React.ReactNode }) {
  const t = useT();
  return (
    <View style={[a.set, { borderTopColor: t.pLine }]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 16, fontWeight: '500', color: t.pInk }}>{k}</Text>
        <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.pMuted }}>{sub}</Text>
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
        <Text style={{ fontSize: 15, color: t.pInk }}>{k}</Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: t.pMuted }}>{sub}</Text>
      </View>
      {children}
    </View>
  );
}
function WritingStyle() {
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
    <View style={[a.set, { borderTopColor: t.pLine, flexDirection: 'column', alignItems: 'stretch', gap: 0 }]}>
      <Text style={{ fontSize: 16, fontWeight: '500', color: t.pInk }}>{S.sStyle}</Text>
      <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.pMuted, marginTop: 3, marginBottom: 4 }}>{S.sStyleSub}</Text>
      <Sub k={S.wsClean} sub={S.wsCleanSub}><Toggle on locked /></Sub>
      <Sub k={S.wsGrammar} sub={S.wsGrammarSub}><Toggle on={false} /></Sub>
      <Sub k={S.wsTrain} sub={S.wsTrainSub}><Toggle on={false} onChange={setTrain} /></Sub>
      {train && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 }}>
          <Pressable onPress={add} style={[a.chip, { borderColor: t.pInk }]}><Text style={{ fontSize: 13.5, color: t.pInk }}>{S.wsImport}</Text></Pressable>
          <Text style={{ fontSize: 13, color: t.pMuted, flexShrink: 1 }}>{docs ? S.wsImported(docs) : S.wsImportHint}</Text>
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

export function Settings({ open, onClose, onPicker, scene, mode, setMode, lang, setLang }: {
  open: boolean; onClose: () => void; onPicker: () => void; scene: Scene; mode: Mode; setMode: (m: Mode) => void; lang: Lang; setLang: (l: Lang) => void;
}) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const ins = useSafeAreaInsets();
  return (
    <Panel open={open} onBack={onClose} top={<><Ring icon="back" label={S.back} onPress={onClose} /><Text style={[us.topLbl, { color: t.ink }]}>{S.settings}</Text><View style={{ width: 44 }} /></>}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 28, paddingBottom: ins.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text style={[a.lede, { color: t.pMuted, fontFamily: face.italic, marginTop: 0, marginBottom: 18 }]}>{S.setLede}</Text>
        <Row k={S.sScene} sub={scene[lang]}>
          <Pressable onPress={onPicker} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 14.5, color: t.pInk }}>{S.change}</Text>
            <Image source={IMG[(t.dark ? scene.night : scene.day) + '-th']} style={a.sth} contentFit="cover" />
          </Pressable>
        </Row>
        <Row k={S.sLook} sub={S.sLookSub} extra={<Seg value={mode} onChange={setMode} options={[['light', S.light], ['dark', S.dark], ['auto', S.auto]]} />} />
        <Row k={S.sLang} sub={S.sLangSub} extra={<Seg value={lang} onChange={setLang} options={[['zh', '中文'], ['en', 'English']]} />} />
        <WritingStyle />
        <Reminders />
        <Row k={S.sAuto} sub={S.sAutoSub}
          extra={<View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>{S.sources.map((l, i) => <Chip key={l} label={l} on={i < 3} />)}</View>} />
        <Row k={S.sLocal} sub={S.sLocalSub}><Toggle on /></Row>
        <Row k={S.sExport} sub={S.sExportSub}><Text style={{ color: t.pMuted, fontSize: 16 }}>→</Text></Row>
        <View style={{ borderTopWidth: 1, borderTopColor: t.pLine }} />
        <Meta style={{ marginTop: 24 }}>{S.colophon}</Meta>
      </ScrollView>
    </Panel>
  );
}

/* ---------- scene picker ---------- */
export function Picker({ open, scene, onPick, onClose }: { open: boolean; scene: Scene; onPick: (s: Scene) => void; onClose: () => void }) {
  const t = useT();
  const S = useS();
  const lang = useLang();
  const face = useFace();
  const ins = useSafeAreaInsets();
  const o = useState(() => new Animated.Value(0))[0];
  useEffect(() => { Animated.timing(o, { toValue: open ? 1 : 0, duration: 400, useNativeDriver: true }).start(); }, [open, o]);
  return (
    <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { opacity: o }]}>
      <BlurView intensity={40} tint={t.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.sheet }]} />
      <ScrollView contentContainerStyle={{ paddingTop: ins.top + 76, paddingHorizontal: 22, paddingBottom: ins.bottom + 30 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontFamily: face.title, fontSize: 28, lineHeight: 36, color: t.ink }}>{S.pick}</Text>
        <Text style={{ fontSize: 14.5, lineHeight: 21, color: t.muted, marginTop: 6, marginBottom: 20 }}>{S.pickSub}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {SCENES.map((sc) => (
            <Pressable key={sc.id} onPress={() => { onPick(sc); setTimeout(onClose, 380); }} style={{ width: '31.5%' }}>
              <Image source={IMG[(t.dark ? sc.night : sc.day) + '-th']} contentFit="cover"
                style={{ width: '100%', aspectRatio: 9 / 16, borderRadius: 12, borderWidth: sc.id === scene.id ? 2 : StyleSheet.hairlineWidth, borderColor: sc.id === scene.id ? t.ink : t.line }} />
              <Text style={{ fontSize: 14, color: t.ink, marginTop: 8 }}>{sc[lang]}</Text>
              {(sc.noNight || sc.variant) && <Text style={{ fontSize: 12.5, color: t.muted }}>{sc.noNight ? S.noNight : S.variant}</Text>}
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <Ring icon="close" label={S.close} onPress={onClose} style={{ position: 'absolute', top: ins.top + 10, right: 22 }} />
    </Animated.View>
  );
}

const a = StyleSheet.create({
  hRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  h3: { fontSize: 26, lineHeight: 36 },
  h3en: { fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  lede: { fontSize: 16.5, lineHeight: 25, marginTop: 8 },
  day: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderTopWidth: 1 },
  n: { fontFamily: F.serifLight, fontSize: 32, lineHeight: 36 },
  todayDot: { position: 'absolute', top: 2, right: 6, width: 5, height: 5, borderRadius: 3 },
  dt: { fontSize: 17, lineHeight: 24 },
  th: { width: 52, height: 52, borderRadius: 4 },
  cal: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 22 },
  wd: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 13, paddingBottom: 8 },
  cell: { width: `${100 / 7}%`, height: 54, alignItems: 'center' },
  cn: { fontFamily: F.serif, fontSize: 13, height: 16, fontVariant: ['tabular-nums'] },
  dotBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  todayRing: { position: 'absolute', borderWidth: 1 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  sec: { fontSize: 18, lineHeight: 26, marginTop: 30, marginBottom: 8 },
  word: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 11, borderTopWidth: 1 },
  set: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 17, borderTopWidth: 1 },
  sth: { width: 32, height: 46, borderRadius: 5 },
  tg: { width: 40, height: 24, borderRadius: 12, borderWidth: 1, padding: 4, justifyContent: 'center' },
  knob: { width: 14, height: 14, borderRadius: 7 },
  chip: { height: 32, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, justifyContent: 'center' },
});
