import React, { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Newsreader_300Light, Newsreader_400Regular, Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader';
import { Lang, Scene, SCENES } from './src/data';
import { IMG } from './src/images';
import { dark as darkT, light as lightT } from './src/theme';
import { LangCtx, ThemeCtx } from './src/ui';
import { Home } from './src/Home';
import { Entry } from './src/Entry';
import { Archive, Picker, Settings } from './src/Screens';

type Mode = 'light' | 'dark' | 'auto';
type Pane = null | 'entry' | 'archive' | 'settings';

/* One screen: the illustrated scene is always there; home sits on it, and every other page is paper sliding over it. */
export default function App() {
  const [fontsLoaded] = useFonts({
    'NotoSerifSC-400': require('./assets/fonts/NotoSerifSC-400Regular.ttf'),
    'NotoSerifSC-500': require('./assets/fonts/NotoSerifSC-500Medium.ttf'),
    Newsreader_300Light, Newsreader_400Regular, Newsreader_400Regular_Italic,
  });
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>('auto');
  const [lang, setLangState] = useState<Lang>('zh');
  const [scene, setSceneState] = useState<Scene>(SCENES[0]);
  const [pane, setPane] = useState<Pane>(null);
  const [picker, setPicker] = useState(false);
  const [tab, setTab] = useState<'week' | 'month'>('week');
  const [voiceUri, setVoiceUri] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.multiGet(['qd-scene', 'qd-mode', 'qd-lang']).then((kv) => {
      const sc = SCENES.find((x) => x.id === kv[0][1]); if (sc) setSceneState(sc);
      const m = kv[1][1]; if (m === 'light' || m === 'dark' || m === 'auto') setModeState(m);
      const l = kv[2][1]; if (l === 'zh' || l === 'en') setLangState(l);
    }).catch(() => {});
  }, []);
  const setScene = (x: Scene) => { setSceneState(x); AsyncStorage.setItem('qd-scene', x.id).catch(() => {}); };
  const setMode = (m: Mode) => { setModeState(m); AsyncStorage.setItem('qd-mode', m).catch(() => {}); };
  const setLang = (l: Lang) => { setLangState(l); AsyncStorage.setItem('qd-lang', l).catch(() => {}); };
  const swipe = (dir: 1 | -1) => {
    const i = SCENES.findIndex((x) => x.id === scene.id);
    setScene(SCENES[(i + dir + SCENES.length) % SCENES.length]);
  };

  const isDark = mode === 'auto' ? system === 'dark' : mode === 'dark';
  const t = isDark ? darkT : lightT;

  return (
    <SafeAreaProvider>
      <LangCtx.Provider value={lang}>
        <ThemeCtx.Provider value={t}>
          <View style={[styles.root, { backgroundColor: t.paperSolid }]}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <Image source={IMG[isDark ? scene.night : scene.day]} style={StyleSheet.absoluteFill} contentFit="cover" transition={700} cachePolicy="memory" />
            <LinearGradient colors={t.scrim} locations={[0, 0.42]} style={StyleSheet.absoluteFill} pointerEvents="none" />
            {fontsLoaded && (
              <>
                <Home hidden={pane !== null} sceneName={scene[lang]} onSwipe={swipe} onOpen={setPane} onRecorded={setVoiceUri} />
                <Entry open={pane === 'entry'} onClose={() => setPane(null)} onArchive={() => setPane('archive')} voiceUri={voiceUri} />
                <Archive open={pane === 'archive'} tab={tab} setTab={setTab} onClose={() => setPane(null)} onEntry={() => setPane('entry')} />
                <Settings open={pane === 'settings'} onClose={() => setPane(null)} onPicker={() => setPicker(true)} scene={scene} mode={mode} setMode={setMode} lang={lang} setLang={setLang} />
                <Picker open={picker} scene={scene} onPick={setScene} onClose={() => setPicker(false)} />
              </>
            )}
          </View>
        </ThemeCtx.Provider>
      </LangCtx.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
