import React, { useRef, useState } from 'react';
import { NativeModules, PixelRatio, Platform, Pressable, Share as Sheet, StyleSheet, Text, TurboModuleRegistry, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pic } from './session';
import { F } from './theme';
import { Round, useLang, useS, useT } from './ui';

/* capturing a view needs react-native-view-shot's native side, which only the newly installed app has; an app installed
   before it still runs this same update, without the button doing more than saying so */
type Shot = { captureRef: (v: unknown, o: object) => Promise<string> };
export const shot: Shot | null = Platform.OS !== 'web' && (TurboModuleRegistry.get('RNViewShot') || NativeModules.RNViewShot)
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when the native side is there
  ? require('react-native-view-shot') : null;

const src = (p: Pic) => (p.uri ? { uri: p.uri } : p.asset);
const MARK = require('../assets/brand/mark.png');
const MARK_LIGHT = require('../assets/brand/mark-light.png');

/* two tones for the image: paper (the page itself) and ink */
const TONES = {
  paper: { bg: '#F3F0E8', ink: '#1C1A16', mut: '#8E897E', rule: 'rgba(28,26,22,0.14)', red: '#E0533F', mark: MARK },
  ink: { bg: '#171613', ink: '#EEEAE1', mut: '#8C877C', rule: 'rgba(238,234,225,0.16)', red: '#E86A55', mark: MARK_LIGHT },
};
type Tone = keyof typeof TONES;
type Fmt = 'post' | 'story';
const CW = 360;                                                 // the image is laid out 360 points wide and saved 1080 pixels wide
const CH: Record<Fmt, number> = { post: 450, story: 640 };

/* the date the way a printed diary sets it: the day large, the month, weekday and year small beside it */
function dateParts(key: string, months: string[], weekdays: string[], zh: boolean) {
  const m = key.match(/^(?:r-)?(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const w = weekdays[new Date(y, mo - 1, d).getDay()];
  return { big: String(d), line: zh ? `${months[mo - 1]} · ${w}` : `${months[mo - 1]} · ${w}`, year: String(y) };
}

/* up to four photos, set like prints: one wide; two side by side; one large with two small; or four in a grid */
function Prints({ pics, w, h }: { pics: Pic[]; w: number; h: number }) {
  const g = 4, r = 3;
  const im = (p: Pic, x: number, y: number, ww: number, hh: number, k: number) => (
    <Image key={k} source={src(p)} contentFit="cover" style={{ position: 'absolute', left: x, top: y, width: ww, height: hh, borderRadius: r }} />
  );
  const n = pics.length;
  return (
    <View style={{ width: w, height: h }}>
      {n === 1 ? im(pics[0], 0, 0, w, h, 0)
        : n === 2 ? [im(pics[0], 0, 0, (w - g) / 2, h, 0), im(pics[1], (w + g) / 2, 0, (w - g) / 2, h, 1)]
          : n === 3 ? [im(pics[0], 0, 0, (w - g) * 0.62, h, 0), im(pics[1], (w - g) * 0.62 + g, 0, (w - g) * 0.38, (h - g) / 2, 1), im(pics[2], (w - g) * 0.62 + g, (h + g) / 2, (w - g) * 0.38, (h - g) / 2, 2)]
            : pics.slice(0, 4).map((p, i) => im(p, (i % 2) * ((w + g) / 2), Math.floor(i / 2) * ((h + g) / 2), (w - g) / 2, (h - g) / 2, i))}
    </View>
  );
}

/* The share image: the date, the chosen photos, the chosen words, and Lore's mark and line at the foot. */
function Card({ fmt, tone, day, title, meta, paras, pics }: { fmt: Fmt; tone: Tone; day: string; title: string; meta: string; paras: string[]; pics: Pic[] }) {
  const S = useS();
  const zh = useLang() === 'zh';
  const c = TONES[tone];
  const H = CH[fmt];
  const pad = 30, top = fmt === 'story' ? 86 : 30, bottom = fmt === 'story' ? 92 : 24;   // a story keeps clear of the app's own bars
  const dp = dateParts(day, S.months, S.weekdays, zh);
  const span = day.startsWith('r-');
  const words = paras.map((p) => (zh ? '　　' + p : p)).join('\n');
  const body = zh ? { fontFamily: F.cn, fontSize: 14, lineHeight: 25 } : { fontFamily: F.serif, fontSize: 15.5, lineHeight: 23 };
  /* the photos take what the words leave: the words' lines are estimated, then the photos get the rest, within bounds */
  const inner = CW - 2 * pad, perLine = inner / (zh ? body.fontSize : body.fontSize * 0.47);
  const need = paras.reduce((n, p) => n + Math.ceil(((zh ? 2 : 0) + p.length) / perLine), 0) * body.lineHeight;
  const room = H - top - bottom - 64 - 46 - 20 - (words ? 18 : 0);   // less the date, the foot, and the gaps
  const most = inner * (fmt === 'story' ? 1.05 : 0.62), least = inner * (fmt === 'story' ? 0.5 : 0.36);
  const photoH = !pics.length ? 0 : Math.round(Math.max(least, Math.min(most, room - need)));
  const [lines, setLines] = useState(0);
  return (
    <View style={{ width: CW, height: H, backgroundColor: c.bg, paddingHorizontal: pad, paddingTop: top, paddingBottom: bottom }}>
      <View style={k.head}>
        {dp && !span ? (
          <>
            <Text style={[k.big, { color: c.ink }]}>{dp.big}</Text>
            <View style={k.dateSide}>
              <View style={[k.dot, { backgroundColor: c.red }]} />
              <Text style={[k.small, { color: c.ink }]}>{dp.line}</Text>
              <Text style={[k.small, { color: c.mut }]}>{dp.year}</Text>
            </View>
          </>
        ) : (
          <View style={{ gap: 4 }}>
            <View style={[k.dot, { backgroundColor: c.red }]} />
            <Text style={[k.spanT, { color: c.ink, fontFamily: zh ? F.cn : F.serif }]}>{title}</Text>
            {meta ? <Text style={[k.small, { color: c.mut }]}>{meta}</Text> : null}
          </View>
        )}
      </View>
      {pics.length ? <View style={{ marginTop: 20 }}><Prints pics={pics} w={CW - 2 * pad} h={photoH} /></View> : null}
      <View style={{ flex: 1, marginTop: words ? (pics.length ? 18 : 22) : 0, overflow: 'hidden' }}
        onLayout={(e) => setLines(Math.max(1, Math.floor(e.nativeEvent.layout.height / body.lineHeight)))}>
        {words && lines ? <Text numberOfLines={lines} style={[body, { color: c.ink, textAlign: 'justify' }]}>{words}</Text> : null}
      </View>
      <View style={[k.foot, { borderTopColor: c.rule }]}>
        <Image source={c.mark} contentFit="contain" style={{ width: 52, height: 14.5 }} />
        <Text numberOfLines={1} style={[k.slogan, { color: c.mut, fontFamily: zh ? F.cn : F.serifIt }]}>{S.slogan}</Text>
      </View>
    </View>
  );
}

/* the sheet: the image as it will be saved, its shape and tone, and Share */
export function ShareSheet({ day, title, meta, paras, pics, onClose, onNotice }: {
  day: string; title: string; meta: string; paras: string[]; pics: Pic[];
  onClose: () => void; onNotice: (text: string) => void;
}) {
  const t = useT();
  const S = useS();
  const ins = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [fmt, setFmt] = useState<Fmt>('post');
  const [tone, setTone] = useState<Tone>('paper');
  const [busy, setBusy] = useState(false);
  const card = useRef<View>(null);
  const roomH = height - ins.top - ins.bottom - 56 - 150;
  const scale = Math.min((width - 48) / CW, roomH / CH[fmt]);

  async function go() {
    if (!shot) { onNotice(S.shareNeedsApp); return; }
    setBusy(true);
    try {
      const px = 1080 / PixelRatio.get();
      const uri = await shot.captureRef(card, { format: 'png', quality: 1, result: 'tmpfile', width: px, height: px * CH[fmt] / CW });
      await Sheet.share({ url: uri });
    } catch { /* cancelled */ }
    setBusy(false);
  }

  const chip = (on: boolean, label: string, press: () => void) => (
    <Pressable key={label} onPress={press} style={[s.chip, { backgroundColor: on ? t.pill : t.panel }]}>
      <Text style={{ fontSize: 13.5, color: on ? t.pillText : t.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.b, zIndex: 30 }]}>
      <View style={[s.bar, { marginTop: ins.top + 8 }]}>
        <Round icon="close" label={S.cancel} onPress={onClose} />
        <Text style={[s.title, { color: t.ink }]}>{S.shareTitle}</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: CW * scale, height: CH[fmt] * scale }}>
          <View style={[s.lift, { width: CW, height: CH[fmt], transform: [{ translateX: (CW * scale - CW) / 2 }, { translateY: (CH[fmt] * scale - CH[fmt]) / 2 }, { scale }] }]}>
            <View ref={card} collapsable={false}>
              <Card fmt={fmt} tone={tone} day={day} title={title} meta={meta} paras={paras} pics={pics} />
            </View>
          </View>
        </View>
      </View>
      <View style={[s.controls, { paddingBottom: ins.bottom + 16 }]}>
        <View style={s.row}>
          {chip(fmt === 'post', S.fmtPost, () => setFmt('post'))}
          {chip(fmt === 'story', S.fmtStory, () => setFmt('story'))}
          <View style={{ width: 14 }} />
          {chip(tone === 'paper', S.paperTone, () => setTone('paper'))}
          {chip(tone === 'ink', S.inkTone, () => setTone('ink'))}
        </View>
        <Pressable onPress={go} disabled={busy} style={({ pressed }) => [s.go, { backgroundColor: t.pill, opacity: busy ? 0.5 : pressed ? 0.8 : 1 }]}>
          <Text style={{ fontSize: 15.5, color: t.pillText }}>{S.share}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const k = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  big: { fontFamily: F.serifLight, fontSize: 64, lineHeight: 62, letterSpacing: -2, marginBottom: -6 },
  dateSide: { paddingBottom: 3, gap: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, marginBottom: 4 },
  small: { fontSize: 10.5, letterSpacing: 1.1 },
  spanT: { fontSize: 22, lineHeight: 28 },
  foot: { marginTop: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  slogan: { fontSize: 9.5, letterSpacing: 0.4, flexShrink: 1 },
});
const s = StyleSheet.create({
  bar: { height: 46, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '500' },
  lift: { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
  controls: { paddingHorizontal: 20, gap: 16, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center' },
  go: { height: 50, alignSelf: 'stretch', borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
});
