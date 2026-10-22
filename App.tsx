import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Updates from 'expo-updates';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Newsreader_300Light, Newsreader_400Regular, Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader';
import { Lang, STR } from './src/data';
import { PHOTO } from './src/images';
import { Day, removePhotos, Said } from './src/session';
import { match } from './src/match';
import { agentOn, fixText } from './src/agent';
import { dayKey, isDayKey, keepPhoto, loadDays, saveDay } from './src/store';
import { useLive } from './src/live';
import { dark as darkT, light as lightT } from './src/theme';
import { DotField, LangCtx, Notice, ThemeCtx, Toast } from './src/ui';
import { Home } from './src/Home';
import { Archive, Insights, Settings } from './src/Screens';

type Mode = 'light' | 'dark' | 'auto';
type Pane = null | 'archive' | 'insights' | 'settings';
const EMPTY: Day = { photos: [], groups: [], said: [], laid: 0 };
/* web only: ?seed=photos starts today with six sample photos, so the photo flow can be shown without a photo library */
const SEED = Platform.OS === 'web' && typeof location !== 'undefined' && location.search.includes('seed=photos')
  ? ['cafe', 'latte', 'sunset', 'osmanthus', 'noodles', 'hotpot'].map((k) => ({ asset: PHOTO[k] })) : [];

/* a day's page is titled by its date until it has a title of its own; the weekday goes underneath */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function dateTitle(key: string, lang: Lang) {
  const [y, m, d] = key.split('-').map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return lang === 'zh' ? { title: `${m}月${d}日`, meta: `周${'日一二三四五六'[w]}` } : { title: `${MONTHS[m - 1]} ${d}`, meta: DAYS[w] };
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
  const [pane, setPane] = useState<Pane>(null);
  const [today] = useState(() => dayKey());
  const [days, setDays] = useState<Record<string, Day>>(() => ({ [today]: { ...EMPTY, photos: SEED } }));
  const [cur, setCur] = useState(today);             // a date, or 'e<n>' for a sample entry from Look back
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
    AsyncStorage.multiGet(['qd-mode', 'qd-lang', 'qd-grammar']).then((kv) => {
      if (kv[2][1] === '0') setGrammarState(false);
      const m = kv[0][1]; if (m === 'light' || m === 'dark' || m === 'auto') setModeState(m);
      const l = kv[1][1]; if (l === 'zh' || l === 'en') setLangState(l);
    }).catch(() => {});
  }, []);
  const setMode = (m: Mode) => { setModeState(m); AsyncStorage.setItem('qd-mode', m).catch(() => {}); };
  const setLang = (l: Lang) => { setLangState(l); AsyncStorage.setItem('qd-lang', l).catch(() => {}); };
  const setGrammar = (g: boolean) => { setGrammarState(g); AsyncStorage.setItem('qd-grammar', g ? '1' : '0').catch(() => {}); };

  /* the days kept on the phone; the page waits for them, so nothing written first gets overwritten */
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
        if (!isDayKey(k) || saved.current[k] === d) continue;
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

  const day = days[cur] ?? EMPTY;
  const update = (key: string, f: (d: Day) => Day) => setDays((m) => ({ ...m, [key]: f(m[key] ?? EMPTY) }));
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
    } catch { /* no camera, e.g. the simulator */ }
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

  /* an edited recording, or an edited caption of one photo; emptied words stay as an empty entry, so nothing else moves */
  function editText(item: number, part: number, text: string) {
    update(cur, (d) => ({
      ...d,
      said: d.said.map((x, i) => (i !== item ? x : x.kind === 'talk' ? { ...x, text, g: true }
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
    const items: Said[] = agentOn && grammar
      ? await Promise.all(d0.said.map(async (x): Promise<Said> => (x.g ? x : x.kind === 'talk'
        ? { ...x, text: await fixOne(x.text), g: true }
        : { ...x, parts: await Promise.all(x.parts.map(async (p) => ({ ...p, text: await fixOne(p.text) }))), g: true })))
      : d0.said;
    /* a recording that names photos by number ("一号是…", "the picture one is…") is split into a part per photo, in code;
       a photo that already has its words keeps them, and a second mention stays plain text */
    const taken = new Set(items.flatMap((x) => (x.kind === 'photos' ? x.parts.flatMap((p) => p.unit.idx) : [])));
    const said = items.flatMap((x): Said[] => {
      if (x.kind !== 'talk' || !count) return [x];
      const m = match(x.text, count);
      if (!m.parts.length) return [x];
      const parts = m.parts.map((p) => ({ ...p, unit: { idx: p.unit.idx.filter((i) => !taken.has(i)) } }));
      parts.forEach((p) => p.unit.idx.forEach((i) => taken.add(i)));
      return [...(m.before ? [{ kind: 'talk' as const, text: m.before, g: x.g }] : []), { kind: 'photos' as const, parts, audio: x.audio, g: x.g }];
    });
    await wait;
    const n = said.length;
    /* a photo now talked about leaves the spot it was dropped on and goes beside its words; where photos beside
       paragraphs were dragged to is forgotten, since the paragraphs may have changed */
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
      if (live.on && await live.start(lang)) { via.current = 'live'; return true; }
      via.current = 'audio';
      try {
        const p = await requestRecordingPermissionsAsync();
        if (!p.granted) { setNotice({ text: S.micDenied, action: settings }); return false; }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch { /* the demo still runs without a mic */ }
      return true;
    },
    /* both hand back the recorded file, so it can be sent, or brought back with Undo */
    stop: async () => {
      let uri: string | null = null;
      if (via.current === 'live') uri = await live.stop();
      else try { if (recorder.isRecording) { await recorder.stop(); uri = recorder.uri; await setAudioModeAsync({ allowsRecording: false }); } } catch { /* ignore */ }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return uri;
    },
    cancel: async () => {
      if (via.current === 'live') return live.stop();
      let uri: string | null = null;
      try { if (recorder.isRecording) { await recorder.stop(); uri = recorder.uri; await setAudioModeAsync({ allowsRecording: false }); } } catch { /* ignore */ }
      return uri;
    },
  };

  const isDark = mode === 'auto' ? system === 'dark' : mode === 'dark';
  const t = isDark ? darkT : lightT;
  const h = new Date().getHours();
  const entry = isDayKey(cur) ? null : S.entries[Number(cur.slice(1))];
  const dated = dateTitle(isDayKey(cur) ? cur : today, lang);

  return (
    <SafeAreaProvider>
      <LangCtx.Provider value={lang}>
        <ThemeCtx.Provider value={t}>
          <View style={[styles.root, { backgroundColor: t.b }]}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <DotField />
            {fontsLoaded && ready && (
              <>
                <Home key={cur} hidden={pane !== null} night={h >= 18 || h < 5}
                  past={!!entry} title={entry ? entry.when : S.navToday} onToday={() => setCur(today)}
                  pageTitle={entry ? entry.t : dated.title} pageMeta={entry ? '' : dated.meta}
                  photos={day.photos} groups={day.groups} setGroups={(g) => update(cur, (d) => ({ ...d, groups: g }))}
                  onRemove={(idx) => update(cur, (d) => removePhotos(d, idx))}
                  said={day.said} laid={day.laid} making={making} live={live.text} grammar={grammar} onCamera={shoot} onPick={pick} onOpen={setPane} onRecord={rec}
                  onSaved={(x) => update(cur, (d) => ({ ...d, said: [...d.said, x] }))} onLayout={layout} onNotice={setNotice}
                  placed={day.placed} moved={day.moved} onText={editText}
                  onPlace={(idx, at) => { const id = 'p' + Date.now().toString(36); update(cur, (d) => ({ ...d, placed: [...(d.placed ?? []), { id, idx }], moved: { ...d.moved, [id]: at } })); }}
                  onMove={(key, at) => update(cur, (d) => ({ ...d, moved: { ...d.moved, [key]: at } }))} />
                <Archive open={pane === 'archive'} onClose={() => setPane(null)} onEntry={openEntry} onInsights={() => setPane('insights')} />
                <Insights open={pane === 'insights'} onClose={() => setPane('archive')} />
                <Settings open={pane === 'settings'} onClose={() => setPane(null)} mode={mode} setMode={setMode} lang={lang} setLang={setLang} grammar={grammar} setGrammar={setGrammar} />
                <Toast notice={notice} onClose={closeNotice} />
              </>
            )}
          </View>
        </ThemeCtx.Provider>
      </LangCtx.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
