import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Animated, Dimensions, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Page, solo, Stream } from './Doc';
import { Mosaic, src, Tray } from './Photos';
import { agentOn, Heard, marked, transcribe } from './agent';
import { Pic, Placed, Pos, Said, Unit, unitsOf } from './session';
import { keepRecording } from './store';
import { SZ } from './theme';
import { Glow, Notice, RecState, Round, TalkKey, useFace, useLang, useS, useT, useTimer } from './ui';

/* The one writing page. Empty, with photos, or carrying on later, it is the same page:
   today's photos (if any), what has been laid out, the tidied words not laid out yet, and the talk row. */
export function Home({ hidden, night, past, title, pageTitle, pageMeta, onToday, photos, groups, setGroups, onRemove, said, laid, placed, moved, making, live, grammar, onCamera, onPick, onOpen, onRecord, onSaved, onText, onPlace, onMove, onLayout, onNotice }: {
  hidden: boolean; night: boolean;
  past: boolean; title: string; pageTitle: string; pageMeta: string; onToday: () => void;   // a past day opens on this same page
  photos: Pic[]; groups: number[][]; setGroups: (g: number[][]) => void; onRemove: (idx: number[]) => void;
  said: Said[]; laid: number; placed?: Placed[]; moved?: Record<string, Pos>; making: boolean;
  live: string;                                      // Apple's live words while recording, in the installed app
  grammar: boolean;                                  // "Fix grammar" in settings, sent with each recording
  onCamera: () => void; onPick: () => void;
  onOpen: (p: 'archive' | 'settings') => void;
  onRecord: { start: () => Promise<boolean>; stop: () => Promise<string | null>; cancel: () => Promise<string | null> };
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
  const [draft, setDraft] = useState('');
  const lift = useRef<{ u: Unit; moved: boolean; carried: boolean } | null>(null);   // a tray photo picked up by a long press
  const [ghost, setGhost] = useState<Pic[] | null>(null);
  const [over, setOver] = useState<{ x: number; y: number } | null>(null);   // the carried photo over the page: the words already move for it
  const box = useRef<{ x: number; y: number; w: number; h: number } | null>(null);   // the page's text area on screen, measured when a photo is lifted
  const ghostXY = useState(() => new Animated.ValueXY())[0];
  const g = solo(W - 2 * SZ.px);                                   // a dropped photo takes the size of a single photo on the page

  useEffect(() => { Animated.timing(fade, { toValue: hidden ? 0 : 1, duration: 360, useNativeDriver: true }).start(); }, [hidden, fade]);
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);

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
  function send(uri: string) {
    setReal('tidy');
    keepRecording(uri).then((kept) => transcribe(kept, grammar).then((r) => {
      if (!r.text.trim()) { setReal('idle'); onNotice({ text: S.heardNothing }); return; }
      setHeard(r); setReal('show');
      setTimeout(() => { onSaved({ kind: 'talk', text: r.text, audio: kept, g: grammar }); setReal('idle'); setHeard(null); }, 1500);
    }).catch((e: unknown) => {
      setReal('idle');
      onNotice({ text: `${S.notReached} (${String(e instanceof Error ? e.message : e).slice(0, 40)})`, action: { label: S.retry, run: () => send(kept) } });
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
      onRecord.stop().then((uri) => (uri ? send(uri) : setReal('idle')));
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
    if (!x || recording || making || select || ghost) return;
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
    setOver(onPageAt(x, y));
  }
  const handlers = useRef({ dropAt, endLift, carryTo });
  useEffect(() => { handlers.current = { dropAt, endLift, carryTo }; });
  const take = useCallback(() => { if (!lift.current) return false; lift.current.moved = true; return true; }, []);
  const hold = useCallback(() => { if (lift.current) lift.current.carried = true; }, []);
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
  const canRelayout = laid > 0 && !unlaid.length && !recording && !shown && !making && !select && real === 'idle' && !ghost;   // a laid-out day can be laid out again
  const top = ins.top + 8;
  const ctlBottom = ins.bottom + 30;
  const ctlH = SZ.talk + 28;
  const listBottom = ctlBottom + ctlH + (canLayout || canRelayout ? 96 : 30);
  const tx = [zh ? h.tx : h.txEn, { color: t.ink, fontFamily: face.body }];
  const reached = livePhotos ? pending.filter((n) => lines[n] || n === k) : [];

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
        <ScrollView ref={scroll} scrollEnabled={!dragging} onScrollBeginDrag={scrolled} style={[StyleSheet.absoluteFill, { top: top + 50 }]} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SZ.px, paddingTop: 10, paddingBottom: listBottom, gap: 24 }}
          onContentSizeChange={() => { if (!select && !livePhotos && !dragging && (unlaid.length || real !== 'idle')) scroll.current?.scrollToEnd({ animated: true }); }}>
          {laid > 0 ? <Page items={said.slice(0, laid)} photos={photos} placed={placed} moved={moved} title={pageTitle} meta={pageMeta} area={area}
            preview={ghost && over ? { pics: ghost, ...over } : null}
            onDrag={setDragging} onMove={onMove} onEdit={edit} /> : null}

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

          {unlaid.length ? <Stream items={unlaid} onEdit={(i) => edit(laid + i, -1)} /> : null}

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

          {nothing ? (
            <View style={{ marginTop: 24, gap: 8 }}>
              <Text style={{ fontSize: 14, color: t.mut, fontFamily: face.body }}>{S.hi(night)}</Text>
              <Text style={[h.ask, { color: t.ink, fontFamily: face.title }]}>{S.ask0}</Text>
            </View>
          ) : null}
        </ScrollView>
        </Carry>
      )}

      {!making ? <LinearGradient colors={[t.b + '00', t.b]} locations={[0, 0.45]} style={[h.fadeOut, { height: listBottom }]} pointerEvents="none" /> : null}

      <View style={[h.tb, { top, backgroundColor: t.b }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
          {past ? <Round icon="back" label={S.back} onPress={onToday} /> : null}
          <Text numberOfLines={1} style={[past ? h.titleSm : h.title, { color: t.ink, fontFamily: face.title, flexShrink: 1 }]}>{title}</Text>
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
          <Text style={[h.relayoutHint, { color: t.mut, fontFamily: face.body }]}>{S.relayoutHint}</Text>
          <Round icon="layout" label={S.relayoutHint} onPress={onLayout} />
        </View>
      ) : null}

      <View style={[h.ctl, { bottom: ctlBottom, height: ctlH }]} pointerEvents={making ? 'none' : 'box-none'}>
        {select ? (
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
