import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, StyleSheet, useColorScheme, View } from 'react-native';
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
import { match, sentences } from './src/match';
import { timeRules } from './src/sections';
import { join, shape } from './src/paragraphs';
import { agentOn, fixText, sectionsOf } from './src/agent';
import { dayKey, isDayKey, keepPhoto, loadDays, saveDay } from './src/store';
import { useLive } from './src/live';
import { dark as darkT, light as lightT } from './src/theme';
import { DotField, LangCtx, Notice, ThemeCtx, Toast } from './src/ui';
import { Home } from './src/Home';
import { Archive, Insights, Settings } from './src/Screens';
import { DayMenu } from './src/DayMenu';
import { Week } from './src/Week';

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
  const [cur, setCur] = useState(today);             // a date, 'week' for this week, or 'e<n>' for a sample entry from Look back
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
      setCur((c) => (c === today ? now : c));
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

  /* the page belongs to another day: everything on it moves there, after what that day already has. Photo numbers,
     groups, placed photos and where photos were dragged all move along; this day is left empty */
  function moveDay(from: string, to: string) {
    if (from === to) return;
    setDays((all) => {
      const src = all[from] ?? EMPTY, dst = all[to] ?? EMPTY, off = dst.photos.length, n = dst.said.length;
      const re = (idx: number[]) => idx.map((i) => i + off);
      const said = src.said.map((x): Said => (x.kind === 'photos' ? { ...x, parts: x.parts.map((p) => ({ ...p, unit: { idx: re(p.unit.idx) } })) } : x));
      const moved = Object.fromEntries(Object.entries(src.moved ?? {}).map(([k, v]) => [/^\d+-\d+$/.test(k) ? k.replace(/^\d+/, (i) => String(Number(i) + n)) : k, v]));
      const allLaid = dst.laid === dst.said.length;
      return {
        ...all,
        [from]: { ...EMPTY },
        [to]: {
          photos: [...dst.photos, ...src.photos], groups: [...dst.groups, ...src.groups.map(re)], said: [...dst.said, ...said],
          laid: allLaid ? n + src.laid : dst.laid,
          placed: [...(dst.placed ?? []), ...(src.placed ?? []).map((p) => ({ ...p, idx: re(p.idx) }))],
          moved: { ...dst.moved, ...moved },
        },
      };
    });
    setCur(to);
  }

  /* an edited recording, or an edited caption of one photo; emptied words stay as an empty entry, so nothing else moves */
  function editText(item: number, part: number, text: string) {
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
    const said0 = d0.said.filter((x): x is Exclude<Said, { kind: 'head' }> => x.kind !== 'head');   // headings are found again each time
    const items: Said[] = agentOn && grammar
      ? await Promise.all(said0.map(async (x): Promise<Said> => (x.g ? x : x.kind === 'talk'
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
      return cuts.flatMap((c, k): Said[] => {
        const text = join(sents[i].slice(c, cuts[k + 1] ?? sents[i].length)), h = hs.find((hh) => hh.j === c);
        const part: Said = k === 0 ? { ...x, text } : { kind: 'talk', text, g: x.g };
        return h ? [{ kind: 'head', text: h.text }, part] : [part];
      });
    });
    /* then the paragraph rules (src/paragraphs.ts): long ones are cut, short ones join their neighbours */
    const said = shape(headed, new Set(breaks.map((n) => flat[n]?.s).filter(Boolean)));
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
  const entry = isDayKey(cur) || cur === 'week' ? null : S.entries[Number(cur.slice(1))];
  /* the title says which day this is, and opens the menu of days: today, yesterday, the day before and this week */
  const yest = shift(today, -1), before = shift(today, -2);
  const nameOf = (k: string) => (k === 'week' ? S.navWeek : k === today ? S.navToday : k === yest ? S.navYesterday : k === before ? S.navBefore : dateTitle(k, lang).title);
  const has = (k: string) => !!days[k] && (days[k].said.length > 0 || days[k].photos.length > 0);
  const [ty, tm, td] = today.split('-').map(Number);
  const monday = shift(today, -((new Date(ty, tm - 1, td).getDay() + 6) % 7));
  const weekKeys: string[] = [];
  for (let k = monday; k <= today; k = shift(k, 1)) weekKeys.push(k);
  const menuOpts = [...[today, yest, before].map((k) => ({ key: k, label: nameOf(k), date: dateTitle(k, lang).title, has: has(k) })),
    { key: 'week', label: S.navWeek, date: S.weekLabel, has: weekKeys.some(has) }];
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
                {cur === 'week' ? (
                  <Week days={days} keys={weekKeys} title={S.navWeek} voice={voice} indent={indent} onTitle={() => setMenu(true)} onOpen={setPane} onDay={setCur}
                    labelOf={(k) => `${dateTitle(k, lang).meta} · ${dateTitle(k, lang).title}`} />
                ) : (
                <Home key={cur} hidden={pane !== null} night={h >= 18 || h < 5}
                  past={!!entry} title={entry ? entry.when : nameOf(cur)} onTitle={entry ? undefined : () => setMenu(true)} onDate={entry ? undefined : () => setPicking(true)} onToday={() => setCur(today)}
                  pageTitle={entry ? entry.t : dated.title} pageMeta={entry ? '' : dated.meta}
                  photos={day.photos} groups={day.groups} setGroups={(g) => update(cur, (d) => ({ ...d, groups: g }))}
                  onRemove={(idx) => update(cur, (d) => removePhotos(d, idx))}
                  said={day.said} laid={day.laid} making={making} live={live.text} grammar={grammar} voice={voice} indent={indent} onCamera={shoot} onPick={pick} onOpen={setPane} onRecord={rec}
                  onSaved={(x) => update(cur, (d) => ({ ...d, said: [...d.said, x] }))} onLayout={layout} onNotice={setNotice}
                  placed={day.placed} moved={day.moved} onText={editText}
                  onPlace={(idx, at) => { const id = 'p' + Date.now().toString(36); update(cur, (d) => ({ ...d, placed: [...(d.placed ?? []), { id, idx }], moved: { ...d.moved, [id]: at } })); }}
                  onMove={(key, at) => update(cur, (d) => ({ ...d, moved: { ...d.moved, [key]: at } }))} />
                )}
                {menu ? <DayMenu opts={menuOpts} cur={cur} onPick={(k) => { setMenu(false); setCur(k); }} onClose={() => setMenu(false)} /> : null}
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
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
