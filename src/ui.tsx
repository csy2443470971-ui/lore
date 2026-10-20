import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Animated, Dimensions, Easing, PanResponder, Pressable, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, light, Theme } from './theme';
import { Lang, STR, Str } from './data';

export const ThemeCtx = createContext<Theme>(light);
export const useT = () => useContext(ThemeCtx);
export const LangCtx = createContext<Lang>('zh');
export const useLang = () => useContext(LangCtx);
export const useS = (): Str => STR[useContext(LangCtx)];
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/* Reading face per language: Chinese serif for Chinese, Newsreader for English. Never mixed in one string. */
export function useFace() {
  const zh = useLang() === 'zh';
  return { body: zh ? F.cn : F.serif, title: zh ? F.cnMed : F.serif, italic: zh ? F.cn : F.serifIt };
}

type IconName = 'settings' | 'up' | 'down' | 'back' | 'list' | 'close' | 'mic' | 'photo';
export function Icon({ name, color, size = 18 }: { name: IconName; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'settings' && (<><Path d="M4 8h9M17 8h3M4 16h3M11 16h9" {...p} /><Circle cx={15} cy={8} r={2} {...p} /><Circle cx={9} cy={16} r={2} {...p} /></>)}
      {name === 'up' && <Path d="M12 19V5M6 11l6-6 6 6" {...p} />}
      {name === 'down' && <Path d="M12 5v14M6 13l6 6 6-6" {...p} />}
      {name === 'back' && <Path d="M15 6l-6 6 6 6" {...p} />}
      {name === 'list' && <Path d="M5 7h14M5 12h14M5 17h8" {...p} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...p} />}
      {name === 'photo' && (<><Path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5z" {...p} /><Path d="M4 15l4.5-4 3.5 3 2.5-2 5.5 4.5" {...p} /><Circle cx={15.5} cy={9.5} r={1.3} {...p} /></>)}
      {name === 'mic' && <Path d="M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" {...p} />}
    </Svg>
  );
}

export function Ring({ icon, onPress, label, style }: { icon: IconName; onPress: () => void; label: string; style?: ViewStyle }) {
  const t = useT();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={({ pressed }) => [s.ring, { borderColor: t.line, backgroundColor: pressed ? t.glass : 'transparent' }, style]}>
      <Icon name={icon} color={t.ink} />
    </Pressable>
  );
}

/* Secondary information: readable size, sentence case, quieter colour — never tiny capitals. */
export function Meta({ style, ...r }: TextProps) {
  const t = useT();
  return <Text {...r} style={[{ fontSize: 13, lineHeight: 19, color: t.pMuted }, style]} />;
}

/* A sheet of paper over the scene. Open: full page with the sky above it. Peek: a strip docked at the bottom of home.
   Swipe right from the left edge, or down on a peeking-capable sheet, to go back. */
export function Panel({ open, top, children, footer, onBack, peek, onExpand }: {
  open: boolean; top: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode;
  onBack?: () => void; peek?: number; onExpand?: () => void;
}) {
  const t = useT();
  const ins = useSafeAreaInsets();
  const paperTop = ins.top + 68;
  const paperH = Dimensions.get('window').height - paperTop;
  const target = open ? 0 : peek ? paperH - peek - ins.bottom : paperH + 40;
  const y = useState(() => new Animated.Value(target))[0];
  const fade = useState(() => new Animated.Value(open ? 1 : 0))[0];
  useEffect(() => {
    Animated.timing(y, { toValue: target, duration: 600, easing: EASE, useNativeDriver: true }).start();
    Animated.timing(fade, { toValue: open ? 1 : 0, duration: 400, useNativeDriver: true }).start();
  }, [target, open, y, fade]);
  const edge = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => g.dx > 8,
    onPanResponderRelease: (_, g) => { if (g.dx > 70 || g.vx > 0.5) onBack?.(); },
  }), [onBack]);
  const drag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 10,
    onPanResponderRelease: (_, g) => { if (g.dy < -40 || g.vy < -0.4) onExpand?.(); else if (Math.abs(g.dy) < 6) onExpand?.(); },
  }), [onExpand]);
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[s.pTop, { top: ins.top + 10, opacity: fade }]}>{top}</Animated.View>
      <Animated.View pointerEvents={open || peek ? 'auto' : 'none'} style={[s.paper, { top: paperTop, backgroundColor: t.paper, transform: [{ translateY: y }] }]}>
        <View style={[s.handle, { backgroundColor: t.pFaint }]} />
        {children}
        {open ? footer : null}
        {!open && peek ? <View style={StyleSheet.absoluteFill} {...drag.panHandlers} /> : null}
      </Animated.View>
      {open && onBack ? <View style={s.edge} {...edge.panHandlers} /> : null}
    </View>
  );
}

export const s = StyleSheet.create({
  ring: { width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth * 2, alignItems: 'center', justifyContent: 'center' },
  pTop: { position: 'absolute', left: 22, right: 22, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paper: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  topLbl: { fontSize: 15, fontWeight: '500' },
  handle: { position: 'absolute', top: 8, alignSelf: 'center', width: 36, height: 4, borderRadius: 2, zIndex: 5 },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 22 },
});
