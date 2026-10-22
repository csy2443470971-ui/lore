import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Newsreader_300Light, Newsreader_400Regular, Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader';
import { Lang, STR } from './src/data';
import { PHOTO } from './src/images';
import { Day, removePhotos, Said } from './src/session';
import { dark as darkT, light as lightT } from './src/theme';
import { DotField, LangCtx, Notice, ThemeCtx, Toast } from './src/ui';
import { Home } from './src/Home';
import { Archive, Insights, Settings } from './src/Screens';

type Mode = 'light' | 'dark' | 'auto';
type Pane = null | 'archive' | 'insights' | 'settings';
const EMPTY: Day = { photos: [], groups: [], said: [], laid: 0 };

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
  const [pane, setPane] = useState<Pane>(null);
  const [days, setDays] = useState<Record<string, Day>>({ today: EMPTY });
  const [cur, setCur] = useState('today');           // 'today', or 'e<n>' for an entry from Look back
  const [making, setMaking] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const closeNotice = useCallback(() => setNotice(null), []);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const S = STR[lang];

  useEffect(() => {
    AsyncStorage.multiGet(['qd-mode', 'qd-lang']).then((kv) => {
      const m = kv[0][1]; if (m === 'light' || m === 'dark' || m === 'auto') setModeState(m);
      const l = kv[1][1]; if (l === 'zh' || l === 'en') setLangState(l);
    }).catch(() => {});
  }, []);
  const setMode = (m: Mode) => { setModeState(m); AsyncStorage.setItem('qd-mode', m).catch(() => {}); };
  const setLang = (l: Lang) => { setLangState(l); AsyncStorage.setItem('qd-lang', l).catch(() => {}); };

  const day = days[cur] ?? EMPTY;
  const update = (key: string, f: (d: Day) => Day) => setDays((m) => ({ ...m, [key]: f(m[key] ?? EMPTY) }));
  const settings = { label: S.openSettings, run: () => { Linking.openSettings().catch(() => {}); } };

  /* open an entry from Look back on the writing page; the sample entries become a laid-out page the first time */
  function openEntry(i: number) {
    const key = 'e' + i, e = S.entries[i];
    if (e && !days[key]) {
      const said: Said[] = [{ kind: 'talk', text: e.s }, { kind: 'photos', parts: e.p.map((k, j) => ({ unit: { idx: [j] }, text: S.pline[k] ?? '' })) }];
      setDays((m) => ({ ...m, [key]: { photos: e.p.map((k) => ({ asset: PHOTO[k] })), groups: [], said, laid: said.length } }));
    }
    setCur(e?.today ? 'today' : key);
    setPane(null);
  }

  async function pick() {
    const key = cur;
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, orderedSelection: true, selectionLimit: 60, quality: 0.7 });
      if (r.canceled || !r.assets.length) return;
      update(key, (d) => ({ ...d, photos: [...d.photos, ...r.assets.map((a) => ({ uri: a.uri }))] }));
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
      update(key, (d) => ({ ...d, photos: [...d.photos, { uri: r.assets[0].uri }] }));
    } catch { /* no camera, e.g. the simulator */ }
  }

  /* laying out is a step the person chooses; it takes everything said so far */
  function layout() {
    const key = cur, n = day.said.length;
    setMaking(true);
    setTimeout(() => { update(key, (d) => ({ ...d, laid: n })); setMaking(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }, 2000);
  }

  /* the real microphone runs under the demo transcript */
  const rec = {
    start: async () => {
      try {
        const p = await requestRecordingPermissionsAsync();
        if (!p.granted) { setNotice({ text: S.micDenied, action: settings }); return false; }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch { /* the demo still runs without a mic */ }
      return true;
    },
    stop: async () => {
      try { if (recorder.isRecording) { await recorder.stop(); await setAudioModeAsync({ allowsRecording: false }); } } catch { /* ignore */ }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    cancel: async () => {
      try { if (recorder.isRecording) { await recorder.stop(); await setAudioModeAsync({ allowsRecording: false }); } } catch { /* ignore */ }
    },
  };

  const isDark = mode === 'auto' ? system === 'dark' : mode === 'dark';
  const t = isDark ? darkT : lightT;
  const h = new Date().getHours();
  const entry = cur === 'today' ? null : S.entries[Number(cur.slice(1))];
  const nLaid = S.nSaid(day.laid);

  return (
    <SafeAreaProvider>
      <LangCtx.Provider value={lang}>
        <ThemeCtx.Provider value={t}>
          <View style={[styles.root, { backgroundColor: t.b }]}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <DotField />
            {fontsLoaded && (
              <>
                <Home key={cur} hidden={pane !== null} night={h >= 18 || h < 5}
                  past={!!entry} title={entry ? entry.when : S.navToday} onToday={() => setCur('today')}
                  pageTitle={entry ? entry.t : S.todayTitle} pageMeta={entry ? nLaid : `${S.date}  ·  ${nLaid}`}
                  photos={day.photos} groups={day.groups} setGroups={(g) => update(cur, (d) => ({ ...d, groups: g }))}
                  onRemove={(idx) => update(cur, (d) => removePhotos(d, idx))}
                  said={day.said} laid={day.laid} making={making} onCamera={shoot} onPick={pick} onOpen={setPane} onRecord={rec}
                  onSaved={(x) => update(cur, (d) => ({ ...d, said: [...d.said, x] }))} onLayout={layout} onNotice={setNotice} />
                <Archive open={pane === 'archive'} onClose={() => setPane(null)} onEntry={openEntry} onInsights={() => setPane('insights')} />
                <Insights open={pane === 'insights'} onClose={() => setPane('archive')} />
                <Settings open={pane === 'settings'} onClose={() => setPane(null)} mode={mode} setMode={setMode} lang={lang} setLang={setLang} />
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
