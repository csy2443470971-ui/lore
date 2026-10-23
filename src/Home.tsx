import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Animated, Dimensions, Keyboard, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { Page, pieces, solo, Stream } from './Doc';
import { ShareSheet } from './Share';
import { StickerBox } from './StickerBox';
import { Viewer } from './Viewer';
import { Mosaic, src, Tray } from './Photos';
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
  const [rec, setRec] = useState<RecState>('idle');
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
  const lift = useRef<{ u: Unit; moved: boolean; carried: boolean } | null>(null);   // a tray photo picked up by a long press
  const [ghost, setGhost] = useState<Pic[] | null>(null);
  const [over, setOver] = useState<{ x: number; y: number } | null>(null);   // the carried photo over the page: the words already move for it
  const box = useRef<{ x: number; y: number; w: number; h: number } | null>(null);   // the page's text area on screen, measured when a photo is lifted
  const ghostXY = useState(() => new Animated.ValueXY())[0];
  const g = solo(W - 2 * SZ.px);                                   // a dropped photo takes the size of a single photo on the page

  useEffect(() => { Animated.timing(fade, { toValue: hidden ? 0 : 1, duration: 360, useNativeDriver: true }).start(); }, [hidden, fade]);
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);
  /* another day: clear what belonged to the last one and fade the new page in, instead of rebuilding the whole screen */
  const turn = useState(() => new Animated.Value(1))[0];
  const shownDay = useRef(day);
  useEffect(() => {
    if (shownDay.current === day) return;
    shownDay.current = day;
    setK(-1); setLines({}); setSelect(false); setSel([]); setEditing(null); setGhost(null); setOver(null); setChoosing(null); setSharing(false); setStickerBox(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
    turn.setValue(0.25);
    Animated.timing(turn, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [day, turn]);

  const units = unitsOf(photos.length, groups);
  const talked = new Set(said.flatMap((x) => (x.kind === 'photos' ? x.parts.map((p) => p.unit.idx[0]) : [])));
  const laidIdx = new Set(said.slice(0, laid).flatMap((x) => (x.kind === 'photos' ? x.parts.map((p) => p.unit.idx[0]) : [])));
  const pending = units.map((u, n) => (talked.has(u.idx[0]) ? -1 : n)).filter((n) => n >= 0);
  const onPage = new Set([...laidIdx, ...(placed ?? []).map((p) => p.idx[0])]);
  const showTray = units.some((u) => !onPage.has(u.idx[0]));
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
    if (!x || x.kind === 'head' || recording || making || select || ghost) return;
    setDraft(x.kind === 'talk' ? x.text : x.parts[part]?.text ?? '');
    setEditing({ item, part });
  }
  function saveEdit() {
    if (editing) onText(editing.item, editing.part, draft.trim());
    setEditing(null);
  }

  /* long-press a photo in the tray: with a page to drop it on, it lifts and follows the finger;
     let go without moving and the menu opens instead (delete, ungroup) */
  function liftPhoto(u: Unit, x: number, y: number) {
    if (recording || select) return;
    if (!laid) { photoMenu(u); return; }
    lift.current = { u, moved: false, carried: false };
    ghostXY.setValue({ x: x - g.w / 2, y: y - g.h / 2 });
    setGhost(u.idx.map((i) => photos[i]));
    setDragging(true);
    box.current = null;
    area.current?.measureInWindow((ax, ay, aw, ah) => { box.current = { x: ax, y: ay, w: aw, h: ah }; });
    Haptics.selectionAsync().catch(() => {});
  }
  function endLift() { lift.current = null; setGhost(null); setOver(null); setDragging(false); }
  /* the finger came up while the tray still had it: no move means the menu; a move the page scroll took means nothing */
  function releasePhoto() {
    setTimeout(() => {
      const l = lift.current;
      if (!l || l.carried) return;
      endLift();
      if (!l.moved) photoMenu(l.u);
    }, 0);
  }
  /* where the carried photo would land on the page, in the page's own coordinates; null when the finger is off the page */
  function onPageAt(x: number, y: number) {
    const b = box.current;
    if (!b || x < b.x - 24 || x > b.x + b.w + 24 || y < b.y - 24 || y > b.y + b.h + 80) return null;
    return { x: Math.max(0, Math.min(b.w - g.w, x - b.x - g.w / 2)), y: Math.max(0, y - b.y - g.h / 2) };
  }
  /* dropped over the page: it stays where the words already made room for it */
  function dropAt(x: number, y: number) {
    const l = lift.current, at = onPageAt(x, y);
    endLift();
    if (!l || !at) return;
    onPlace(l.u.idx, at);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
  function carryTo(x: number, y: number) {
    ghostXY.setValue({ x: x - g.w / 2, y: y - g.h / 2 });
    /* the words make room only when where it would land moves by a few points, not on every touch event */
    const at = onPageAt(x, y);
    setOver((o) => (!at || !o ? at : Math.abs(at.x - o.x) < 6 && Math.abs(at.y - o.y) < 6 ? o : at));
  }
  const handlers = useRef({ dropAt, endLift, carryTo });
  useEffect(() => { handlers.current = { dropAt, endLift, carryTo }; });
  const take = useCallback(() => { if (!lift.current) return false; lift.current.moved = true; return true; }, []);
  const hold = useCallback(() => { if (lift.current) lift.current.carried = true; }, []);
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
  const scrolled = useCallback(() => { if (lift.current) lift.current.moved = true; }, []);
  const follow = useCallback((x: number, y: number) => handlers.current.carryTo(x, y), []);
  const letGo = useCallback((x: number, y: number) => handlers.current.dropAt(x, y), []);
  const putBack = useCallback(() => handlers.current.endLift(), []);

  const recording = rec !== 'idle';
  const liveTalk = mode === 'talk' && (recording || shown > 0);
  const livePhotos = mode === 'photos' && recording;
  const unlaid = said.slice(laid);
  const nothing = !said.length && !photos.length && !liveTalk && !making && real === 'idle';
  const canLayout = unlaid.length > 0 && !recording && !shown && !making && !select && real === 'idle';
  const canRelayout = laid > 0 && !unlaid.length && !recording && !shown && !making && !select && real === 'idle' && !ghost && !choosing && !bin;   // a laid-out day can be laid out again
  const top = ins.top + 8;
  const ctlBottom = ins.bottom + 30;
  const ctlH = SZ.talk + 28;
  const listBottom = ctlBottom + ctlH + (canLayout || canRelayout ? 96 : 30);
  const tx = [zh ? h.tx : h.txEn, { color: t.ink, fontFamily: face.body }];
  const reached = livePhotos ? pending.filter((n) => lines[n] || n === k) : [];
  const binAt = { x: W / 2, y: Dimensions.get('window').height - ctlBottom - ctlH / 2 };   // the bin sits where the talk key is

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[StyleSheet.absoluteFill, { opacity: fade }]}>
      {making ? (
        <View style={[StyleSheet.absoluteFill, h.making]} pointerEvents="none">
          <Glow top={Dimensions.get('window').height / 2 - 200} size={320} />
          <Text style={{ fontSize: 22, color: t.ink }}>✦</Text>
          <Text style={[h.makingT, { color: t.ink, fontFamily: face.body }]}>{S.making}</Text>
        </View>
      ) : (
        <Carry take={take} hold={hold} follow={follow} letGo={letGo} putBack={putBack}>
        <Animated.View style={[StyleSheet.absoluteFill, { top: top + 50, bottom: typing !== null ? kb : 0, opacity: turn }]}>
        <GHScrollView ref={scroll} scrollEnabled={!dragging} onScrollBeginDrag={scrolled} style={{ flex: 1 }} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SZ.px, paddingTop: 10, paddingBottom: listBottom, gap: 24 }}
          onContentSizeChange={() => { if (!select && !livePhotos && !dragging && (unlaid.length || real !== 'idle')) scroll.current?.scrollToEnd({ animated: true }); }}>
          {laid > 0 ? <Page key={day} items={said.slice(0, laid)} photos={photos} placed={placed} moved={moved} title={pageTitle} meta={pageMeta} area={area}
            preview={ghost && over ? { pics: ghost, ...over } : null} voice={voice} indent={indent} onRename={recording ? undefined : onRename} ownTitle={ownTitle}
            onDrag={setDragging} onMove={onMove} onEdit={edit}
            onMerge={recording ? undefined : onMerge} onShare={(item) => setChoosing(new Set([`t${item}`]))} onSelect={setReading}
            onOpen={(idx) => setViewing({ idx, at: 0 })}
            chosen={choosing ?? undefined} onChoose={choosing ? choose : undefined}
            stickers={stickers} slap={slap} onSticker={onSticker} bin={binAt} scroll={scroll} onStickerDrag={setBin} /> : null}

          {showTray ? (
            <View style={{ gap: 10 }}>
              <View style={h.trayHead}>
                <Text style={{ fontSize: 13, color: t.mut }}>{select ? S.selN(sel.length) : groups.length ? S.photosOfG(photos.length, groups.length) : S.photosOf(photos.length)}</Text>
                <Pressable disabled={recording} hitSlop={8} onPress={() => { setSelect(!select); setSel([]); }}>
                  <Text style={{ fontSize: 13.5, color: select ? t.ink : t.mut, opacity: recording ? 0.35 : 1 }}>{select ? S.cancel : S.groupBtn}</Text>
                </Pressable>
              </View>
              <Tray photos={photos} groups={groups} skip={onPage} width={W - 2 * SZ.px} select={select} sel={sel} onToggle={toggle} onLong={liftPhoto} onRelease={releasePhoto} cur={-1} />
              {select ? <Text style={[h.hint, { color: t.mut }]}>{S.selHow}</Text>
                : !said.length && !recording ? <Text style={[h.hint, { color: t.mut, fontFamily: face.body }]}>{S.photoHow}</Text> : null}
            </View>
          ) : null}

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
          {/* the rest of the page: a tap anywhere here starts writing */}
          {!recording && !making && !select && !choosing && !ghost && typing === null ? (
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
        </Carry>
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

      {ghost ? (
        <Animated.View pointerEvents="none" style={[h.carry, { width: g.w, height: g.h, opacity: over ? 0 : 0.94, transform: ghostXY.getTranslateTransform() }]}>
          {ghost.length > 1 ? <Mosaic pics={ghost} w={g.w} h={g.h} r={8} /> : <Image source={src(ghost[0])} contentFit="cover" style={{ width: g.w, height: g.h, borderRadius: 8 }} />}
        </Animated.View>
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

/* the touch that carries a photo lifted from the tray: it takes over on the first move after the long press,
   so the finger can take the photo anywhere on the page */
function Carry({ take, hold, follow, letGo, putBack, children }: {
  take: () => boolean; hold: () => void; follow: (x: number, y: number) => void; letGo: (x: number, y: number) => void; putBack: () => void; children: React.ReactNode;
}) {
  const pr = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => take(),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => hold(),
    onPanResponderMove: (_, gs) => follow(gs.moveX, gs.moveY),
    onPanResponderRelease: (_, gs) => letGo(gs.moveX, gs.moveY),
    onPanResponderTerminate: () => putBack(),
  }), [take, hold, follow, letGo, putBack]);
  return <View style={StyleSheet.absoluteFill} {...pr.panHandlers}>{children}</View>;
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
  carry: { position: 'absolute', left: 0, top: 0, opacity: 0.94, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  editWrap: { justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: SZ.px, paddingTop: 14, gap: 6 },
  sheetBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 },
  input: { minHeight: 120, maxHeight: 280, textAlignVertical: 'top', paddingTop: 0 },
  ghost: { height: SZ.key, paddingHorizontal: 18, borderRadius: SZ.key / 2, justifyContent: 'center' },
  pill: { height: SZ.key, paddingHorizontal: 22, borderRadius: SZ.key / 2, justifyContent: 'center' },
});
