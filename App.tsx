import React, { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Newsreader_300Light, Newsreader_400Regular, Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader';
import { Lang } from './src/data';
import { Pic, Said } from './src/session';
import { dark as darkT, light as lightT } from './src/theme';
import { DotField, LangCtx, ThemeCtx } from './src/ui';
import { Home } from './src/Home';
import { Grid } from './src/Photos';
import { Entry } from './src/Entry';
import { Archive, Insights, Settings } from './src/Screens';

type Mode = 'light' | 'dark' | 'auto';
type Pane = null | 'grid' | 'entry' | 'archive' | 'insights' | 'settings';

/* One screen: home is the writing window; photos, the day page, look back and settings slide over it. */
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
  const [photos, setPhotos] = useState<Pic[]>([]);
  const [groups, setGroups] = useState<number[][]>([]);
  const [said, setSaid] = useState<Said[]>([]);
  const [laid, setLaid] = useState(0);          // how many of the things said are already laid out as a page
  const [making, setMaking] = useState(false);
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    AsyncStorage.multiGet(['qd-mode', 'qd-lang']).then((kv) => {
      const m = kv[0][1]; if (m === 'light' || m === 'dark' || m === 'auto') setModeState(m);
      const l = kv[1][1]; if (l === 'zh' || l === 'en') setLangState(l);
    }).catch(() => {});
  }, []);
  const setMode = (m: Mode) => { setModeState(m); AsyncStorage.setItem('qd-mode', m).catch(() => {}); };
  const setLang = (l: Lang) => { setLangState(l); AsyncStorage.setItem('qd-lang', l).catch(() => {}); };

  async function pick(add: boolean) {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, orderedSelection: true, selectionLimit: 60, quality: 0.7 });
      if (r.canceled || !r.assets.length) return;
      const next = r.assets.map((a) => ({ uri: a.uri }));
      if (add) setPhotos((p) => [...p, ...next]); else { setPhotos(next); setGroups([]); }
      Haptics.selectionAsync().catch(() => {});
      setPane('grid');
    } catch { /* picker unavailable */ }
  }

  async function shoot() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (r.canceled || !r.assets.length) return;
      setPhotos((p) => [...p, { uri: r.assets[0].uri }]);
      setPane('grid');
    } catch { /* no camera, e.g. the simulator */ }
  }

  /* laying out is a step the person chooses; it takes everything said so far */
  function layout() {
    const n = said.length;
    setMaking(true);
    setTimeout(() => { setLaid(n); setMaking(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }, 2000);
  }

  /* the real microphone runs under the demo transcript, so "play what you just said" plays your voice */
  const rec = {
    start: async () => {
      try {
        const p = await requestRecordingPermissionsAsync();
        if (!p.granted) return;
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch { /* the demo still runs without a mic */ }
    },
    stop: async () => {
      try { if (recorder.isRecording) { await recorder.stop(); setVoiceUri(recorder.uri); await setAudioModeAsync({ allowsRecording: false }); } } catch { /* ignore */ }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    cancel: async () => {
      try { if (recorder.isRecording) { await recorder.stop(); await setAudioModeAsync({ allowsRecording: false }); } } catch { /* ignore */ }
    },
  };

  const isDark = mode === 'auto' ? system === 'dark' : mode === 'dark';
  const t = isDark ? darkT : lightT;
  const h = new Date().getHours();

  return (
    <SafeAreaProvider>
      <LangCtx.Provider value={lang}>
        <ThemeCtx.Provider value={t}>
          <View style={[styles.root, { backgroundColor: t.b }]}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <DotField />
            {fontsLoaded && (
              <>
                <Home hidden={pane !== null} night={h >= 18 || h < 5} photos={photos} said={said} laid={laid} making={making}
                  onCamera={shoot} onPick={() => (photos.length ? setPane('grid') : pick(false))} onOpen={setPane} onRecord={rec}
                  onSaved={(text) => setSaid((x) => [...x, { kind: 'talk', text }])} onLayout={layout} />
                <Grid open={pane === 'grid'} photos={photos} groups={groups} setGroups={setGroups} onBack={() => setPane(null)}
                  onCamera={shoot} onMore={() => pick(true)} onRecord={rec}
                  onDone={(x) => { setSaid((s) => [...s, x]); setTimeout(() => setPane(null), 700); }} />
                <Entry open={pane === 'entry'} onClose={() => setPane(null)} onArchive={() => setPane('archive')} voiceUri={voiceUri} />
                <Archive open={pane === 'archive'} onClose={() => setPane(null)} onEntry={() => setPane('entry')} onInsights={() => setPane('insights')} />
                <Insights open={pane === 'insights'} onClose={() => setPane('archive')} />
                <Settings open={pane === 'settings'} onClose={() => setPane(null)} mode={mode} setMode={setMode} lang={lang} setLang={setLang} />
              </>
            )}
          </View>
        </ThemeCtx.Provider>
      </LangCtx.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
