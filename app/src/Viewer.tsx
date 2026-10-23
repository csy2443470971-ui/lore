import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Re, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from 'react-native-svg';
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
type Box = { x: number; y: number; w: number; h: number };   // a crop, in fractions of the photo
const WHOLE: Box = { x: 0, y: 0, w: 1, h: 1 };
type Mode = 'view' | 'pen' | 'deco' | 'cut' | 'crop' | 'delete';

const pathOf = (pts: number[], fw: number, fh: number) => {
  let d = '';
  for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${(pts[i] * fw).toFixed(1)} ${(pts[i + 1] * fh).toFixed(1)}`;
  return d;
};

/* a photo's own file (a sample photo is copied out of the app first), for drawing it into a cut-out */
async function fileOf(p: Pic): Promise<string | number | null> {
  if (Platform.OS === 'web') return p.uri ?? (p.asset !== undefined ? Asset.fromModule(p.asset).uri : null);
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
    cb.current({ ...pc, x: pc.x + ddx / fw, y: pc.y + ddy / fh, w: Math.max(0.08, Math.min(1.2, pc.w * s)), r: pc.r + r });
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

/* The crop: a frame with four corners to drag, and the frame itself to move; outside it is shaded. With a shape chosen
   (tr: height over width in pixels) a corner drags the frame bigger or smaller and the opposite corner stays put. */
function CropBox({ r, fw, fh, tr, set }: { r: Box; fw: number; fh: number; tr: number | null; set: (r: Box) => void }) {
  const latest = useRef(r), start = useRef(r), put = useRef(set), held = useRef(tr);
  useEffect(() => { latest.current = r; put.current = set; held.current = tr; });
  /* eslint-disable react-hooks/refs -- the gestures read the crop only while dragging, never while rendering */
  const gs = useMemo(() => {
    const MIN = 0.12, cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const make = (k: 'move' | 'tl' | 'tr' | 'bl' | 'br') => Gesture.Pan().runOnJS(true).minDistance(0)
      .onStart(() => { start.current = latest.current; })
      .onUpdate((e) => {
        const s = start.current, dx = e.translationX / fw, dy = e.translationY / fh, t = held.current;
        let x0 = s.x, y0 = s.y, x1 = s.x + s.w, y1 = s.y + s.h;
        if (k === 'move') { x0 = cl(s.x + dx, 0, 1 - s.w); y0 = cl(s.y + dy, 0, 1 - s.h); x1 = x0 + s.w; y1 = y0 + s.h; }
        else if (t !== null) {
          const left = k === 'tl' || k === 'bl', top = k === 'tl' || k === 'tr';
          const ax = left ? s.x + s.w : s.x, ay = top ? s.y + s.h : s.y;                        // the corner that stays
          const cx = (left ? s.x : s.x + s.w) + dx, cy = (top ? s.y : s.y + s.h) + dy;          // where the finger has the other one
          const want = Math.max(Math.abs(cx - ax) * fw, (Math.abs(cy - ay) * fh) / t);          // how wide that asks for, in pixels
          const room = Math.min((left ? ax : 1 - ax) * fw, ((top ? ay : 1 - ay) * fh) / t);     // how wide the photo allows
          const w = Math.min(room, Math.max(MIN * Math.max(fw, fh / t), want)) / fw, h = (w * fw * t) / fh;
          x0 = left ? ax - w : ax; x1 = x0 + w; y0 = top ? ay - h : ay; y1 = y0 + h;
          put.current({ x: x0, y: y0, w, h });
          return;
        }
        if (k === 'tl' || k === 'bl') x0 = cl(s.x + dx, 0, x1 - MIN);
        if (k === 'tr' || k === 'br') x1 = cl(x1 + dx, x0 + MIN, 1);
        if (k === 'tl' || k === 'tr') y0 = cl(s.y + dy, 0, y1 - MIN);
        if (k === 'bl' || k === 'br') y1 = cl(y1 + dy, y0 + MIN, 1);
        put.current({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      });
    return { move: make('move'), tl: make('tl'), tr: make('tr'), bl: make('bl'), br: make('br') };
  }, [fw, fh]);
  /* eslint-enable react-hooks/refs */
  const L = r.x * fw, T = r.y * fh, Wd = r.w * fw, H = r.h * fh;
  const corner = (k: 'tl' | 'tr' | 'bl' | 'br') => {
    const left = k === 'tl' || k === 'bl', top = k === 'tl' || k === 'tr';
    return (
      <GestureDetector key={k} gesture={gs[k]}>
        <View style={[v.corner, { left: (left ? L : L + Wd) - 22, top: (top ? T : T + H) - 22 }]}>
          <View style={[v.cornerL, { [left ? 'left' : 'right']: 19, [top ? 'top' : 'bottom']: 19, borderLeftWidth: left ? 3 : 0, borderRightWidth: left ? 0 : 3, borderTopWidth: top ? 3 : 0, borderBottomWidth: top ? 0 : 3 }]} />
        </View>
      </GestureDetector>
    );
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View pointerEvents="none" style={[v.shade, { left: 0, top: 0, right: 0, height: T }]} />
      <View pointerEvents="none" style={[v.shade, { left: 0, top: T + H, right: 0, bottom: 0 }]} />
      <View pointerEvents="none" style={[v.shade, { left: 0, top: T, width: L, height: H }]} />
      <View pointerEvents="none" style={[v.shade, { left: L + Wd, top: T, right: 0, height: H }]} />
      <GestureDetector gesture={gs.move}><View style={[v.cropFrame, { left: L, top: T, width: Wd, height: H }]} /></GestureDetector>
      {corner('tl')}{corner('tr')}{corner('bl')}{corner('br')}
    </View>
  );
}

/* a cut-out: the photo inside the line the person drew around something, with a white sticker edge along that line */
function CutOut({ file, pts, fw, fh, size }: { file: string | number; pts: number[]; fw: number; fh: number; size: number }) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) { const x = pts[i] * fw, y = pts[i + 1] * fh; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const edge = Math.max(6, Math.max(x1 - x0, y1 - y0) * 0.045), pad = edge / 2 + 2;
  const vw = x1 - x0 + 2 * pad, vh = y1 - y0 + 2 * pad, k = size / Math.max(vw, vh);
  const d = pathOf(pts, fw, fh) + 'Z';
  return (
    <Svg width={vw * k} height={vh * k} viewBox={`${x0 - pad} ${y0 - pad} ${vw} ${vh}`}>
      <Defs><ClipPath id="cut"><Path d={d} /></ClipPath></Defs>
      <Path d={d} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={edge} strokeLinejoin="round" strokeLinecap="round" />
      <SvgImage href={typeof file === 'number' ? file : { uri: file }} x={0} y={0} width={fw} height={fh} preserveAspectRatio="none" clipPath="url(#cut)" />
    </Svg>
  );
}

/* A photo from the page, full screen. Pinch or double-tap to look closer. The tools stay along the bottom: a pen (its
   colours sit just above the tools), stickers, cut out (the line drawn around something is the sticker's edge), crop,
   and delete. Marks, stickers and the crop are set into the photo when done; the photo as it was is kept. With only
   'cut', it is a photo just picked to make a sticker from. */
export function Viewer({ pics, start, mine, only, onClose, onDelete, onSave, onRestore, onLifted, onNotice }: {
  pics: Pic[]; start: number; mine: string[]; only?: 'cut';
  onClose: () => void;
  onDelete: (i: number) => void;                          // i: which of the shown photos
  onSave: (i: number, uri: string, r: number) => void;    // the photo with its marks (and crop) set in
  onRestore: (i: number) => void;
  onLifted: (file: string) => void;                       // a cut-out sticker
  onNotice: (text: string) => void;
}) {
  const S = useS();
  const ins = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [at, setAt] = useState(Math.min(start, pics.length - 1));
  const [mode, setMode] = useState<Mode>(only === 'cut' ? 'cut' : 'view');
  const [box, setBox] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [now, setNow] = useState<number[] | null>(null);  // the line being drawn
  const [color, setColor] = useState(COLORS[1]);
  const [thick, setThick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cut, setCut] = useState<number[] | null>(null);  // the line drawn around something, shown as its cut-out
  const [crop, setCrop] = useState<Box>(WHOLE);
  const [shape, setShape] = useState<number | null>(null);   // the shape the crop is held to: short side over long (1, 3/4, 9/16), or free
  const [upright, setUpright] = useState(true);               // upright or across
  const [file, setFile] = useState<string | number | null>(null);
  const pic = pics[at];
  const [ratio, setRatio] = useState(pic?.r ?? 0.75);     // height over width
  const frame = useRef<View>(null), cropped = useRef<View>(null), cutRef = useRef<View>(null);
  useEffect(() => { let on = true; if (pic) fileOf(pic).then((f) => { if (on) setFile(f); }); return () => { on = false; }; }, [pic]);

  /* the photo fits the screen between the top bar and the tools */
  const roomH = height - ins.top - ins.bottom - 56 - 150;
  const fw = Math.min(width, roomH / ratio), fh = fw * ratio;
  const isCropped = crop.w < 0.995 || crop.h < 0.995;
  const edited = marks.length > 0 || isCropped;
  /* a crop held to a shape: height over width, as pixels */
  const tr = shape === null ? null : shape === 1 ? 1 : upright ? 1 / shape : shape;
  /* the biggest frame of that shape that fits the photo, around the middle of the frame there is now */
  const fitBox = (t: number): Box => {
    const wide = t * fw <= fh;
    const w = (wide ? fw : fh / t) / fw, h = (wide ? fw * t : fh) / fh;
    const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2;
    return { x: Math.max(0, Math.min(1 - w, cx - w / 2)), y: Math.max(0, Math.min(1 - h, cy - h / 2)), w, h };
  };
  const pickShape = (s: number | null) => {
    setShape(s);
    if (s !== null) setCrop(fitBox(s === 1 ? 1 : upright ? 1 / s : s));
  };
  const turnShape = () => {
    if (shape === null || shape === 1) return;
    setUpright(!upright);
    setCrop(fitBox(upright ? shape : 1 / shape));
  };

  /* looking closer: pinch, drag, double-tap (only while not editing) */
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

  /* drawing: a pen line, or the line around something to cut out */
  const pending = useRef<{ mode: Mode; color: string; thick: boolean }>({ mode, color, thick });
  useEffect(() => { pending.current = { mode, color, thick }; });
  const draw = useMemo(() => Gesture.Pan().runOnJS(true).minDistance(0)
    .onStart((e) => setNow([e.x / fw, e.y / fh]))
    .onUpdate((e) => setNow((n) => [...(n ?? []), e.x / fw, e.y / fh]))
    .onEnd(() => {
      setNow((pts) => {
        const p = pending.current;
        if (pts && pts.length >= 6) {
          if (p.mode === 'pen') setMarks((m) => [...m, { kind: 'pen', pts, color: p.color, w: p.thick ? 0.012 : 0.006 }]);
          else if (p.mode === 'cut') { setCut(pts); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
        }
        return null;
      });
    }), [fw, fh]);

  /* the cut-out goes to the sticker box (and the page) as a PNG kept in Documents/stickers */
  const keepCut = useCallback(async () => {
    if (!shot) { onNotice(S.liftNeedsApp); return; }
    setBusy(true);
    try {
      const tmp = await shot.captureRef(cutRef, { format: 'png', quality: 1, result: 'tmpfile', width: 600 / PixelRatio.get() });
      const dir = new Directory(Paths.document, 'stickers');
      dir.create({ intermediates: true, idempotent: true });
      const out = new File(dir, Date.now().toString(36) + '.png');
      await new File(tmp).copy(out);
      onLifted(out.uri);
      setCut(null);
      onClose();
    } catch { onNotice(S.liftNone); }
    setBusy(false);
  }, [S, onLifted, onClose, onNotice]);

  /* done: the photo is captured with its marks (and only the cropped part) at its own resolution, at most 2400 px across */
  async function save() {
    if (!edited) { setMode('view'); return; }
    if (!shot) { onNotice(S.shareNeedsApp); return; }
    setBusy(true);
    try {
      const cw = isCropped ? crop.w * fw : fw, ch = isCropped ? crop.h * fh : fh;
      const lw = Math.min(2400, Math.round(cw * PixelRatio.get() * 1.6)) / PixelRatio.get();
      const uri = await shot.captureRef(isCropped ? cropped : frame, { format: 'jpg', quality: 0.92, result: 'tmpfile', width: lw, height: lw * ch / cw });
      onSave(at, uri, ch / cw);
      setMarks([]); setCrop(WHOLE); setShape(null); setMode('view');
    } catch { /* keep editing */ }
    setBusy(false);
  }
  const cancel = () => { setMarks([]); setCrop(WHOLE); setShape(null); setCut(null); setMode('view'); };

  const pieces = marks.filter((m): m is Piece => m.kind === 'sticker');
  const strokes = marks.filter((m): m is Stroke => m.kind === 'pen');
  const tool = (label: string, run: () => void, on = false, key = label) => (
    <Pressable key={key} onPress={run} style={({ pressed }) => [v.tool, on && v.toolOn, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[v.toolT, on && { color: DIM }]}>{label}</Text>
    </Pressable>
  );
  if (!pic) return null;
  const canvas = (live: boolean, ref?: React.RefObject<View | null>) => (
    <View ref={ref} collapsable={false} style={{ width: fw, height: fh, backgroundColor: DIM }}>
      <Image source={src(pic)} contentFit="contain" style={StyleSheet.absoluteFill}
        onLoad={live ? (e) => { const w = e.source.width, h = e.source.height; if (w && h) setRatio(h / w); } : undefined} />
      <Svg width={fw} height={fh} style={StyleSheet.absoluteFill} pointerEvents="none">
        {strokes.map((st, i) => <Path key={i} d={pathOf(st.pts, fw, fh)} stroke={st.color} strokeWidth={st.w * fw} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
        {live && now ? <Path d={pathOf(now, fw, fh) + (mode === 'cut' ? 'Z' : '')} stroke={mode === 'cut' ? '#FFFFFF' : color} strokeWidth={mode === 'cut' ? 2.5 : (thick ? 0.012 : 0.006) * fw}
          strokeDasharray={mode === 'cut' ? '6 6' : undefined} strokeLinecap="round" strokeLinejoin="round" fill={mode === 'cut' ? 'rgba(255,255,255,0.12)' : 'none'} /> : null}
      </Svg>
      {pieces.map((pc) => {
        if (live) return <Placed key={pc.id} pc={pc} fw={fw} fh={fh} onChange={(n) => setMarks((m) => m.map((x) => (x.kind === 'sticker' && x.id === n.id ? n : x)))} />;
        const source = stickerSrc(pc.s);
        return source ? <Image key={pc.id} source={source} contentFit="contain"
          style={{ position: 'absolute', left: pc.x * fw - pc.w * fw / 2, top: pc.y * fh - pc.w * fw / 2, width: pc.w * fw, height: pc.w * fw, transform: [{ rotate: `${pc.r}deg` }] }} /> : null;
      })}
    </View>
  );
  const drawing = mode === 'pen' || mode === 'cut';

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM, zIndex: 40 }]}>
      <View style={[v.bar, { marginTop: ins.top + 8 }]}>
        <Pressable onPress={edited ? cancel : onClose} hitSlop={10} style={v.barBtn}>
          <Text style={v.barT}>{edited ? S.cancel : '✕'}</Text>
        </Pressable>
        <Text style={v.count}>{pics.length > 1 ? `${at + 1} / ${pics.length}` : ''}</Text>
        {edited ? (
          <Pressable onPress={save} disabled={busy} hitSlop={10} style={v.barBtn}><Text style={[v.barT, { fontWeight: '600', textAlign: 'right' }]}>{S.editDone}</Text></Pressable>
        ) : pic.orig && !only ? (
          <Pressable onPress={() => onRestore(at)} hitSlop={10} style={v.barBtn}><Text style={[v.barT, { textAlign: 'right' }]}>{S.restore}</Text></Pressable>
        ) : <View style={v.barBtn} />}
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {mode === 'view' && !edited ? (
          <GestureDetector gesture={look}><Re.View style={zoomed}>{canvas(true, frame)}</Re.View></GestureDetector>
        ) : drawing && !cut ? (
          <GestureDetector gesture={draw}><View>{canvas(true, frame)}</View></GestureDetector>
        ) : (
          <View>
            {canvas(true, frame)}
            {mode === 'crop' ? <CropBox r={crop} fw={fw} fh={fh} tr={tr} set={setCrop} /> : null}
          </View>
        )}
        {mode === 'cut' && !cut ? <Text style={v.hint}>{S.cutHint}</Text> : null}
        {cut && file !== null ? (
          <View style={[StyleSheet.absoluteFill, v.made]}>
            <Popped><View ref={cutRef} collapsable={false}><CutOut file={file} pts={cut} fw={fw} fh={fh} size={Math.min(fw, 260)} /></View></Popped>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {tool(S.circleAgain, () => setCut(null))}
              {/* eslint-disable-next-line react-hooks/refs -- keeping the cut-out reads its view only when tapped */}
              {tool(S.toPage, keepCut, true)}
            </View>
          </View>
        ) : null}
      </View>
      {/* the crop, drawn off screen at its own size, is what gets saved */}
      {isCropped ? (
        <View ref={cropped} collapsable={false} pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0, width: crop.w * fw, height: crop.h * fh, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: -crop.x * fw, top: -crop.y * fh }}>{canvas(false)}</View>
        </View>
      ) : null}

      {pics.length > 1 && mode === 'view' && !edited ? (
        <View style={v.thumbs}>
          {pics.map((p, i) => (
            <Pressable key={i} onPress={() => setAt(i)} style={[v.thumb, i === at && { borderColor: INK }]}>
              <Image source={src(p)} contentFit="cover" style={StyleSheet.absoluteFill} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* what the chosen tool needs sits just above the tools, which never change place */}
      <View style={v.palette}>
        {mode === 'pen' ? (
          <>
            {COLORS.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} style={[v.swatch, { backgroundColor: c, borderColor: color === c ? INK : 'rgba(255,255,255,0.25)', transform: [{ scale: color === c ? 1.15 : 1 }] }]} />
            ))}
            {tool(thick ? S.thick : S.thin, () => setThick(!thick))}
            {tool(S.undoMark, () => setMarks((m) => m.slice(0, -1)))}
          </>
        ) : mode === 'deco' ? tool(S.undoMark, () => setMarks((m) => m.slice(0, -1)))
          : mode === 'crop' ? (
            <>
              {tool(S.cropFree, () => setShape(null), shape === null)}
              {tool('1:1', () => pickShape(1), shape === 1)}
              {tool('3:4', () => pickShape(3 / 4), shape === 3 / 4)}
              {tool('16:9', () => pickShape(9 / 16), shape === 9 / 16)}
              {shape !== null && shape !== 1 ? tool(upright ? S.cropUp : S.cropAcross, turnShape)
                : isCropped ? tool(S.cropReset, () => { setCrop(WHOLE); setShape(null); }) : null}
            </>
          )
            : mode === 'delete' ? (
              <>
                <Text style={[v.toolT, { marginRight: 4 }]}>{S.deleteAsk}</Text>
                {tool(S.cancel, () => setMode('view'))}
                <Pressable onPress={() => { setMode('view'); onDelete(at); }} style={[v.tool, { backgroundColor: '#F04A3A' }]}><Text style={[v.toolT, { color: '#fff' }]}>{S.del}</Text></Pressable>
              </>
            ) : null}
      </View>
      {only ? <View style={{ height: ins.bottom + 20 }} /> : (
        <View style={[v.tools, { paddingBottom: ins.bottom + 14 }]}>
          {tool(S.pen, () => setMode(mode === 'pen' ? 'view' : 'pen'), mode === 'pen')}
          {tool(S.stickers, () => setBox(true), mode === 'deco')}
          {tool(S.cutOut, () => { setCut(null); setMode(mode === 'cut' ? 'view' : 'cut'); }, mode === 'cut')}
          {tool(S.crop, () => { if (mode !== 'crop') { setShape(null); setUpright(ratio >= 1); } setMode(mode === 'crop' ? 'view' : 'crop'); }, mode === 'crop')}
          {tool(S.del, () => setMode(mode === 'delete' ? 'view' : 'delete'), mode === 'delete')}
        </View>
      )}

      {box ? (
        <StickerBox mine={mine} onClose={() => setBox(false)} onMake={() => { setBox(false); setCut(null); setMode('cut'); }}
          onPick={(sk) => {
            setBox(false);
            setMode('deco');
            setMarks((m) => [...m, { kind: 'sticker', id: 'k' + Date.now().toString(36), s: sk, x: 0.5, y: 0.5, w: 0.3, r: Math.round(Math.random() * 16 - 8) }]);
          }} />
      ) : null}
    </View>
  );
}

/* a cut-out pops off the photo */
function Popped({ children }: { children: React.ReactNode }) {
  const s = useSharedValue(0.4);
  useEffect(() => { s.set(withSpring(1, { damping: 9, stiffness: 260, mass: 0.6 })); }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }, { rotate: '-4deg' }] }));
  return <Re.View style={[Platform.OS === 'web' ? null : v.popShadow, style]}>{children}</Re.View>;
}

const v = StyleSheet.create({
  bar: { height: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barBtn: { minWidth: 64, height: 36, justifyContent: 'center' },
  barT: { color: INK, fontSize: 15.5 },
  count: { color: 'rgba(242,239,232,0.6)', fontSize: 13 },
  hint: { position: 'absolute', bottom: 18, color: INK, fontSize: 13, backgroundColor: PANEL, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, overflow: 'hidden' },
  made: { alignItems: 'center', justifyContent: 'center', gap: 26, backgroundColor: 'rgba(14,14,13,0.82)' },
  popShadow: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
  thumbs: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  thumb: { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  palette: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 6, paddingHorizontal: 12 },
  tool: { height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: PANEL, justifyContent: 'center' },
  toolOn: { backgroundColor: INK },
  toolT: { color: INK, fontSize: 14 },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  cropFrame: { position: 'absolute', borderWidth: 1.5, borderColor: '#FFFFFF' },
  corner: { position: 'absolute', width: 44, height: 44 },
  cornerL: { position: 'absolute', width: 18, height: 18, borderColor: '#FFFFFF' },
});
