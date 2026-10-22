import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, AppState, Linking, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Updates from 'expo-updates';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Newsreader_300Light, Newsreader_400Regular, Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader';
import { Lang, STR } from './src/data';
import { PHOTO } from './src/images';
import { Day, removePhotos, Said, Sticker } from './src/session';
import { match, sentences } from './src/match';
import { timeRules } from './src/sections';
import { join, shape } from './src/paragraphs';
import { agentOn, fixText, readPage, sectionsOf } from './src/agent';
import { dayKey, isDayKey, isSpanKey, keepPhoto, loadDays, loadMine, relative, saveDay, saveMine } from './src/store';
import LoreVision from './modules/lore-vision';
import { useLive } from './src/live';
import { dark as darkT, light as lightT } from './src/theme';
import { DotField, LangCtx, Notice, ThemeCtx, Toast } from './src/ui';
import { Home } from './src/Home';
import { Archive, Insights, Settings } from './src/Screens';
import { DayMenu } from './src/DayMenu';
import { Week } from './src/Week';
import { RangePicker } from './src/Range';

type Mode = 'light' | 'dark' | 'auto';
type Pane = null | 'archive' | 'insights' | 'settings';
const EMPTY: Day = { photos: [], groups: [], said: [], laid: 0 };
/* web only: ?seed=photos starts today with six sample photos, so the photo flow can be shown without a photo library */
const SEED = Platform.OS === 'web' && typeof location !== 'undefined' && location.search.includes('seed=photos')
  ? ['cafe', 'latte', 'sunset', 'osmanthus', 'noodles', 'hotpot'].map((k) => ({ asset: PHOTO[k] })) : [];

/* a day's page is titled by its date until it has a title of its own; the weekday goes underneath */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/* the day n days after (or before) a day */
function shift(key: string, n: number) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}
function dateTitle(key: string, lang: Lang) {
  const [y, m, d] = key.split('-').map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return lang === 'zh' ? { title: `${m}月${d}日`, meta: `周${'日一二三四五六'[w]}` } : { title: `${MONTHS[m - 1]} ${d}`, meta: DAYS[w] };
}

/* each day inside a page written over several days, and that page's key */
function spanLinks(days: Record<string, Day>) {
  const out: Record<string, string> = {};
  for (const [k, d] of Object.entries(days)) {
    if (!isSpanKey(k) || !d.span || (!d.said.length && !d.photos.length)) continue;
    for (let x = d.span.from; x <= d.span.to; x = shift(x, 1)) out[x] = k;
  }
  return out;
}
/* how many paragraphs a page's items make (a sticker is tied to a paragraph by its number) */
const paraCount = (said: Said[]) => said.filter((x) => (x.kind === 'talk' && !!x.text) || x.kind === 'photos').length;
/* one day's things after another's: photo numbers, groups, placed photos, where photos were dragged, and stickers move along */
function append(dst: Day, src: Day): Day {
  const off = dst.photos.length, n = dst.said.length, pn = paraCount(dst.said);
  const re = (idx: number[]) => idx.map((i) => i + off);
  const said = src.said.map((x): Said => (x.kind === 'photos' ? { ...x, parts: x.parts.map((p) => ({ ...p, unit: { idx: re(p.unit.idx) } })) } : x));
  const moved = Object.fromEntries(Object.entries(src.moved ?? {}).map(([k, v]) => [/^\d+-\d+$/.test(k) ? k.replace(/^\d+/, (i) => String(Number(i) + n)) : k, v]));
  const allLaid = dst.laid === dst.said.length;
  return {
    ...dst,
    photos: [...dst.photos, ...src.photos], groups: [...dst.groups, ...src.groups.map(re)], said: [...dst.said, ...said],
    laid: allLaid ? n + src.laid : dst.laid,
    placed: [...(dst.placed ?? []), ...(src.placed ?? []).map((p) => ({ ...p, idx: re(p.idx) }))],
    moved: { ...dst.moved, ...moved },
    stickers: [...(dst.stickers ?? []), ...(src.stickers ?? []).map((st) => ({ ...st, p: st.p < 0 ? st.p : st.p + pn }))],
  };
}

/* One writing page for every day. Today starts empty; a day from Look back opens on the same page,
   already laid out, and you can keep talking into it. Look back and settings slide over it. */
export default function App() {
  const [fontsLoaded] = useFonts({
    'NotoSerifSC-400': require('./assets/fonts/NotoSerifSC-400Regular.ttf'),
    'NotoSerifSC-500': require('./assets/fonts/NotoSerifSC-500Medium.ttf'),
    Newsreader_300Light, Newsreader_400Regular, Newsreader_400Regular_Italic,
  });
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>('auto');
  const [lang, setLangState] = useState<Lang>('zh');
  const [grammar, setGrammarState] = useState(true);   // "Fix grammar": on unless the person turns it off
  const [voice, setVoiceState] = useState(true);       // voice bars at the top left of what was said
  const [indent, setIndentState] = useState(false);    // first-line indent on the page
  const [pane, setPane] = useState<Pane>(null);
  const [today, setToday] = useState(() => dayKey());
  const [days, setDays] = useState<Record<string, Day>>(() => ({ [today]: { ...EMPTY, photos: SEED } }));
  const [curKey, setCur] = useState(today);          // a date, 'week' for this week, or 'e<n>' for a sample entry from Look back
  /* a day inside a page written over several days opens that page */
  const links = spanLinks(days);
  const cur = links[curKey] ?? curKey;
  const [ranging, setRanging] = useState(false);      // choosing days to write as one page
  const [mine, setMine] = useState<string[]>([]);      // stickers made from photos
  const [slap, setSlap] = useState('');                // the sticker just put on the page
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(false);       // choosing which day the page belongs to
  const [ready, setReady] = useState(false);
  const saved = useRef<Record<string, Day>>({});
  const [making, setMaking] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const closeNotice = useCallback(() => setNotice(null), []);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const S = STR[lang];
  const live = useLive((code) => setNotice({ text: `${S.liveStopped} (${code})` }));
  const via = useRef<'live' | 'audio'>('audio');      // which one is recording: Apple's recogniser, or expo-audio

  useEffect(() => {
    AsyncStorage.multiGet(['qd-mode', 'qd-lang', 'qd-grammar', 'qd-voice', 'qd-indent']).then((kv) => {
      if (kv[4][1] === '1') setIndentState(true);
      if (kv[2][1] === '0') setGrammarState(false);
      if (kv[3][1] === '0') setVoiceState(false);
      const m = kv[0][1]; if (m === 'light' || m === 'dark' || m === 'auto') setModeState(m);
      const l = kv[1][1]; if (l === 'zh' || l === 'en') setLangState(l);
    }).catch(() => {});
  }, []);
  const setMode = (m: Mode) => { setModeState(m); AsyncStorage.setItem('qd-mode', m).catch(() => {}); };
  const setLang = (l: Lang) => { setLangState(l); AsyncStorage.setItem('qd-lang', l).catch(() => {}); };
  const setGrammar = (g: boolean) => { setGrammarState(g); AsyncStorage.setItem('qd-grammar', g ? '1' : '0').catch(() => {}); };
  const setVoice = (v: boolean) => { setVoiceState(v); AsyncStorage.setItem('qd-voice', v ? '1' : '0').catch(() => {}); };
  const setIndent = (v: boolean) => { setIndentState(v); AsyncStorage.setItem('qd-indent', v ? '1' : '0').catch(() => {}); };

  /* the days kept on the phone; the page waits for them, so nothing written first gets overwritten */
  useEffect(() => { loadMine().then(setMine); }, []);
  useEffect(() => {
    let live = true;
    loadDays().catch(() => ({} as Record<string, Day>)).then((m) => {
      if (!live) return;
      saved.current = m;
      setDays((c) => ({ ...c, ...m }));
      setReady(true);
    });
    return () => { live = false; };
  }, []);
  /* a day is saved a moment after it changes; the sample entries from Look back never are */
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => {
      for (const [k, d] of Object.entries(days)) {
        if (!(isDayKey(k) || isSpanKey(k)) || saved.current[k] === d) continue;
        if (!saved.current[k] && !d.photos.length && !d.said.length) continue;   // a blank day that was never saved
        saved.current[k] = d;
        saveDay(k, d).catch(() => {});
      }
    }, 300);
    return () => clearTimeout(id);
  }, [days, ready]);

  const { isUpdatePending } = Updates.useUpdates();
  const [opened] = useState(() => Date.now());
  useEffect(() => {
    if (isUpdatePending && Updates.isEnabled && Date.now() - opened < 20000) Updates.reloadAsync().catch(() => {});
  }, [isUpdatePending, opened]);

  /* a new day starts at midnight: the page turns to the new, empty day. While a recording is going it waits, and
     once the recording ends asks whether to keep writing yesterday or start the new day (most will keep writing) */
  const busy = useRef(false);
  const roll = useRef<string | null>(null);
  useEffect(() => {
    const check = () => {
      const now = dayKey();
      if (now === today) return;
      setToday(now);
      if (busy.current) { roll.current = now; return; }
      setCur((c) => (c === today || isSpanKey(c) ? now : c));
    };
    const id = setInterval(check, 20000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [today]);
  function askRoll() {
    const to = roll.current;
    if (!to) return;
    roll.current = null;
    Alert.alert(S.midnightAsk, S.midnightBody, [
      { text: S.newDay, onPress: () => setCur(to) },
      { text: S.keepDay, style: 'cancel', isPreferred: true },
    ]);
  }

  const day = days[cur] ?? EMPTY;
  const update = (key: string, f: (d: Day) => Day) => setDays((m) => ({ ...m, [key]: f(m[key] ?? EMPTY) }));
  /* Undo: each day keeps how its page was before the last ten lay outs, joined paragraphs and edits, while the app is open.
     Going back restores the laid-out page; anything said since then and not laid out yet stays */
  const [past, setPast] = useState<Record<string, Day[]>>({});
  const remember = (key: string, d: Day) => setPast((m) => ({ ...m, [key]: [...(m[key] ?? []).slice(-9), d] }));
  function undo() {
    const key = cur, stack = past[key], snap = stack?.[stack.length - 1];
    if (!snap) return;
    setPast((m) => ({ ...m, [key]: stack.slice(0, -1) }));
    update(key, (d) => ({ ...d, said: [...snap.said.slice(0, snap.laid), ...d.said.slice(d.laid)], laid: snap.laid, placed: snap.placed, moved: snap.moved }));
    Haptics.selectionAsync().catch(() => {});
  }

  /* a long press on a paragraph joins it to the one above: the words run on, its recordings play after that paragraph's,
     and a time heading between the two goes */
  function mergeUp(item: number) {
    const d = day, x = d.said[item];
    let j = item - 1;
    while (j >= 0 && d.said[j].kind === 'head') j--;
    const prev = d.said[j];
    if (!x || x.kind === 'head' || !prev || prev.kind === 'head' || item >= d.laid) return;
    const more = [...(prev.more ?? []), ...(x.audio ? [{ audio: x.audio, at: x.at, secs: x.secs }] : []), ...(x.more ?? [])];
    const g = !!(prev.g && x.g);
    const joined: Said = prev.kind === 'talk' && x.kind === 'talk' ? { ...prev, text: join([prev.text, x.text]), more, g }
      : prev.kind === 'photos' && x.kind === 'talk' ? { ...prev, more, g, parts: prev.parts.map((p, k) => (k === prev.parts.length - 1 ? { ...p, text: join([p.text, x.text]), spoken: undefined } : p)) }
      : prev.kind === 'talk' && x.kind === 'photos' ? { ...x, audio: prev.audio, at: prev.at, secs: prev.secs, more, g, parts: x.parts.map((p, k) => (k === 0 ? { ...p, text: join([prev.text, p.text]), spoken: undefined } : p)) }
      : prev.kind === 'photos' && x.kind === 'photos' ? { ...prev, more, g, parts: [...prev.parts, ...x.parts] } : prev;
    const gone = item - j;
    /* photos beside paragraphs are kept by item and part; those after the join move up */
    const shift = prev.kind === 'photos' && x.kind === 'photos' ? prev.parts.length : 0;
    const re = (k: string) => {
      const m = /^(\d+)-(\d+)$/.exec(k);
      if (!m) return k;
      const i = +m[1], p = +m[2];
      return i === item ? `${j}-${p + shift}` : i > item ? `${i - gone}-${p}` : k;
    };
    remember(cur, d);
    update(cur, () => ({
      ...d, said: [...d.said.slice(0, j), joined, ...d.said.slice(item + 1)], laid: d.laid - gone,
      moved: d.moved && Object.fromEntries(Object.entries(d.moved).map(([k, v]) => [re(k), v])),
    }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
  const settings = { label: S.openSettings, run: () => { Linking.openSettings().catch(() => {}); } };

  /* open an entry from Look back on the writing page; the sample entries become a laid-out page the first time */
  function openEntry(i: number) {
    const key = 'e' + i, e = S.entries[i];
    if (e && !days[key]) {
      const said: Said[] = [{ kind: 'talk', text: e.s }, { kind: 'photos', parts: e.p.map((k, j) => ({ unit: { idx: [j] }, text: S.pline[k] ?? '' })) }];
      setDays((m) => ({ ...m, [key]: { photos: e.p.map((k) => ({ asset: PHOTO[k] })), groups: [], said, laid: said.length } }));
      tipDrag({ photos: [], groups: [], said, laid: said.length }, said.length);
    }
    setCur(e?.today ? today : key);
    setPane(null);
  }

  async function pick() {
    const key = cur;
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, orderedSelection: true, selectionLimit: 60, quality: 0.7 });
      if (r.canceled || !r.assets.length) return;
      const kept = await Promise.all(r.assets.map((a) => keepPhoto(a.uri)));
      update(key, (d) => ({ ...d, photos: [...d.photos, ...kept] }));
      grow(key);
      Haptics.selectionAsync().catch(() => {});
    } catch { /* picker unavailable */ }
  }
  async function shoot() {
    const key = cur;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setNotice({ text: S.cameraDenied, action: settings }); return; }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (r.canceled || !r.assets.length) return;
      const kept = await keepPhoto(r.assets[0].uri);
      update(key, (d) => ({ ...d, photos: [...d.photos, kept] }));
      grow(key);
    } catch { /* no camera, e.g. the simulator */ }
  }
  /* the camera key: a photo, or a page written on paper (taken now, or chosen from the library) */
  async function camera() {
    const c = await ask([S.shootPhoto, S.shootPaper, S.pickPaper]);
    if (c === 0) shoot(); else if (c > 0) paper(c === 1);
  }
  /* one photo from the camera or the library */
  async function one(cam: boolean) {
    try {
      if (cam) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { setNotice({ text: S.cameraDenied, action: settings }); return null; }
      }
      const r = cam ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      return r.canceled || !r.assets.length ? null : r.assets[0];
    } catch { return null; }
  }
  /* A page written on paper joins the day as it is: the photo of the page, and (if the person wants) the words read
     from it, word for word, as the paragraph beside it; a page of several paragraphs carries on below. It goes straight
     onto the laid-out page, and the words are never "fixed": they are the writer's own. */
  async function paper(cam: boolean) {
    const key = cur;
    const a = await one(cam);
    if (!a) return;
    const c = await ask([S.readYes, S.readNo], S.readAsk);
    if (c < 0) return;
    const kept = { ...(await keepPhoto(a.uri)), ...(a.width && a.height ? { r: a.height / a.width } : {}) };
    let text = '';
    if (c === 0) {
      setNotice({ text: S.reading });
      try { text = await readPage(a.uri); setNotice(null); } catch { setNotice({ text: S.readFailed }); }
    }
    const [lead = '', ...rest] = text.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    const at = Date.now();
    update(key, (d) => {
      const n = d.photos.length;
      const items: Said[] = [{ kind: 'photos', paper: true, parts: [{ unit: { idx: [n] }, text: lead }], g: true, at },
        ...rest.map((t): Said => ({ kind: 'talk', text: t, g: true, at }))];
      return { ...d, photos: [...d.photos, kept], said: [...d.said.slice(0, d.laid), ...items, ...d.said.slice(d.laid)], laid: d.laid + items.length };
    });
    grow(key);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  /* Stickers: one from the set or made from a photo goes onto the page where the person is looking; it can be moved,
     turned, resized and peeled off. One made from a photo is cut out on the phone (iOS's own subject lifting). */
  function addSticker(sk: string, at: { x: number; y: number; w: number; r: number }) {
    const id = 's' + Date.now().toString(36);
    update(cur, (d) => ({ ...d, stickers: [...(d.stickers ?? []), { id, s: sk, p: -1, ...at, wrap: true }] }));
    setSlap(id);
  }
  function moveSticker(id: string, at: Partial<Sticker> | null) {
    update(cur, (d) => ({ ...d, stickers: at ? (d.stickers ?? []).map((st) => (st.id === id ? { ...st, ...at } : st)) : (d.stickers ?? []).filter((st) => st.id !== id) }));
  }
  /* the full-screen photo: delete it, set marks into it (the photo as it was is kept), go back to it, or keep a cut-out */
  const onPhoto = {
    del: (i: number) => { setPast((m) => ({ ...m, [cur]: [] })); update(cur, (d) => removePhotos(d, [i])); },
    save: async (i: number, uri: string, r: number) => {
      const kept = await keepPhoto(uri);
      update(cur, (d) => ({ ...d, photos: d.photos.map((p, k) => (k === i ? { ...kept, r, orig: p.orig ?? { uri: p.uri, asset: p.asset, file: p.file, r: p.r } } : p)) }));
    },
    restore: (i: number) => update(cur, (d) => ({ ...d, photos: d.photos.map((p, k) => (k === i && p.orig ? { ...p.orig } : p)) })),
    lifted: (file: string) => {
      const rel = relative(file);
      setMine((m) => { const next = [rel, ...m]; saveMine(next); return next; });
      return 'file:' + rel;
    },
  };
  async function makeSticker(): Promise<string | null> {
    if (!LoreVision) { setNotice({ text: S.liftNeedsApp }); return null; }
    const c = await ask([S.shootPhoto, S.library]);
    if (c < 0) return null;
    const a = await one(c === 0);
    if (!a) return null;
    setNotice({ text: S.lifting });
    try {
      const made = await LoreVision.lift(a.uri);
      if (!made) { setNotice({ text: S.liftNone }); return null; }
      setNotice(null);
      const rel = relative(made);
      setMine((m) => { const next = [rel, ...m]; saveMine(next); return next; });
      return 'file:' + rel;
    } catch { setNotice({ text: S.liftNone }); return null; }
  }

  /* the first page with photos tells the person, once, that photos can be dragged (until the tutorial is designed) */
  function tipDrag(d: Day, laid: number) {
    if (!d.said.slice(0, laid).some((x) => x.kind === 'photos' && x.parts.some((p) => p.unit.idx.length))) return;
    AsyncStorage.getItem('qd-tip-drag').then((v) => {
      if (v) return;
      setNotice({ text: S.dragHint });
      AsyncStorage.setItem('qd-tip-drag', '1').catch(() => {});
    }).catch(() => {});
  }

  /* the page belongs to another day: everything on it moves there, after what that day already has. Photo numbers,
     groups, placed photos and where photos were dragged all move along; this day is left empty */
  function moveDay(from: string, to: string) {
    if (from === to) return;
    setDays((all) => ({ ...all, [from]: { ...EMPTY }, [to]: append(all[to] ?? EMPTY, all[from] ?? EMPTY) }));
    setCur(to);
  }

  /* Several days as one page (a trip, a long weekend): the days from first to last, with what is already written on
     them in order, each day starting under its date. A page over several days that overlaps is taken in whole. */
  function combine(from: string, to: string) {
    setRanging(false);
    let lo = from, hi = to;
    for (const [k, d] of Object.entries(days)) if (isSpanKey(k) && d.span && d.span.from <= hi && d.span.to >= lo && (d.said.length || d.photos.length)) {
      if (d.span.from < lo) lo = d.span.from;
      if (d.span.to > hi) hi = d.span.to;
    }
    const key = 'r-' + lo;
    setDays((all) => {
      const next = { ...all };
      let page: Day = { ...EMPTY };
      for (let x = lo; x <= hi; x = shift(x, 1)) {
        const sp = all['r-' + x];
        if (sp?.span && (sp.said.length || sp.photos.length)) { page = append(page, sp); next['r-' + x] = { ...EMPTY }; x = sp.span.to; continue; }
        const d = all[x];
        if (!d || (!d.said.length && !d.photos.length)) continue;
        const dt = dateTitle(x, lang);
        page = append(page, { ...d, said: [{ kind: 'head', text: `${dt.title} · ${dt.meta}`, day: x }, ...d.said], laid: d.laid + 1 });
        next[x] = { ...EMPTY };
      }
      next[key] = { ...page, laid: page.said.length, span: { from: lo, to: hi } };
      return next;
    });
    setCur(hi);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
  /* back to separate days: each item goes to the day it was said (or, without a time, the day it was written under);
     photos not on the page, placed photos and stickers go to the first day */
  function split(key: string) {
    const d = days[key];
    if (!d?.span) return;
    const { from, to } = d.span;
    const clamp = (k: string) => (k < from ? from : k > to ? to : k);
    let under = from;
    const owner = d.said.map((x) => {
      if (x.kind === 'head') { if (x.day) under = x.day; return ''; }
      return x.at ? clamp(dayKey(new Date(x.at))) : under;
    });
    /* a time heading goes with what follows it */
    for (let i = owner.length - 1; i >= 0; i--) if (!owner[i] && !(d.said[i].kind === 'head' && (d.said[i] as { day?: string }).day)) owner[i] = owner[i + 1] ?? under;
    const targets = [...new Set(owner.filter(Boolean))];
    if (!targets.length) targets.push(from);
    const first = targets[0];
    const used = new Set<number>();
    const built: Record<string, Day> = {};
    for (const tk of targets) {
      const idx = d.said.map((_, i) => i).filter((i) => owner[i] === tk);
      const map = new Map<number, number>();
      const photos: Day['photos'] = [];
      const take = (i: number) => { if (!map.has(i)) { map.set(i, photos.length); photos.push(d.photos[i]); used.add(i); } return map.get(i)!; };
      const said = idx.map((i): Said => { const x = d.said[i]; return x.kind === 'photos' ? { ...x, parts: x.parts.map((p) => ({ ...p, unit: { idx: p.unit.idx.map(take) } })) } : x; });
      const pos = new Map(idx.map((i, n) => [i, n]));
      const moved = Object.fromEntries(Object.entries(d.moved ?? {}).flatMap(([k, v]) => {
        const m = /^(\d+)-(\d+)$/.exec(k);
        return m && pos.has(+m[1]) ? [[`${pos.get(+m[1])}-${m[2]}`, v]] : [];
      }));
      built[tk] = { ...EMPTY, photos, said, laid: idx.filter((i) => i < d.laid).length, moved };
    }
    /* the rest goes to the first day */
    const f = built[first], map = new Map<number, number>();
    d.photos.forEach((p, i) => { if (!used.has(i)) { map.set(i, f.photos.length); f.photos.push(p); } });
    f.placed = (d.placed ?? []).map((p) => ({ ...p, idx: p.idx.filter((i) => map.has(i)).map((i) => map.get(i)!) })).filter((p) => p.idx.length);
    f.moved = { ...f.moved, ...Object.fromEntries(Object.entries(d.moved ?? {}).filter(([k]) => k.startsWith('p'))) };
    f.groups = d.groups.filter((g) => g.every((i) => map.has(i))).map((g) => g.map((i) => map.get(i)!));
    f.stickers = d.stickers;
    setDays((all) => {
      const next = { ...all, [key]: { ...EMPTY } };
      for (const tk of targets) next[tk] = append(all[tk] ?? EMPTY, built[tk]);
      return next;
    });
    setCur(first);
  }
  /* writing on a page over several days after its last day: the page now runs to today, unless today has its own page */
  function grow(key: string) {
    if (!isSpanKey(key)) return;
    const own = days[today];
    if (own && (own.said.length || own.photos.length)) return;
    update(key, (d) => (d.span && d.span.to < today ? { ...d, span: { ...d.span, to: today } } : d));
  }

  /* a choice from a short list: the action sheet on the phone (-1 when cancelled); the web preview takes the first */
  function ask(options: string[], title?: string): Promise<number> {
    return new Promise((res) => {
      if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: [...options, S.cancel], cancelButtonIndex: options.length, title }, (b) => res(b < options.length ? b : -1));
      else if (Platform.OS === 'web') res(0);
      else Alert.alert(title ?? '', '', [...options.map((o, i) => ({ text: o, onPress: () => res(i) })), { text: S.cancel, style: 'cancel' as const, onPress: () => res(-1) }]);
    });
  }

  /* an edited recording, or an edited caption of one photo; emptied words stay as an empty entry, so nothing else moves */
  function editText(item: number, part: number, text: string) {
    remember(cur, day);
    update(cur, (d) => ({
      ...d,
      said: d.said.map((x, i) => (i !== item || x.kind === 'head' ? x : x.kind === 'talk' ? { ...x, text, g: true }
        : { ...x, g: true, parts: x.parts.map((p, j) => (j === part ? { ...p, text, spoken: undefined } : p)) })),
    }));
  }

  /* laying out is a step the person chooses, and a laid-out day can be laid out again. It takes everything said so far:
     words that haven't had the grammar fix get it once (when "Fix grammar" is on), then every recording that is still
     plain text is matched to photos again, so older words also pick up the photo numbers found mid-sentence */
  async function layout() {
    const key = cur, d0 = day, count = d0.photos.length;
    setMaking(true);
    const wait = new Promise((r) => setTimeout(r, 2000));
    const fixOne = (t: string) => (t.trim() ? fixText(t, true).catch(() => t) : Promise.resolve(t));
    const said0 = d0.said.filter((x) => x.kind !== 'head' || !!x.day);   // time headings are found again each time; a day's heading stays
    const items: Said[] = agentOn && grammar
      ? await Promise.all(said0.map(async (x): Promise<Said> => (x.kind === 'head' || x.g ? x : x.kind === 'talk'
        ? { ...x, text: await fixOne(x.text), g: true }
        : { ...x, parts: await Promise.all(x.parts.map(async (p) => ({ ...p, text: await fixOne(p.text) }))), g: true })))
      : said0;
    /* a recording that names photos by number ("一号是…", "the picture one is…") is split into a part per photo, in code;
       a photo that already has its words keeps them, and a second mention stays plain text */
    const taken = new Set(items.flatMap((x) => (x.kind === 'photos' ? x.parts.flatMap((p) => p.unit.idx) : [])));
    const matched = items.flatMap((x): Said[] => {
      if (x.kind !== 'talk' || !count) return [x];
      const m = match(x.text, count);
      if (!m.parts.length) return [x];
      const parts = m.parts.map((p) => ({ ...p, unit: { idx: p.unit.idx.filter((i) => !taken.has(i)) } }));
      parts.forEach((p) => p.unit.idx.forEach((i) => taken.add(i)));
      return [...(m.before ? [{ kind: 'talk' as const, text: m.before, g: x.g, audio: x.audio, at: x.at, secs: x.secs }] : []),
        { kind: 'photos' as const, parts, g: x.g, ...(m.before ? {} : { audio: x.audio, at: x.at, secs: x.secs }) }];
    });
    /* the time-heading node: the day's sentences go out numbered, and each one that starts a new time of day
       ("下午", "after lunch") gets a heading above it; a recording that crosses one is split there */
    const sents = matched.map((x) => (x.kind === 'talk' ? sentences(x.text) : x.kind === 'photos' ? sentences(x.parts[0]?.text ?? '').slice(0, 1) : []));
    const flat = sents.flatMap((ss, i) => ss.map((s, j) => ({ i, j, s })));
    const offline = () => ({ sections: timeRules(flat.map((f) => f.s)), breaks: [] as number[] });
    const { sections: found, breaks } = agentOn ? await sectionsOf(flat.map((f) => f.s)).catch(offline) : offline();
    const headed = matched.flatMap((x, i): Said[] => {
      const hs = found.filter((h) => flat[h.sentence]?.i === i).map((h) => ({ j: flat[h.sentence].j, text: h.heading }));
      if (!hs.length) return [x];
      if (x.kind !== 'talk') return [{ kind: 'head', text: hs[0].text }, x];
      const cuts = [...new Set([0, ...hs.map((h) => h.j)])].sort((a, b) => a - b);
      const whole = x.text.length;
      return cuts.flatMap((c, k): Said[] => {
        const text = join(sents[i].slice(c, cuts[k + 1] ?? sents[i].length)), h = hs.find((hh) => hh.j === c);
        /* a later piece of a recording gets the time its words were said, estimated from where they sit in it */
        const before = join(sents[i].slice(0, c)).length;
        const at = x.at && x.secs ? Math.round(x.at + (x.secs * 1000 * before) / whole) : x.at;
        const part: Said = k === 0 ? { ...x, text } : { kind: 'talk', text, g: x.g, at };
        return h ? [{ kind: 'head', text: h.text }, part] : [part];
      });
    });
    /* then the paragraph rules (src/paragraphs.ts): long ones are cut, short ones join their neighbours */
    const said = shape(headed, new Set(breaks.map((n) => flat[n]?.s).filter(Boolean)));
    await wait;
    const n = said.length;
    /* a photo now talked about leaves the spot it was dropped on and goes beside its words; where photos beside
       paragraphs were dragged to is forgotten, since the paragraphs may have changed */
    remember(key, d0);
    update(key, (d) => ({
      ...d, said, laid: n,
      placed: d.placed?.filter((p) => !p.idx.some((i) => taken.has(i))),
      moved: Object.fromEntries(Object.entries(d.moved ?? {}).filter(([k]) => k.startsWith('p'))),
    }));
    tipDrag({ ...d0, said }, n);
    setMaking(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  /* the microphone: on the phone its recording goes to Lore's backend; the web preview shows a demo transcript.
     In the installed app, Apple's recogniser records and shows the words live; in Expo Go, expo-audio records. */
  const rec = {
    start: async () => {
      if (live.on && await live.start(lang)) { via.current = 'live'; busy.current = true; return true; }
      via.current = 'audio';
      try {
        const p = await requestRecordingPermissionsAsync();
        if (!p.granted) { setNotice({ text: S.micDenied, action: settings }); return false; }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        busy.current = true;
      } catch { /* the demo still runs without a mic */ }
      return true;
    },
    /* both hand back the recorded file, so it can be sent, or brought back with Undo */
    stop: async () => {
      let uri: string | null = null;
      if (via.current === 'live') uri = await live.stop();
      else try { if (recorder.isRecording) { await recorder.stop(); uri = recorder.uri; await setAudioModeAsync({ allowsRecording: false }); } } catch { /* ignore */ }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      busy.current = false;
      setTimeout(askRoll, 400);
      return uri;
    },
    cancel: async () => {
      busy.current = false;
      setTimeout(askRoll, 400);
      if (via.current === 'live') return live.stop();
      let uri: string | null = null;
      try { if (recorder.isRecording) { await recorder.stop(); uri = recorder.uri; await setAudioModeAsync({ allowsRecording: false }); } } catch { /* ignore */ }
      return uri;
    },
  };

  const isDark = mode === 'auto' ? system === 'dark' : mode === 'dark';
  const t = isDark ? darkT : lightT;
  const h = new Date().getHours();
  const entry = isDayKey(cur) || isSpanKey(cur) || cur === 'week' ? null : S.entries[Number(cur.slice(1))];
  /* the title says which day this is, and opens the menu of days: today, yesterday, the day before and this week */
  const yest = shift(today, -1), before = shift(today, -2);
  /* a page over several days is named by its first and last day ("10月18日 – 20日") */
  const spanName = (k: string) => {
    const sp = days[k]?.span;
    if (!sp) return '';
    const a = dateTitle(sp.from, lang).title, b = dateTitle(sp.to, lang).title;
    const same = sp.from.slice(0, 7) === sp.to.slice(0, 7);
    return S.spanTitle(a, same ? (lang === 'zh' ? `${Number(sp.to.slice(8))}日` : String(Number(sp.to.slice(8)))) : b);
  };
  const spanDays = (k: string) => { const sp = days[k]?.span; return sp ? Math.round((Date.parse(sp.to) - Date.parse(sp.from)) / 86400000) + 1 : 0; };
  const nameOf = (k: string) => (isSpanKey(k) ? spanName(k) : k === 'week' ? S.navWeek : k === today ? S.navToday : k === yest ? S.navYesterday : k === before ? S.navBefore : dateTitle(k, lang).title);
  const has = (k: string) => { const d = days[links[k] ?? k]; return !!d && (d.said.length > 0 || d.photos.length > 0); };
  const [ty, tm, td] = today.split('-').map(Number);
  const monday = shift(today, -((new Date(ty, tm - 1, td).getDay() + 6) % 7));
  const weekKeys: string[] = [];
  for (let k = monday; k <= today; k = shift(k, 1)) if (!weekKeys.includes(links[k] ?? k)) weekKeys.push(links[k] ?? k);
  const menuOpts = [...[today, yest, before].map((k) => ({ key: k, label: nameOf(k), date: links[k] ? spanName(links[k]) : dateTitle(k, lang).title, has: has(k) })),
    { key: 'week', label: S.navWeek, date: S.weekLabel, has: weekKeys.some(has) },
    { key: 'combine', label: S.combine, date: '', has: false },
    ...(isSpanKey(cur) ? [{ key: 'split', label: S.split, date: '', has: false }] : [])];
  const dated = isSpanKey(cur) ? { title: spanName(cur), meta: S.nDays(spanDays(cur)) } : dateTitle(isDayKey(cur) ? cur : today, lang);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <LangCtx.Provider value={lang}>
        <ThemeCtx.Provider value={t}>
          <View style={[styles.root, { backgroundColor: t.b }]}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <DotField />
            {fontsLoaded && ready && (
              <>
                {cur === 'week' ? (
                  <Week days={days} keys={weekKeys} title={S.navWeek} voice={voice} indent={indent} onTitle={() => setMenu(true)} onOpen={setPane} onDay={setCur}
                    labelOf={(k) => (isSpanKey(k) ? spanName(k) : `${dateTitle(k, lang).meta} · ${dateTitle(k, lang).title}`)} />
                ) : (
                <Home day={cur} hidden={pane !== null} night={h >= 18 || h < 5}
                  past={!!entry} title={entry ? entry.when : nameOf(cur)} onTitle={entry ? undefined : () => setMenu(true)} onDate={entry || isSpanKey(cur) ? undefined : () => setPicking(true)} onToday={() => setCur(today)}
                  pageTitle={entry ? entry.t : dated.title} pageMeta={entry ? '' : dated.meta}
                  photos={day.photos} groups={day.groups} setGroups={(g) => update(cur, (d) => ({ ...d, groups: g }))}
                  onRemove={(idx) => { setPast((m) => ({ ...m, [cur]: [] })); update(cur, (d) => removePhotos(d, idx)); }}
                  said={day.said} laid={day.laid} making={making} live={live.text} grammar={grammar} voice={voice} indent={indent} onCamera={camera} onPick={pick} onOpen={setPane} onRecord={rec}
                  onSaved={(x) => { update(cur, (d) => ({ ...d, said: [...d.said, x] })); grow(cur); }} onLayout={layout} onUndo={past[cur]?.length ? undo : undefined} onMerge={mergeUp} onNotice={setNotice}
                  placed={day.placed} moved={day.moved} onText={editText}
                  onPlace={(idx, at) => { const id = 'p' + Date.now().toString(36); update(cur, (d) => ({ ...d, placed: [...(d.placed ?? []), { id, idx }], moved: { ...d.moved, [id]: at } })); }}
                  onMove={(key, at) => update(cur, (d) => ({ ...d, moved: { ...d.moved, [key]: at } }))}
                  stickers={day.stickers} slap={slap} mine={mine} onAddSticker={addSticker} onSticker={moveSticker} onMakeSticker={makeSticker} onPhoto={onPhoto} />
                )}
                {menu ? <DayMenu opts={menuOpts} cur={curKey === cur ? cur : curKey} onClose={() => setMenu(false)}
                  onPick={(k) => { setMenu(false); if (k === 'combine') setRanging(true); else if (k === 'split') split(cur); else setCur(k); }} /> : null}
                {ranging ? <RangePicker today={today} has={has} onClose={() => setRanging(false)} onPick={combine} /> : null}
                {picking ? (
                  <DayMenu heading={S.whichDay} cur={cur} onClose={() => setPicking(false)} onPick={(k) => { setPicking(false); moveDay(cur, k); }}
                    opts={Array.from({ length: 14 }, (_, i) => shift(today, -i)).map((k) => ({ key: k, label: `${dateTitle(k, lang).title}  ${dateTitle(k, lang).meta}`, date: k === today ? S.navToday : k === yest ? S.navYesterday : '', has: has(k) }))} />
                ) : null}
                <Archive open={pane === 'archive'} onClose={() => setPane(null)} onEntry={openEntry} onInsights={() => setPane('insights')} />
                <Insights open={pane === 'insights'} onClose={() => setPane('archive')} />
                <Settings open={pane === 'settings'} onClose={() => setPane(null)} mode={mode} setMode={setMode} lang={lang} setLang={setLang} grammar={grammar} setGrammar={setGrammar} voice={voice} setVoice={setVoice} indent={indent} setIndent={setIndent} />
                <Toast notice={notice} onClose={closeNotice} />
              </>
            )}
          </View>
        </ThemeCtx.Provider>
      </LangCtx.Provider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
