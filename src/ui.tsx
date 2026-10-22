import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, PanResponder, Pressable, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, light, SZ, Theme } from './theme';
import { Lang, STR, Str } from './data';

export const ThemeCtx = createContext<Theme>(light);
export const useT = () => useContext(ThemeCtx);
export const LangCtx = createContext<Lang>('zh');
export const useLang = () => useContext(LangCtx);
export const useS = (): Str => STR[useContext(LangCtx)];
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/* Reading face per language: Chinese serif for Chinese, Newsreader for English. */
export function useFace() {
  const zh = useLang() === 'zh';
  return { body: zh ? F.cn : F.serif, title: zh ? F.cnMed : F.serif, italic: zh ? F.cn : F.serifIt };
}

type IconName = 'camera' | 'cal' | 'gear' | 'mic' | 'book' | 'user' | 'back' | 'down' | 'plus' | 'photo' | 'close' | 'chev' | 'pin' | 'list' | 'settings' | 'up';
export function Icon({ name, color, size = 18 }: { name: IconName; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'camera' && (<><Path d="M4 8.5a2 2 0 0 1 2-2h2.2l1.6-2.2h4.4l1.6 2.2H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" {...p} /><Circle cx={12} cy={12.6} r={3.3} {...p} /></>)}
      {name === 'cal' && (<><Rect x={4} y={5.5} width={16} height={14} rx={3} {...p} /><Path d="M4 10h16M9 3.5v4M15 3.5v4" {...p} /></>)}
      {(name === 'gear' || name === 'settings') && (<><Circle cx={12} cy={12} r={3} {...p} /><Path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2L18 18M6 18l1.8-1.8M16.2 7.8L18 6" {...p} /></>)}
      {name === 'mic' && <Path d="M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" {...p} />}
      {name === 'book' && <Path d="M5 5.5h6a1 1 0 0 1 1 1V19H6a1 1 0 0 1-1-1zM19 5.5h-6a1 1 0 0 0-1 1V19h6a1 1 0 0 0 1-1z" {...p} />}
      {name === 'user' && (<><Circle cx={12} cy={9} r={3.5} {...p} /><Path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" {...p} /></>)}
      {name === 'back' && <Path d="M15 6l-6 6 6 6" {...p} />}
      {name === 'down' && <Path d="M12 5v14M6 13l6 6 6-6" {...p} />}
      {name === 'up' && <Path d="M12 19V5M6 11l6-6 6 6" {...p} />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...p} />}
      {name === 'close' && <Path d="M7 7l10 10M17 7L7 17" {...p} />}
      {name === 'photo' && (<><Rect x={3.5} y={5.5} width={17} height={13} rx={3} {...p} /><Path d="M3.5 15.5l4.5-4 3.5 3 2.5-2 6.5 5" {...p} /><Circle cx={15.5} cy={9.5} r={1.4} {...p} /></>)}
      {name === 'chev' && <Path d="M9 6l6 6-6 6" {...p} />}
      {name === 'pin' && (<><Path d="M12 20.5s-6-5.4-6-10.2a6 6 0 0 1 12 0c0 4.8-6 10.2-6 10.2z" {...p} /><Circle cx={12} cy={10.3} r={2.2} {...p} /></>)}
      {name === 'list' && <Path d="M5 7h14M5 12h14M5 17h8" {...p} />}
    </Svg>
  );
}

/* the faint dot texture behind everything */
export function DotField() {
  const t = useT();
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs><Pattern id="dots" width={14} height={14} patternUnits="userSpaceOnUse"><Circle cx={1} cy={1} r={0.8} fill={t.dot} /></Pattern></Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#dots)" />
    </Svg>
  );
}

/* a soft warm light behind the thing in focus; it breathes slowly */
export function Glow({ top, size }: { top: number; size: number }) {
  const t = useT();
  const o = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 0.55, duration: 1700, useNativeDriver: true }), Animated.timing(o, { toValue: 1, duration: 1700, useNativeDriver: true })]));
    a.start(); return () => a.stop();
  }, [o]);
  const W = Dimensions.get('window').width;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top, left: 0, right: 0, height: size, opacity: o }}>
      <Svg width={W} height={size}>
        <Defs><RadialGradient id="g" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={t.glow} /><Stop offset="1" stopColor={t.glow} stopOpacity={0} /></RadialGradient></Defs>
        <Rect x={0} y={0} width={W} height={size} fill="url(#g)" />
      </Svg>
    </Animated.View>
  );
}

/* a quiet round button: white (or dark panel) disc, no outline */
export function Round({ icon, onPress, label, size = SZ.round, style, dim }: { icon: IconName; onPress?: () => void; label: string; size?: number; style?: ViewStyle; dim?: boolean }) {
  const t = useT();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.panel, alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.35 : pressed ? 0.7 : 1 }, style]}>
      <Icon name={icon} color={t.ink} size={size > 40 ? 18 : 16} />
    </Pressable>
  );
}

export function Meta({ style, ...r }: TextProps) {
  const t = useT();
  return <Text {...r} style={[{ fontSize: 13, lineHeight: 19, color: t.mut }, style]} />;
}

/* A white sheet that rises from the bottom. Swipe right from the left edge to go back. */
export function Panel({ open, top, children, footer, onBack }: { open: boolean; top: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; onBack?: () => void }) {
  const t = useT();
  const ins = useSafeAreaInsets();
  const paperTop = ins.top + 64;
  const paperH = Dimensions.get('window').height - paperTop;
  const y = useState(() => new Animated.Value(open ? 0 : paperH + 40))[0];
  const fade = useState(() => new Animated.Value(open ? 1 : 0))[0];
  useEffect(() => {
    Animated.timing(y, { toValue: open ? 0 : paperH + 40, duration: 560, easing: EASE, useNativeDriver: true }).start();
    Animated.timing(fade, { toValue: open ? 1 : 0, duration: 380, useNativeDriver: true }).start();
  }, [open, paperH, y, fade]);
  const edge = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => g.dx > 8,
    onPanResponderRelease: (_, g) => { if (g.dx > 70 || g.vx > 0.5) onBack?.(); },
  }), [onBack]);
  return (
    <View pointerEvents={open ? 'box-none' : 'none'} style={StyleSheet.absoluteFill}>
      <Animated.View style={[s.pTop, { top: ins.top + 8, opacity: fade }]}>{top}</Animated.View>
      <Animated.View style={[s.paper, { top: paperTop, backgroundColor: t.panel, transform: [{ translateY: y }] }]}>
        {children}
        {footer}
      </Animated.View>
      {open && onBack ? <View style={s.edge} {...edge.panHandlers} /> : null}
    </View>
  );
}

/* ---------- the talk key: a plain circle between the camera and the photo library.
   Tap to start and tap again to finish, or hold it and let go. ---------- */
export type RecState = 'idle' | 'pending' | 'tap' | 'hold';
type Side = { icon: IconName; label: string; onPress?: () => void };
export function TalkKey({ left, right, onStart, onStop, onCancel, state, setState, secs }: {
  left: Side; right: Side; onStart: () => void; onStop: () => void; onCancel: () => void;
  state: RecState; setState: (s: RecState) => void; secs: number;
}) {
  const t = useT();
  const S = useS();
  const pressedAt = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    if (state === 'tap' || state === 'hold') {
      const a = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1.3, duration: 600, easing: EASE, useNativeDriver: true }), Animated.timing(pulse, { toValue: 1, duration: 600, easing: EASE, useNativeDriver: true })]));
      a.start(); return () => a.stop();
    }
    Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [state, pulse]);
  const startY = useRef(0);
  const armed = useRef(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  function arm(on: boolean) {
    if (armed.current === on) return;
    armed.current = on; setCancelArmed(on);
    Haptics.selectionAsync().catch(() => {});
  }
  function pressIn(y: number) {
    if (state === 'tap') return;            // the second tap ends on release
    pressedAt.current = Date.now(); startY.current = y; arm(false);
    setState('pending'); onStart();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    holdTimer.current = setTimeout(() => setState('hold'), 280);
  }
  /* while holding, sliding the finger up past the circle means "don't keep this one" */
  function moveTo(y: number) { if (state === 'hold') arm(y - startY.current < -60); }
  function pressOut() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (state === 'tap') { onStop(); return; }
    if (armed.current) { arm(false); onCancel(); return; }
    if (Date.now() - pressedAt.current < 280) { setState('tap'); return; }   // a quick tap: keep listening
    onStop();
  }
  const mm = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  const recording = state !== 'idle';
  const under = state === 'tap' ? S.recTap(mm) : state === 'hold' ? (cancelArmed ? S.releaseCancel : S.recHold(mm)) : S.tapOrHold;
  return (
    <View style={s.keyWrap}>
      <View style={s.keyRow}>
        {state === 'tap'
          ? <Round icon="close" label={S.cancel} size={SZ.key} onPress={onCancel} />
          : <Round icon={left.icon} label={left.label} size={SZ.key} onPress={recording ? undefined : left.onPress} dim={recording} />}
        <View accessible accessibilityRole="button" accessibilityLabel={under} hitSlop={10}
          onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => pressIn(e.nativeEvent.pageY)} onResponderMove={(e) => moveTo(e.nativeEvent.pageY)}
          onResponderRelease={pressOut} onResponderTerminate={pressOut}
          style={[s.circle, { backgroundColor: t.pill }]}>
          <Animated.View style={[s.core, { backgroundColor: cancelArmed ? t.strike : t.red, transform: [{ scale: pulse }] }]} />
        </View>
        <Round icon={right.icon} label={right.label} size={SZ.key} onPress={recording ? undefined : right.onPress} dim={recording} />
      </View>
      <Text style={[s.under, { color: cancelArmed ? t.red : recording ? t.ink : t.mut }]}>{under}</Text>
    </View>
  );
}

/* a short notice under the top bar, with at most one action (undo, open settings); it goes away by itself */
export type Notice = { text: string; action?: { label: string; run: () => void } } | null;
export function Toast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const t = useT();
  const ins = useSafeAreaInsets();
  const o = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (!notice) return;
    Animated.timing(o, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const id = setTimeout(() => Animated.timing(o, { toValue: 0, duration: 220, useNativeDriver: true }).start(onClose), 4500);
    return () => clearTimeout(id);
  }, [notice, o, onClose]);
  if (!notice) return null;
  return (
    <Animated.View style={[s.toast, { top: ins.top + 62, backgroundColor: t.pill, opacity: o }]}>
      <Text style={{ color: t.pillText, fontSize: 14, flexShrink: 1 }}>{notice.text}</Text>
      {notice.action ? (
        <Pressable hitSlop={10} onPress={() => { notice.action?.run(); onClose(); }}>
          <Text style={{ color: t.pillText, fontSize: 14, fontWeight: '600' }}>{notice.action.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

/* seconds since recording started; resets when it stops */
export function useTimer(running: boolean) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const id = setInterval(() => setSecs((Date.now() - t0) / 1000), 250);
    return () => { clearInterval(id); setSecs(0); };
  }, [running]);
  return secs;
}

export const s = StyleSheet.create({
  pTop: { position: 'absolute', left: SZ.px, right: SZ.px - 4, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paper: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: SZ.panelR, borderTopRightRadius: SZ.panelR, overflow: 'hidden' },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 22 },
  topLbl: { fontSize: 17, fontWeight: '500' },
  keyWrap: { alignItems: 'center', gap: 10 },
  keyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  circle: { width: SZ.talk, height: SZ.talk, borderRadius: SZ.talk / 2, alignItems: 'center', justifyContent: 'center' },
  core: { width: 22, height: 22, borderRadius: 11 },
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '88%', flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 22 },
  under: { fontSize: 12.5, height: 18, fontVariant: ['tabular-nums'] },
});
