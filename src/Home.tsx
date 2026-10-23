import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Animated, Dimensions, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Re, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Fluid, Page, PageApi, pieces, shapeOf, soloFor, Stream } from './Doc';
import { ShareSheet } from './Share';
import { StickerBox } from './StickerBox';
import { Viewer } from './Viewer';
import { Lift, src, Tray } from './Photos';
import { agentOn, Heard, marked, transcribe } from './agent';
import { Pic, Placed, Pos, Said, Sticker, Unit, unitsOf } from './session';
import { keepRecording } from './store';
import { SZ } from './theme';
import { Glow, Notice, RecState, Round, TalkKey, useFace, useLang, useS, useT, useTimer } from './ui';

/* The one writing page. Empty, with photos, or carrying on later, it is the same page:
   today's photos (if any), what has been laid out, the tidied words not laid out yet, and the talk row. */
export function Home({ day, hidden, night, past, title, onTitle, ownTitle, onRename, pageTitle, pageMeta, onToday, photos, groups, setGroups, onRemove, said, laid, placed, moved, making, live, grammar, voice, indent, onCamera, onPick, onOpen, onRecord, onSaved, onText, onPlace, onMove, onLayout, onUndo, onMerge, onNotice, stickers, slap, mine, onAddSticker, onSticker, onMakeSticker, onPhoto }: {
  hidden: boolean; night: boolean;
  day: string;                                      // which day is shown; switching days keeps this screen and swaps only the page
  past: boolean; title: string; pageTitle: string; pageMeta: string; onToday: () => void;   // a past day opens on this same page
  onTitle?: () => void;                              // the title opens the menu of days
  ownTitle: string; onRename?: (text: string) => void;   // the title the person gave the page (empty: its date), and renaming it
  photos: Pic[]; groups: number[][]; setGroups: (g: number[][]) => void; onRemove: (idx: number[]) => void;
  said: Said[]; laid: number; placed?: Placed[]; moved?: Record<string, Pos>; making: boolean;
  live: string;                                      // Apple's live words while recording, in the installed app
  grammar: boolean;                                  // "Fix grammar" in settings, sent with each recording
  voice: boolean;                                    // voice bars on the page, also a setting
  indent: boolean;                                   // first-line indent, a setting
  onCamera: () => void; onPick: () => void;
  onOpen: (p: 'archive' | 'settings') => void;
  onRecord: { start: () => Promise<boolean>; stop: () => Promise<string | null>; cancel: () => Promise<string | null> };
  onUndo?: () => void;                               // back to the page as it was before the last lay out, join or edit
  stickers?: Sticker[]; slap?: string; mine: string[];   // the page's stickers, the one just put on, and those made from photos
  onAddSticker: (s: string, at: { x: number; y: number; w: number; r: number }) => void;
  onSticker: (id: string, at: Partial<Sticker> | null) => void;
  onMakeSticker: () => Promise<string | null>;        // a photo picked to trace a sticker from, or null
  /* from the full-screen photo: delete it, set marks into it, go back to the original, or keep a cut-out sticker */
  onPhoto: { del: (i: number) => void; save: (i: number, uri: string, r: number) => void; restore: (i: number) => void; lifted: (file: string) => string };
  onMerge: (item: number) => void;                    // join a paragraph to the one above it
  onSaved: (s: Said) => void; onLayout: () => void; onNotice: (n: Notice) => void;
  onText: (item: number, part: number, text: string) => void;   // an edited recording, or an edited photo caption (part)
  onPlace: (idx: number[], at: Pos) => void; onMove: (key: string, at: Pos) => void;
}) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const zh = useLang() === 'zh';
  const ins = useSafeAreaInsets();
  const W = Dimensions.get('window').width;
  const top = ins.top + 8;
  const [rec, setRec] = useState<RecState>('idle');
  const recording = rec !== 'idle';
  const [mode, setMode] = useState<'talk' | 'photos'>('talk');
  const [shown, setShown] = useState(0);
  const [cleaned, setCleaned] = useState(false);
  const [k, setK] = useState(-1);                                    // the photo or group being talked about
  const [lines, setLines] = useState<Record<number, string>>({});
  const [select, setSelect] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  const [dragging, setDragging] = useState(false);
  const [real, setReal] = useState<'idle' | 'listen' | 'tidy' | 'show'>('idle');   // the phone's pipeline: recording, sent, shown
  const [heard, setHeard] = useState<Heard | null>(null);
  const secs = useTimer(rec !== 'idle');
  const fade = useState(() => new Animated.Value(1))[0];
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const area = useRef<View>(null);                                  // the page's text area, where tray photos can be dropped
  const [editing, setEditing] = useState<{ item: number; part: number } | null>(null);
  const [choosing, setChoosing] = useState<Set<string> | null>(null);   // choosing paragraphs and photos for a share image
  const [sharing, setSharing] = useState(false);
  const [stickerBox, setStickerBox] = useState(false);                  // the sticker box is open
  const [reading, setReading] = useState<string | null>(null);
  /* writing straight onto the page, as in Notes: a tap on empty space puts the cursor at the end of the page; what is
     typed becomes a paragraph of its own when the finger goes elsewhere or Done is pressed */
  const [typing, setTyping] = useState<string | null>(null);
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKb(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const [viewing, setViewing] = useState<{ idx: number[]; at: number; pics?: Pic[]; only?: 'cut' } | null>(null);   // a photo open full screen          // a paragraph opened to select (and copy) its words
  const [bin, setBin] = useState<'on' | 'over' | null>(null);           // a sticker is being carried: the bin shows in the talk key's place
  const [draft, setDraft] = useState('');
  /* A photo lifted from the thumbnails at the bottom: it is drawn by the screen at the finger (shared values, moved on
     the screen's own thread, so it follows smoothly whatever the page is doing), and tells the page where it is; the page
     makes room, and on a drop says where the photo lands, and the photo glides there. */
  const pageApi = useRef<PageApi | null>(null);
  const gx = useSharedValue(0), gy = useSharedValue(0), gw = useSharedValue(64), gh = useSharedValue(64), gop = useSharedValue(0);
  const [carried, setCarried] = useState<Pic[] | null>(null);          // the photos being carried
  const held = useRef<{ u: Unit; moved: boolean; box: { x: number; y: number; w: number; h: number } | null; y0: number; sx: number; sy: number; fx: number; fy: number; sz: { w: number; h: number } } | null>(null);
  const scrollY = useRef(0);
  const sized = useRef({ content: 0, view: 0 });
  const auto = useRef<ReturnType<typeof setInterval> | null>(null);
  const pageW = W - 2 * SZ.px;
  const ghostStyle = useAnimatedStyle(() => ({ left: gx.get() - gw.get() / 2, top: gy.get() - gh.get() / 2, width: gw.get(), height: gh.get(), opacity: gop.get() * 0.96 }));

  useEffect(() => { Animated.timing(fade, { toValue: hidden ? 0 : 1, duration: 360, useNativeDriver: true }).start(); }, [hidden, fade]);
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);
  /* another day: clear what belonged to the last one and fade the new page in, instead of rebuilding the whole screen */
  const turn = useState(() => new Animated.Value(1))[0];
  const shownDay = useRef(day);
  useEffect(() => {
    if (shownDay.current === day) return;
    shownDay.current = day;
    setK(-1); setLines({}); setSelect(false); setSel([]); setEditing(null); setCarried(null); gop.set(0); held.current = null; setChoosing(null); setSharing(false); setStickerBox(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
    turn.setValue(0.25);
    Animated.timing(turn, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [day, turn, gop]);

  const units = unitsOf(photos.length, groups);
  const talked = new Set(said.flatMap((x) => (x.kind === 'photos' ? x.parts.map((p) => p.unit.idx[0]) : [])));
  const laidIdx = new Set(said.slice(0, laid).flatMap((x) => (x.kind === 'photos' ? x.parts.map((p) => p.unit.idx[0]) : [])));
  const pending = units.map((u, n) => (talked.has(u.idx[0]) ? -1 : n)).filter((n) => n >= 0);
  const used = new Set([...laidIdx, ...(placed ?? []).map((p) => p.idx[0])]);   // the photos that are on the page
  const showTray = units.some((u) => !used.has(u.idx[0]));                       // some photo is not on the page yet
  const raws = [S.raw, S.raw2, S.raw3];
  const raw = raws[said.filter((x) => x.kind === 'talk').length % raws.length];
  const line = (n: number) => S.demoLines[n % S.demoLines.length];

  function stopDemo() { if (tick.current) clearInterval(tick.current); }
  /* on the phone: keep the recording, then send it; the raw words come back with the removed ones struck through, then settle */
  function send(uri: string, took = 0) {
    setReal('tidy');
    keepRecording(uri).then((kept) => transcribe(kept, grammar).then((r) => {
      if (!r.text.trim()) { setReal('idle'); onNotice({ text: S.heardNothing }); return; }
      setHeard(r); setReal('show');
      setTimeout(() => { onSaved({ kind: 'talk', text: r.text, audio: kept, g: grammar, at: Date.now() - took * 1000, secs: Math.round(took) }); setReal('idle'); setHeard(null); }, 1500);
    }).catch((e: unknown) => {
      setReal('idle');
      onNotice({ text: `${S.notReached} (${String(e instanceof Error ? e.message : e).slice(0, 40)})`, action: { label: S.retry, run: () => send(kept, took) } });
    }));
  }
  function start() {
    if (agentOn) {
      setReal('listen');
      onRecord.start().then((ok) => { if (!ok) { setRec('idle'); setReal('idle'); } });
      return;
    }
    /* no microphone permission: stop quietly, the notice says why */
    onRecord.start().then((ok) => { if (!ok) { stopDemo(); setRec('idle'); setShown(0); setK(-1); setLines({}); } });
    if (showTray && pending.length) {
      /* demo: the person goes "one is…, two is…"; which photo each sentence belongs to is only settled at Lay out */
      setMode('photos'); setLines({}); setK(pending[0]);
      let j = 0;
      tick.current = setInterval(() => {
        const n = pending[j];
        setLines((m) => ({ ...m, [n]: line(n) }));
        j++; if (j < pending.length) setK(pending[j]); else if (tick.current) clearInterval(tick.current);
      }, 3200);
    } else {
      setMode('talk'); setShown(1); setCleaned(false);
      tick.current = setInterval(() => setShown((n) => Math.min(raw.length, n + 1)), 450);
    }
  }
  /* the sentence as said: "Number one is the café…" (mid-sentence, so English drops the capital) */
  const spoken = (u: Unit, text: string) => S.rangeWord(u.idx[0] + 1, u.idx[u.idx.length - 1] + 1, S.numWord) + S.is + (zh ? text : text.charAt(0).toLowerCase() + text.slice(1));
  /* what this recording would become, whether it's kept now or brought back with Undo */
  function result(): Said | null {
    if (mode === 'photos') {
      const all = k >= 0 ? { ...lines, [k]: line(k) } : lines;
      const parts = pending.filter((n) => all[n]).map((n) => ({ unit: units[n], text: all[n], spoken: spoken(units[n], all[n]) }));
      return parts.length ? { kind: 'photos', parts } : null;
    }
    const text = raw.slice(0, Math.max(shown, 4)).filter((w) => w[1] !== 1).map((w) => w[0]).join('');
    return { kind: 'talk', text };
  }
  function finish(keep: boolean) {
    if (agentOn) {
      setRec('idle');
      if (!keep) {
        onRecord.cancel().then((uri) => { setReal('idle'); if (uri) onNotice({ text: S.discarded, action: { label: S.undo, run: () => send(uri) } }); });
        return;
      }
      const took = secs;
      onRecord.stop().then((uri) => (uri ? send(uri, took) : setReal('idle')));
      return;
    }
    stopDemo();
    setRec('idle');
    const r = result();
    if (!keep) {
      onRecord.cancel(); setShown(0); setK(-1); setLines({});
      if (r) onNotice({ text: S.discarded, action: { label: S.undo, run: () => onSaved(r) } });
      return;
    }
    onRecord.stop();
    if (mode === 'photos') { if (r) onSaved(r); setK(-1); setLines({}); return; }
    setCleaned(true);            // the filler words drop out in place, then the words settle into the transcript
    setTimeout(() => { if (r) onSaved(r); setShown(0); setCleaned(false); }, 900);
  }
  /* long-press a photo: delete it, or take a group apart */
  function photoMenu(u: Unit) {
    if (recording) return;
    const grp = u.idx.length > 1;
    const opts = grp ? [S.ungroup, S.delGroup, S.cancel] : [S.delPhoto, S.cancel];
    const pick = (b: number) => {
      if (grp && b === 0) setGroups(groups.filter((g) => !g.includes(u.idx[0])));
      else if ((grp && b === 1) || (!grp && b === 0)) onRemove(u.idx);
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: opts, cancelButtonIndex: opts.length - 1, destructiveButtonIndex: grp ? 1 : 0 }, pick);
    else Alert.alert('', '', opts.map((o, b) => ({ text: o, onPress: () => pick(b), style: b === opts.length - 1 ? 'cancel' : undefined })));
  }
  function toggle(i: number) { setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i])); }
  function group() { if (sel.length < 2) return; setGroups([...groups, sel.slice().sort((a, b) => a - b)]); setSel([]); setSelect(false); }

  /* tap a line or a recording: edit its words with the keyboard */
  function edit(item: number, part: number) {
    const x = said[item];
    if (!x || x.kind === 'head' || recording || making || select || carried) return;
    setDraft(x.kind === 'talk' ? x.text : x.parts[part]?.text ?? '');
    setEditing({ item, part });
  }
  function saveEdit() {
    if (editing) onText(editing.item, editing.part, draft.trim());
    setEditing(null);
  }

  /* the size a photo (or a group) has on the page */
  const sizeOf = (u: Unit) => (u.idx.length > 1 ? soloFor(1, pageW) : soloFor(shapeOf(photos[u.idx[0]]?.r), pageW));
  const GS = { damping: 22, stiffness: 260, mass: 0.6 };
  function stopAuto() { if (auto.current) clearInterval(auto.current); auto.current = null; }
  /* the finger on the screen, as the carried photo's top-left on the page (the page may have scrolled since the lift),
     or null when it is off the page */
  function onPage(x: number, y: number) {
    const l = held.current, b = l?.box;
    if (!l || !b) return null;
    const px = x - b.x, py = y - b.y + (scrollY.current - l.y0);
    if (px < -24 || px > b.w + 24 || py < -24 || py > b.h + 90) return null;
    return { x: px - l.sz.w / 2, y: py - l.sz.h / 2 };
  }
  function sendCarry() {
    const l = held.current;
    if (!l) return;
    const at = onPage(l.fx, l.fy);
    pageApi.current?.carry(at ? { x: at.x, y: at.y, w: l.sz.w, h: l.sz.h } : null, l.u.idx);
  }
  /* near the top or bottom of the page the page scrolls by itself, so a photo can be carried a long way */
  function startAuto() {
    stopAuto();
    auto.current = setInterval(() => {
      const l = held.current;
      if (!l || !scroll.current) return;
      const topEdge = top + 50 + 70, botEdge = Dimensions.get('window').height - 190;
      let dy = 0;
      if (l.fy < topEdge) dy = -Math.min(16, (topEdge - l.fy) / 5);
      else if (l.fy > botEdge) dy = Math.min(16, (l.fy - botEdge) / 5);
      if (!dy) return;
      const next = Math.max(0, Math.min(Math.max(0, sized.current.content - sized.current.view), scrollY.current + dy));
      if (next === scrollY.current) return;
      scrollY.current = next;
      scroll.current.scrollTo({ y: next, animated: false });
      sendCarry();
    }, 16);
  }
  function endCarry() {
    stopAuto();
    held.current = null;
    pageApi.current?.carry(null);
    setDragging(false);
  }
  const fadeGhost = () => { gop.set(withTiming(0, { duration: 140 })); setTimeout(() => setCarried(null), 160); };
  /* the long press took hold of a thumbnail: with a page to drop it on, it lifts (grows from the thumbnail to the size
     it has on the page, under the finger); without one, the menu opens (delete, take a group apart) */
  function liftStart(u: Unit, x: number, y: number, tile: number) {
    if (recording || select) return;
    if (!laid) { photoMenu(u); return; }
    const sz = sizeOf(u);
    held.current = { u, moved: false, box: null, y0: scrollY.current, sx: x, sy: y, fx: x, fy: y, sz: { w: sz.w, h: sz.h } };
    setCarried(u.idx.map((i) => photos[i]));
    gw.set(tile); gh.set(tile); gop.set(1);
    gw.set(withSpring(sz.w, GS)); gh.set(withSpring(sz.h, GS));
    setDragging(true);
    area.current?.measureInWindow((ax, ay, aw, ah) => { if (held.current) { held.current.box = { x: ax, y: ay, w: aw, h: ah }; sendCarry(); } });
    startAuto();
    Haptics.selectionAsync().catch(() => {});
  }
  function liftMove(x: number, y: number) {
    const l = held.current;
    if (!l) return;
    l.fx = x; l.fy = y;
    if (Math.abs(x - l.sx) + Math.abs(y - l.sy) > 8) l.moved = true;
    sendCarry();
  }
  /* let go: over the page, the photo glides to the place the page made for it and stays there; off the page it fades;
     without having moved, the menu opens */
  function liftEnd(x: number, y: number) {
    const l = held.current;
    if (!l) return;
    l.fx = x; l.fy = y;
    const at = onPage(x, y) ? pageApi.current?.landing() : null;
    const b = l.box;
    if (at && b) {
      const lx = b.x + at.rect.x, ly = b.y + at.rect.y - (scrollY.current - l.y0);
      gx.set(withSpring(lx + at.rect.w / 2, GS)); gy.set(withSpring(ly + at.rect.h / 2, GS));
      gw.set(withSpring(at.rect.w, GS)); gh.set(withSpring(at.rect.h, GS));
      onPlace(l.u.idx, at.at);
      endCarry();
      setTimeout(fadeGhost, 240);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }
    const u = l.u, moved = l.moved;
    endCarry();
    fadeGhost();
    if (!moved) photoMenu(u);
  }
  /* the touch was taken away */
  function liftStop() {
    if (!held.current) return;
    endCarry();
    fadeGhost();
  }
  /* the thumbnails get stable callbacks that reach the latest ones through a ref */
  const lifter = useRef({ start: liftStart, move: liftMove, end: liftEnd, stop: liftStop });
  useEffect(() => { lifter.current = { start: liftStart, move: liftMove, end: liftEnd, stop: liftStop }; });
  const lift = useMemo<Lift>(() => ({
    gx, gy,
    start: (u, x, y, tile) => lifter.current.start(u, x, y, tile), move: (x, y) => lifter.current.move(x, y),
    end: (x, y) => lifter.current.end(x, y), stop: () => lifter.current.stop(),
  }), [gx, gy]);
  useEffect(() => stopAuto, []);
  /* a long press on a paragraph offers to join it to the one above */
  const choose = (key: string) => setChoosing((c) => {
    const next = new Set(c ?? []);
    if (next.has(key)) next.delete(key); else next.add(key);
    Haptics.selectionAsync().catch(() => {});
    return next;
  });
  /* a sticker goes onto the page where the person is looking: near the top of the screen, at the right, a little tilted */
  const putSticker = (sk: string) => {
    setStickerBox(false);
    const pw = W - 2 * SZ.px, w = 92;
    const place = (y: number) => onAddSticker(sk, { x: Math.round(pw - w - 4 - Math.random() * 40), y: Math.max(0, Math.round(y)), w, r: Math.round((Math.random() * 24 - 12) * 10) / 10 });
    if (!area.current) { place(40); return; }
    area.current.measureInWindow((_x, ay) => place(top + 50 + 80 + Math.random() * 60 - ay));
  };
  const makeSticker = async () => { setStickerBox(false); const uri = await onMakeSticker(); if (uri) setViewing({ idx: [], at: 0, pics: [{ uri }], only: 'cut' }); };
  useEffect(() => { if (typing !== null) setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120); }, [typing === null, kb]);   // eslint-disable-line react-hooks/exhaustive-deps
  /* what was typed becomes a paragraph of its own (not laid out until the page is) */
  function finishTyping() {
    const text = (typing ?? '').trim();
    setTyping(null);
    if (!text) return;
    onSaved({ kind: 'talk', text, at: Date.now(), g: true });
    Haptics.selectionAsync().catch(() => {});
  }

  const liveTalk = mode === 'talk' && (recording || shown > 0);
  const livePhotos = mode === 'photos' && recording;
  const unlaid = said.slice(laid);
  const nothing = !said.length && !photos.length && !liveTalk && !making && real === 'idle';
  const canLayout = unlaid.length > 0 && !recording && !shown && !making && !select && real === 'idle';
  const canRelayout = laid > 0 && !unlaid.length && !recording && !shown && !making && !select && real === 'idle' && !carried && !choosing && !bin;   // a laid-out day can be laid out again
  const ctlBottom = ins.bottom + 30;
  const ctlH = SZ.talk + 28;
  const listBottom = ctlBottom + ctlH + (canLayout || canRelayout ? 96 : 30);
  const tx = [zh ? h.tx : h.txEn, { color: t.ink, fontFamily: face.body }];
  const reached = livePhotos ? pending.filter((n) => lines[n] || n === k) : [];
  const binAt = { x: W / 2, y: Dimensions.get('window').height - ctlBottom - ctlH / 2 };   // the bin sits where the talk key is
  const tray = photos.length ? (
    <View style={{ gap: 10 }}>
      <View style={h.trayHead}>
        <Text style={{ fontSize: 13, color: t.mut }}>
          {select ? S.selN(sel.length) : laid > 0 || past ? S.nPhotos(photos.length, groups.length) : groups.length ? S.photosOfG(photos.length, groups.length) : S.photosOf(photos.length)}
        </Text>
        <Pressable disabled={recording} hitSlop={8} onPress={() => { setSelect(!select); setSel([]); }}>
          <Text style={{ fontSize: 13.5, color: select ? t.ink : t.mut, opacity: recording ? 0.35 : 1 }}>{select ? S.cancel : S.groupBtn}</Text>
        </Pressable>
      </View>
      <Tray photos={photos} groups={groups} used={used} width={pageW} select={select} sel={sel} onToggle={toggle} onOpen={(idx) => setViewing({ idx, at: 0 })} lift={lift} />
      {select ? <Text style={[h.hint, { color: t.mut }]}>{S.selHow}</Text>
        : laid > 0 && showTray ? <Text style={[h.hint, { color: t.mut, fontFamily: face.body }]}>{S.dragHow}</Text>
          : !said.length && !recording ? <Text style={[h.hint, { color: t.mut, fontFamily: face.body }]}>{S.photoHow}</Text> : null}
    </View>
  ) : null;

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[StyleSheet.absoluteFill, { opacity: fade }]}>
      {making ? (
        <View style={[StyleSheet.absoluteFill, h.making]} pointerEvents="none">
          <Glow top={Dimensions.get('window').height / 2 - 200} size={320} />
          <Text style={{ fontSize: 22, color: t.ink }}>✦</Text>
          <Text style={[h.makingT, { color: t.ink, fontFamily: face.body }]}>{S.making}</Text>
        </View>
      ) : (
        <Animated.View style={[StyleSheet.absoluteFill, { top: top + 50, bottom: typing !== null ? kb : 0, opacity: turn }]}>
        <GHScrollView ref={scroll} scrollEnabled={!dragging} style={{ flex: 1 }} showsVerticalScrollIndicator={false} scrollEventThrottle={16}
          onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
          onLayout={(e) => { sized.current.view = e.nativeEvent.layout.height; }}
          contentContainerStyle={{ paddingHorizontal: SZ.px, paddingTop: 10, paddingBottom: listBottom, gap: 24 }}
          onContentSizeChange={(_w, ch) => { sized.current.content = ch; if (!select && !livePhotos && !dragging && (unlaid.length || real !== 'idle')) scroll.current?.scrollToEnd({ animated: true }); }}>
          {laid > 0 ? <Page key={day} items={said.slice(0, laid)} photos={photos} placed={placed} moved={moved} title={pageTitle} meta={pageMeta} area={area}
            api={pageApi} voice={voice} indent={indent} onRename={recording ? undefined : onRename} ownTitle={ownTitle}
            onDrag={setDragging} onMove={onMove} onEdit={edit}
            onMerge={recording ? undefined : onMerge} onShare={(item) => setChoosing(new Set([`t${item}`]))} onSelect={setReading}
            onOpen={(idx) => setViewing({ idx, at: 0 })}
            chosen={choosing ?? undefined} onChoose={choosing ? choose : undefined}
            stickers={stickers} slap={slap} onSticker={onSticker} bin={binAt} scroll={scroll} onStickerDrag={setBin} /> : null}

          {laid === 0 ? tray : null}

          {unlaid.length ? <Stream items={unlaid} onEdit={(i, part) => edit(laid + i, part)} /> : null}

          {livePhotos && reached.length ? <Stream items={[{ kind: 'photos', parts: reached.map((n) => ({ unit: units[n], text: lines[n] || line(n), spoken: spoken(units[n], lines[n] || line(n)) })) }]} /> : null}
          {(real === 'listen' || real === 'tidy') && live ? <Text style={tx}>{live}</Text> : null}
          {real === 'tidy' ? <Text style={[h.hint, { color: t.mut, fontFamily: face.body }]}>✦ {S.cleaning}</Text> : null}
          {real === 'show' && heard ? (
            <Text style={tx}>
              {marked(heard.raw, heard.tidied ?? heard.text).map(([w, kept], i) => <Text key={i} style={kept ? null : { color: t.strike, textDecorationLine: 'line-through' }}>{w}</Text>)}
            </Text>
          ) : null}
          {liveTalk ? (
            <Text style={tx}>
              {raw.slice(0, shown).map((w, i) => {
                if (w[1] === 1 && cleaned) return null;
                return <Text key={i} style={w[1] === 1 ? { color: t.strike, textDecorationLine: 'line-through' } : null}>{w[0]}</Text>;
              })}
            </Text>
          ) : null}

          {typing !== null ? (
            <TextInput value={typing} onChangeText={setTyping} multiline autoFocus scrollEnabled={false} selectionColor={t.red}
              placeholder={S.writeHint} placeholderTextColor={t.mut} onBlur={finishTyping}
              style={[zh ? h.tx : h.txEn, { color: t.ink, fontFamily: face.body, padding: 0, minHeight: 60 }]} />
          ) : null}
          {/* once the page is laid out, every photo of the day stays here at the foot of it, small and numbered */}
          {laid > 0 ? tray : null}
          {/* the rest of the page: a tap anywhere here starts writing */}
          {!recording && !making && !select && !choosing && !carried && typing === null ? (
            <Pressable onPress={() => setTyping('')} style={{ minHeight: 260 }} accessibilityLabel={S.writeHint} />
          ) : null}
          {nothing && typing === null ? (
            <View style={{ marginTop: 24, gap: 8 }}>
              <Text style={{ fontSize: 14, color: t.mut, fontFamily: face.body }}>{S.hi(night)}</Text>
              <Text style={[h.ask, { color: t.ink, fontFamily: face.title }]}>{S.ask0}</Text>
            </View>
          ) : null}
        </GHScrollView>
        </Animated.View>
      )}

      {!making ? <LinearGradient colors={[t.b + '00', t.b]} locations={[0, 0.45]} style={[h.fadeOut, { height: listBottom }]} pointerEvents="none" /> : null}

      <View style={[h.tb, { top, backgroundColor: t.b }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
          {past ? <Round icon="back" label={S.back} onPress={onToday} /> : null}
          <Pressable onPress={onTitle} disabled={!onTitle || recording} hitSlop={8} accessibilityRole="button" style={h.titleBtn}>
            <Text numberOfLines={1} style={[past ? h.titleSm : h.title, { color: t.ink, fontFamily: face.title, flexShrink: 1 }]}>{title}</Text>
            {onTitle ? <Text style={[h.caret, { color: t.mut, opacity: recording ? 0.35 : 1 }]}>▾</Text> : null}
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Round icon="cal" label={S.archive} onPress={() => onOpen('archive')} />
          <Round icon="gear" label={S.settings} onPress={() => onOpen('settings')} />
        </View>
      </View>

      {canLayout ? (
        <View style={[h.layoutWrap, { bottom: ctlBottom + ctlH + 16 }]} pointerEvents="box-none">
          <Text style={[h.layoutHint, { color: t.mut, fontFamily: face.body }]}>{S.layoutHint}</Text>
          <Pressable onPress={onLayout} style={({ pressed }) => [h.layout, { backgroundColor: t.panel, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={{ fontSize: 14.5, color: t.ink }}>{S.layoutBtn}</Text>
          </Pressable>
        </View>
      ) : canRelayout ? (
        <View style={[h.layoutWrap, { bottom: ctlBottom + ctlH + 16 }]} pointerEvents="box-none">
          <View style={h.again}>
            {onUndo ? (
              <View style={h.againOne}>
                <Text style={[h.relayoutHint, { color: t.mut, fontFamily: face.body }]}>{S.back1}</Text>
                <Round icon="undo" label={S.back1} onPress={onUndo} />
              </View>
            ) : null}
            <View style={h.againOne}>
              <Text style={[h.relayoutHint, { color: t.mut, fontFamily: face.body }]}>{S.relayoutHint}</Text>
              <Round icon="layout" label={S.relayoutHint} onPress={onLayout} />
            </View>
            <View style={h.againOne}>
              <Text style={[h.relayoutHint, { color: t.mut, fontFamily: face.body }]}>{S.stickers}</Text>
              <Round icon="sticker" label={S.stickers} onPress={() => setStickerBox(true)} />
            </View>
          </View>
        </View>
      ) : null}

      <View style={[h.ctl, { bottom: ctlBottom, height: ctlH, opacity: bin ? 0 : 1 }]} pointerEvents={making || bin ? 'none' : 'box-none'}>
        {choosing ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 12.5, color: t.mut }}>{choosing.size ? S.chosenN([...choosing].filter((c) => c.startsWith('t')).length, [...choosing].filter((c) => !c.startsWith('t')).length) : S.chooseShare}</Text>
            <View style={h.selRow}>
              <Pressable onPress={() => setChoosing(null)} style={[h.ghost, { backgroundColor: t.panel }]}><Text style={{ color: t.ink, fontSize: 14.5 }}>{S.cancel}</Text></Pressable>
              <Pressable disabled={!choosing.size} onPress={() => setSharing(true)} style={[h.pill, { backgroundColor: t.pill, opacity: choosing.size ? 1 : 0.4 }]}><Text style={{ color: t.pillText, fontSize: 14.5, fontWeight: '500' }}>{S.makeCard}</Text></Pressable>
            </View>
          </View>
        ) : select ? (
          <View style={h.selRow}>
            <Pressable onPress={() => setSel([])} style={[h.ghost, { backgroundColor: t.panel }]}><Text style={{ color: t.ink, fontSize: 14.5 }}>{S.clear}</Text></Pressable>
            <Pressable onPress={group} style={[h.pill, { backgroundColor: t.pill, opacity: sel.length < 2 ? 0.4 : 1 }]}><Text style={{ color: t.pillText, fontSize: 14.5, fontWeight: '500' }}>{S.makeGroup(sel.length)}</Text></Pressable>
          </View>
        ) : (
          <TalkKey left={{ icon: 'camera', label: S.camera, onPress: onCamera }} right={{ icon: 'photo', label: S.library, onPress: onPick }}
            state={rec} setState={setRec} secs={secs} onStart={start} onStop={() => finish(true)} onCancel={() => finish(false)} />
        )}
      </View>

      {carried ? (
        <Re.View pointerEvents="none" style={[h.carry, ghostStyle]}>
          {carried.length > 1 ? <Fluid pics={carried} /> : <Image source={src(carried[0])} contentFit="cover" style={{ flex: 1, borderRadius: 8 }} />}
        </Re.View>
      ) : null}

      {bin ? (
        <View pointerEvents="none" style={[h.bin, { top: binAt.y - 32 - 26, left: W / 2 - 70, width: 140 }]}>
          <Text style={{ fontSize: 11.5, color: t.mut, marginBottom: 8 }}>{S.binHint}</Text>
          <View style={[h.binDot, { backgroundColor: bin === 'over' ? t.red : t.panel, transform: [{ scale: bin === 'over' ? 1.15 : 1 }] }]}>
            <Text style={{ fontSize: 22, color: bin === 'over' ? '#fff' : t.ink }}>×</Text>
          </View>
        </View>
      ) : null}

      {stickerBox ? <StickerBox mine={mine} onPick={putSticker} onMake={makeSticker} onClose={() => setStickerBox(false)} /> : null}
      {sharing && choosing ? (() => {
        const { paras, tiles } = pieces(said.slice(0, laid), photos, placed);
        return (
          <ShareSheet day={day} title={pageTitle} meta={pageMeta}
            paras={paras.filter((x) => choosing.has(x.key)).map((x) => x.text)}
            pics={tiles.filter((x) => choosing.has(x.key)).flatMap((x) => x.pics).slice(0, 4)}
            onClose={() => setSharing(false)} onNotice={(text) => onNotice({ text })} />
        );
      })() : null}

      {viewing ? (
        <Viewer pics={viewing.pics ?? viewing.idx.map((i) => photos[i]).filter(Boolean)} start={viewing.at} mine={mine} only={viewing.only} onClose={() => setViewing(null)}
          onDelete={(k) => { const i = viewing.idx[k]; const rest = viewing.idx.filter((_, j) => j !== k).map((n) => (n > i ? n - 1 : n)); onPhoto.del(i); setViewing(rest.length ? { idx: rest, at: Math.min(k, rest.length - 1) } : null); }}
          onSave={(k, uri, r) => onPhoto.save(viewing.idx[k], uri, r)} onRestore={(k) => onPhoto.restore(viewing.idx[k])}
          onLifted={(file) => putSticker(onPhoto.lifted(file))} onNotice={(text) => onNotice({ text })} />
      ) : null}
      {reading !== null ? (
        <View style={[StyleSheet.absoluteFill, h.editWrap]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.ink + '2E' }]} onPress={() => setReading(null)} />
          <View style={[h.sheet, { backgroundColor: t.b, paddingBottom: ins.bottom + 16 }]}>
            <View style={h.sheetBar}>
              <Text style={{ fontSize: 13, color: t.mut, flex: 1 }}>{S.selectHint}</Text>
              <Pressable hitSlop={10} onPress={() => setReading(null)}><Text style={{ fontSize: 15, color: t.ink, fontWeight: '600' }}>{S.editDone}</Text></Pressable>
            </View>
            {/* not editable, so no keyboard; the words can still be selected with the system's handles, then copied or shared */}
            <TextInput value={reading} editable={false} multiline scrollEnabled selectionColor={t.red}
              style={[zh ? h.tx : h.txEn, h.input, { color: t.ink, fontFamily: face.body }]} />
          </View>
        </View>
      ) : null}

      {editing ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[StyleSheet.absoluteFill, h.editWrap]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.ink + '2E' }]} onPress={() => setEditing(null)} />
          <View style={[h.sheet, { backgroundColor: t.b, paddingBottom: 16 }]}>
            <View style={h.sheetBar}>
              <Pressable hitSlop={10} onPress={() => setEditing(null)}><Text style={{ fontSize: 15, color: t.mut }}>{S.cancel}</Text></Pressable>
              <Pressable hitSlop={10} onPress={saveEdit}><Text style={{ fontSize: 15, color: t.ink, fontWeight: '600' }}>{S.editDone}</Text></Pressable>
            </View>
            <TextInput value={draft} onChangeText={setDraft} multiline autoFocus selectionColor={t.red}
              style={[zh ? h.tx : h.txEn, h.input, { color: t.ink, fontFamily: face.body }]} />
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </Animated.View>
  );
}

const h = StyleSheet.create({
  tb: { position: 'absolute', left: 0, right: 0, paddingLeft: SZ.px, paddingRight: SZ.px - 4, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22 },
  titleSm: { fontSize: 18 },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  caret: { fontSize: 13, marginTop: 3 },
  ask: { fontSize: 28, lineHeight: 38 },
  tx: { fontSize: 16, lineHeight: 29 },
  txEn: { fontSize: 17.5, lineHeight: 27 },
  trayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  hint: { fontSize: 13.5, lineHeight: 21 },
  making: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 },
  makingT: { fontSize: 15.5 },
  fadeOut: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  layoutWrap: { position: 'absolute', left: SZ.px, right: SZ.px, alignItems: 'center', gap: 8 },
  layoutHint: { fontSize: 13, textAlign: 'center' },
  relayoutHint: { fontSize: 11.5, textAlign: 'center' },
  bin: { position: 'absolute', alignItems: 'center', zIndex: 20 },
  binDot: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  again: { flexDirection: 'row', gap: 28 },
  againOne: { alignItems: 'center', gap: 8 },
  layout: { height: 38, paddingHorizontal: 22, borderRadius: 19, justifyContent: 'center' },
  ctl: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'flex-start' },
  selRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: (SZ.talk - SZ.key) / 2 },
  carry: { position: 'absolute', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  editWrap: { justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: SZ.px, paddingTop: 14, gap: 6 },
  sheetBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 },
  input: { minHeight: 120, maxHeight: 280, textAlignVertical: 'top', paddingTop: 0 },
  ghost: { height: SZ.key, paddingHorizontal: 18, borderRadius: SZ.key / 2, justifyContent: 'center' },
  pill: { height: SZ.key, paddingHorizontal: 22, borderRadius: SZ.key / 2, justifyContent: 'center' },
});
