import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Re, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Path } from 'react-native-svg';
import LoreVision from '../modules/lore-vision';
import { Pic } from './session';
import { shot } from './Share';
import { StickerBox } from './StickerBox';
import { stickerSrc } from './stickers';
import { useS } from './ui';

const src = (p: Pic) => (p.uri ? { uri: p.uri } : p.asset);
const INK = '#F2EFE8', DIM = '#0E0E0D', PANEL = 'rgba(38,37,34,0.86)';
const COLORS = ['#FFFFFF', '#F04A3A', '#F2C14E', '#1B1A18'];
const SPRING = { damping: 18, stiffness: 240, mass: 0.6 };

/* a pen line, or a sticker, on the photo; all in fractions of the photo, so they can be set at any size */
type Stroke = { kind: 'pen'; pts: number[]; color: string; w: number };
type Piece = { kind: 'sticker'; id: string; s: string; x: number; y: number; w: number; r: number };
type Mark = Stroke | Piece;
const pathOf = (pts: number[], fw: number, fh: number) => {
  let d = '';
  for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${(pts[i] * fw).toFixed(1)} ${(pts[i + 1] * fh).toFixed(1)}`;
  return d;
};

/* a photo opened from the page: the first file of a photo kept on the phone (a sample photo is copied out of the app) */
async function fileOf(p: Pic): Promise<string | null> {
  if (p.uri && !p.uri.startsWith('http')) return p.uri;
  if (p.asset !== undefined) { const a = Asset.fromModule(p.asset); await a.downloadAsync(); return a.localUri ?? null; }
  return null;
}

/* a sticker on the photo: one finger moves it, two resize and turn it */
function Placed({ pc, fw, fh, onChange }: { pc: Piece; fw: number; fh: number; onChange: (pc: Piece) => void }) {
  const dx = useSharedValue(0), dy = useSharedValue(0), sc = useSharedValue(1), rot = useSharedValue(0), s0 = useSharedValue(1), r0 = useSharedValue(0);
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; });
  const commit = useCallback((ddx: number, ddy: number, s: number, r: number) => {
    const p = { ...pc, x: pc.x + ddx / fw, y: pc.y + ddy / fh, w: Math.max(0.08, Math.min(1.2, pc.w * s)), r: pc.r + r };
    cb.current(p);
  }, [pc, fw, fh]);
  /* eslint-disable react-hooks/refs -- the gesture's callbacks run during a gesture, never while rendering */
  const g = useMemo(() => {
    const done = () => {
      'worklet';
      const a = dx.get(), b = dy.get(), s = sc.get(), r = rot.get();
      dx.set(0); dy.set(0); sc.set(1); rot.set(0);
      scheduleOnRN(commit, a, b, s, r);
    };
    const pan = Gesture.Pan().averageTouches(true).onUpdate((e) => { dx.set(e.translationX); dy.set(e.translationY); }).onEnd(done);
    const pinch = Gesture.Pinch().onStart(() => s0.set(sc.get())).onUpdate((e) => sc.set(s0.get() * e.scale));
    const turn = Gesture.Rotation().onStart(() => r0.set(rot.get())).onUpdate((e) => rot.set(r0.get() + e.rotation * 180 / Math.PI));
    return Gesture.Simultaneous(pan, pinch, turn);
  }, [commit, dx, dy, sc, rot, s0, r0]);
  /* eslint-enable react-hooks/refs */
  const size = pc.w * fw;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: dx.get() }, { translateY: dy.get() }, { rotate: `${pc.r + rot.get()}deg` }, { scale: sc.get() }] }));
  const source = stickerSrc(pc.s);
  if (!source) return null;
  return (
    <GestureDetector gesture={g}>
      <Re.View style={[{ position: 'absolute', left: pc.x * fw - size / 2, top: pc.y * fh - size / 2, width: size, height: size }, style]}>
        <Image source={source} contentFit="contain" style={StyleSheet.absoluteFill} pointerEvents="none" />
      </Re.View>
    </GestureDetector>
  );
}

/* A photo from the page, full screen. Pinch or double-tap to look closer. Below it: a pen to mark it up, stickers to put
   on it, a circle to cut an object out of it as a sticker (Apple's on-phone subject lifting finds the object's own
   outline inside a rough circle, so nothing leaves the phone), and delete. Marks and stickers are set into the photo
   when done; the photo as it was is kept, to go back to. */
export function Viewer({ pics, start, mine, onClose, onDelete, onSave, onRestore, onLifted, onNotice }: {
  pics: Pic[]; start: number; mine: string[];
  onClose: () => void;
  onDelete: (i: number) => void;                          // i: which of the shown photos
  onSave: (i: number, uri: string, r: number) => void;    // the photo with its marks set in
  onRestore: (i: number) => void;
  onLifted: (file: string) => void;                       // an object cut out as a sticker
  onNotice: (text: string) => void;
}) {
  const S = useS();
  const ins = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [at, setAt] = useState(Math.min(start, pics.length - 1));
  const [mode, setMode] = useState<'view' | 'pen' | 'deco' | 'circle' | 'delete'>('view')   // deco: placing stickers (no drawing);
  const [box, setBox] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [now, setNow] = useState<number[] | null>(null);  // the line being drawn
  const [color, setColor] = useState(COLORS[1]);
  const [thick, setThick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string | null>(null);  // the sticker just cut out
  const pic = pics[at];
  const [ratio, setRatio] = useState(pic?.r ?? 0.75);     // height over width
  const frame = useRef<View>(null);

  /* the photo fits the screen between the top bar and the tools */
  const roomH = height - ins.top - ins.bottom - 56 - 130;
  const fw = Math.min(width, roomH / ratio), fh = fw * ratio;
  const editing = marks.length > 0 || mode === 'pen' || mode === 'deco';

  /* looking closer: pinch, drag, double-tap (only while not drawing) */
  const zoom = useSharedValue(1), z0 = useSharedValue(1), px = useSharedValue(0), py = useSharedValue(0), p0 = useSharedValue({ x: 0, y: 0 });
  useEffect(() => { zoom.set(1); px.set(0); py.set(0); }, [at, mode, zoom, px, py]);
  const look = useMemo(() => {
    const pinch = Gesture.Pinch().onStart(() => z0.set(zoom.get())).onUpdate((e) => zoom.set(Math.max(1, Math.min(5, z0.get() * e.scale))))
      .onEnd(() => { if (zoom.get() <= 1.02) { zoom.set(withSpring(1, SPRING)); px.set(withSpring(0, SPRING)); py.set(withSpring(0, SPRING)); } });
    const pan = Gesture.Pan().averageTouches(true).onStart(() => p0.set({ x: px.get(), y: py.get() }))
      .onUpdate((e) => { if (zoom.get() > 1) { px.set(p0.get().x + e.translationX); py.set(p0.get().y + e.translationY); } });
    const dbl = Gesture.Tap().numberOfTaps(2).onEnd(() => {
      const z = zoom.get() > 1 ? 1 : 2.5;
      zoom.set(withSpring(z, SPRING)); if (z === 1) { px.set(withSpring(0, SPRING)); py.set(withSpring(0, SPRING)); }
    });
    return Gesture.Simultaneous(pinch, pan, dbl);
  }, [zoom, z0, px, py, p0]);
  const zoomed = useAnimatedStyle(() => ({ transform: [{ translateX: px.get() }, { translateY: py.get() }, { scale: zoom.get() }] }));

  /* drawing: a pen line, or the circle around an object */
  const add = useCallback((x: number, y: number, first: boolean) => {
    setNow((n) => (first || !n ? [x / fw, y / fh] : [...n, x / fw, y / fh]));
  }, [fw, fh]);
  const endRef = useRef<() => void>(() => {});
  const finish = useCallback(() => endRef.current(), []);
  /* eslint-disable react-hooks/refs -- the gesture's callbacks run during a gesture, never while rendering */
  const draw = useMemo(() => Gesture.Pan().minDistance(0)
    .onStart((e) => { scheduleOnRN(add, e.x, e.y, true); })
    .onUpdate((e) => { scheduleOnRN(add, e.x, e.y, false); })
    .onEnd(() => { scheduleOnRN(finish); }), [add, finish]);
  /* eslint-enable react-hooks/refs */


  /* the circled region, a little wider than drawn, goes to Vision, which finds the object inside it */
  async function cutOut(pts: number[]) {
    if (!LoreVision?.liftIn) { onNotice(S.liftNeedsApp); return; }
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
    const pad = 0.04;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(1, x1 + pad); y1 = Math.min(1, y1 + pad);
    setBusy(true);
    try {
      const file = await fileOf(pic);
      const out = file ? await LoreVision.liftIn(file, x0, y0, x1 - x0, y1 - y0) : null;
      if (!out) onNotice(S.liftNone);
      else { setMade(out); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
    } catch { onNotice(S.liftNone); }
    setBusy(false);
  }

  /* a finished line: kept as a pen mark, or (circling) sent to be cut out */
  useEffect(() => {
    endRef.current = () => {
      const pts = now;
      setNow(null);
      if (!pts || pts.length < 4) return;
      if (mode === 'pen') setMarks((m) => [...m, { kind: 'pen', pts, color, w: thick ? 0.012 : 0.006 }]);
      else if (mode === 'circle') cutOut(pts);
    };
  });

  /* done: the photo is captured with its marks at its own resolution (at most 2400 px across) */
  async function save() {
    if (!marks.length) { setMode('view'); return; }
    if (!shot) { onNotice(S.shareNeedsApp); return; }
    setBusy(true);
    try {
      const px2 = Math.min(2400, Math.round(fw * PixelRatio.get() * 1.6)) / PixelRatio.get();
      const uri = await shot.captureRef(frame, { format: 'jpg', quality: 0.92, result: 'tmpfile', width: px2, height: px2 * ratio });
      onSave(at, uri, ratio);
      setMarks([]); setMode('view');
    } catch { /* keep editing */ }
    setBusy(false);
  }

  const pieces = marks.filter((m): m is Piece => m.kind === 'sticker');
  const strokes = marks.filter((m): m is Stroke => m.kind === 'pen');
  const tool = (label: string, run: () => void, on = false, key = label) => (
    <Pressable key={key} onPress={run} style={({ pressed }) => [v.tool, on && v.toolOn, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[v.toolT, on && { color: DIM }]}>{label}</Text>
    </Pressable>
  );
  if (!pic) return null;
  const canvas = (
    <View ref={frame} collapsable={false} style={{ width: fw, height: fh, backgroundColor: DIM }}>
      <Image source={src(pic)} contentFit="contain" style={StyleSheet.absoluteFill}
        onLoad={(e) => { const w = e.source.width, h = e.source.height; if (w && h) setRatio(h / w); }} />
      <Svg width={fw} height={fh} style={StyleSheet.absoluteFill} pointerEvents="none">
        {strokes.map((st, i) => <Path key={i} d={pathOf(st.pts, fw, fh)} stroke={st.color} strokeWidth={st.w * fw} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
        {now ? <Path d={pathOf(now, fw, fh) + (mode === 'circle' ? 'Z' : '')} stroke={mode === 'circle' ? '#FFFFFF' : color} strokeWidth={mode === 'circle' ? 2.5 : (thick ? 0.012 : 0.006) * fw}
          strokeDasharray={mode === 'circle' ? '6 6' : undefined} strokeLinecap="round" strokeLinejoin="round" fill={mode === 'circle' ? 'rgba(255,255,255,0.12)' : 'none'} /> : null}
      </Svg>
      {pieces.map((pc) => <Placed key={pc.id} pc={pc} fw={fw} fh={fh} onChange={(n) => setMarks((m) => m.map((x) => (x.kind === 'sticker' && x.id === n.id ? n : x)))} />)}
    </View>
  );

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM, zIndex: 40 }]}>
      <View style={[v.bar, { marginTop: ins.top + 8 }]}>
        <Pressable onPress={editing ? () => { setMarks([]); setMode('view'); } : onClose} hitSlop={10} style={v.barBtn}>
          <Text style={v.barT}>{editing ? S.cancel : '✕'}</Text>
        </Pressable>
        <Text style={v.count}>{pics.length > 1 ? `${at + 1} / ${pics.length}` : ''}</Text>
        {editing ? (
          <Pressable onPress={save} disabled={busy} hitSlop={10} style={v.barBtn}><Text style={[v.barT, { fontWeight: '600' }]}>{S.editDone}</Text></Pressable>
        ) : pic.orig ? (
          <Pressable onPress={() => onRestore(at)} hitSlop={10} style={v.barBtn}><Text style={v.barT}>{S.restore}</Text></Pressable>
        ) : <View style={v.barBtn} />}
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {mode === 'view' && !marks.length ? (
          <GestureDetector gesture={look}><Re.View style={zoomed}>{canvas}</Re.View></GestureDetector>
        ) : mode === 'pen' || mode === 'circle' ? (
          <GestureDetector gesture={draw}><View>{canvas}</View></GestureDetector>
        ) : canvas}
        {mode === 'circle' && !made ? <Text style={v.hint}>{busy ? S.lifting : S.circleHint}</Text> : null}
        {made ? (
          <View style={[StyleSheet.absoluteFill, v.made]}>
            <Popped uri={made} size={Math.min(fw, 260)} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {tool(S.circleAgain, () => setMade(null))}
              {tool(S.toPage, () => { onLifted(made); setMade(null); setMode('view'); onClose(); }, true)}
            </View>
          </View>
        ) : null}
      </View>

      {pics.length > 1 && mode === 'view' && !marks.length ? (
        <View style={v.thumbs}>
          {pics.map((p, i) => (
            <Pressable key={i} onPress={() => setAt(i)} style={[v.thumb, i === at && { borderColor: INK }]}>
              <Image source={src(p)} contentFit="cover" style={StyleSheet.absoluteFill} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={[v.tools, { paddingBottom: ins.bottom + 14 }]}>
        {mode === 'delete' ? (
          <>
            <Text style={[v.toolT, { marginRight: 8 }]}>{S.deleteAsk}</Text>
            {tool(S.cancel, () => setMode('view'))}
            <Pressable onPress={() => { setMode('view'); onDelete(at); }} style={[v.tool, { backgroundColor: '#F04A3A' }]}><Text style={[v.toolT, { color: '#fff' }]}>{S.del}</Text></Pressable>
          </>
        ) : mode === 'pen' ? (
          <>
            {COLORS.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} style={[v.swatch, { backgroundColor: c, borderColor: color === c ? INK : 'rgba(255,255,255,0.25)', transform: [{ scale: color === c ? 1.15 : 1 }] }]} />
            ))}
            {tool(thick ? S.thick : S.thin, () => setThick(!thick))}
            {tool(S.undoMark, () => setMarks((m) => m.slice(0, -1)))}
            {tool(S.stickers, () => setBox(true))}
          </>
        ) : mode === 'deco' ? (
          <>
            {tool(S.pen, () => setMode('pen'))}
            {tool(S.stickers, () => setBox(true))}
            {tool(S.undoMark, () => setMarks((m) => m.slice(0, -1)))}
          </>
        ) : mode === 'circle' ? (
          <>{tool(S.cancel, () => setMode('view'))}</>
        ) : (
          <>
            {tool(S.pen, () => setMode('pen'))}
            {tool(S.stickers, () => setBox(true))}
            {tool(S.circleCut, () => { setMade(null); setMode('circle'); })}
            {tool(S.del, () => setMode('delete'))}
          </>
        )}
      </View>

      {box ? (
        <StickerBox mine={mine} onClose={() => setBox(false)} onMake={() => { setBox(false); setMade(null); setMode('circle'); }}
          onPick={(sk) => {
            setBox(false);
            setMode('deco');
            setMarks((m) => [...m, { kind: 'sticker', id: 'k' + Date.now().toString(36), s: sk, x: 0.5, y: 0.5, w: 0.3, r: Math.round(Math.random() * 16 - 8) }]);
          }} />
      ) : null}
    </View>
  );
}

/* the cut-out sticker pops out of the photo */
function Popped({ uri, size }: { uri: string; size: number }) {
  const s = useSharedValue(0.4);
  useEffect(() => { s.set(withSpring(1, { damping: 9, stiffness: 260, mass: 0.6 })); }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }, { rotate: '-4deg' }] }));
  return (
    <Re.View style={[{ width: size, height: size }, Platform.OS === 'web' ? null : v.popShadow, style]}>
      <Image source={{ uri }} contentFit="contain" style={StyleSheet.absoluteFill} />
    </Re.View>
  );
}

const v = StyleSheet.create({
  bar: { height: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barBtn: { minWidth: 56, height: 36, justifyContent: 'center' },
  barT: { color: INK, fontSize: 15.5 },
  count: { color: 'rgba(242,239,232,0.6)', fontSize: 13 },
  hint: { position: 'absolute', bottom: 18, color: INK, fontSize: 13, backgroundColor: PANEL, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, overflow: 'hidden' },
  made: { alignItems: 'center', justifyContent: 'center', gap: 26, backgroundColor: 'rgba(14,14,13,0.82)' },
  popShadow: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
  thumbs: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  thumb: { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 12, paddingHorizontal: 16, flexWrap: 'wrap' },
  tool: { height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: PANEL, justifyContent: 'center' },
  toolOn: { backgroundColor: INK },
  toolT: { color: INK, fontSize: 14 },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
});
