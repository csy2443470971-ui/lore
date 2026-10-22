/* Apple's speech recognition (expo-speech-recognition), on the iPhone only. The words show up while the person
   talks, and the same microphone stream is saved as a 16 kHz WAV in Documents/audio for the cloud transcription,
   which gives the final text. Each stretch the recogniser finishes (at a pause) is tidied right away, so the
   fillers drop out of what was said a moment ago while the person keeps talking. Expo Go doesn't include the
   native module; then `on` is false and the app records with expo-audio as before. */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Directory, Paths } from 'expo-file-system';
import { agentOn, tidyText } from './agent';

type Mod = typeof import('expo-speech-recognition');
let mod: Mod | null = null;
if (Platform.OS === 'ios') {
  // loaded with require so that Expo Go, which lacks the native module, can catch the error instead of crashing
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { mod = require('expo-speech-recognition'); } catch { mod = null; }
}

/* after a pause the recogniser starts a new segment; segments are appended, Chinese without a space */
function join(a: string, b: string) {
  const t = b.trim();
  if (!a || !t) return a || t;
  return /[㐀-鿿，。！？、]$/.test(a) || /^[㐀-鿿]/.test(t) ? a + t : `${a} ${t}`;
}

/* onStop: the recogniser stopped by itself (an error code), so the person knows the recording stopped too */
export function useLive(onStop: (code: string) => void) {
  const [text, setText] = useState('');
  const segs = useRef<{ raw: string; tidy?: string }[]>([]);      // finished stretches, tidied once the backend answers
  const interim = useRef('');                                      // the stretch still being said
  const file = useRef<string | null>(null);
  const running = useRef(false);
  const ended = useRef<(() => void) | null>(null);
  const stopped = useRef(onStop);
  useEffect(() => { stopped.current = onStop; });

  useEffect(() => {
    if (!mod) return;
    const M = mod.ExpoSpeechRecognitionModule;
    const subs = [
      M.addListener('result', (e) => {
        const t = e.results[0]?.transcript ?? '';
        const show = () => setText(join(segs.current.reduce((a, s) => join(a, s.tidy ?? s.raw), ''), interim.current));
        if (!e.isFinal) { interim.current = t; show(); return; }
        const seg: { raw: string; tidy?: string } = { raw: t };
        segs.current.push(seg);
        interim.current = '';
        show();
        if (agentOn && t.trim()) tidyText(t).then((x) => { seg.tidy = x; show(); }).catch(() => {});
      }),
      M.addListener('audioend', (e) => { file.current = e.uri; }),
      M.addListener('error', (e) => { if (running.current && !ended.current && e.error !== 'aborted') stopped.current(e.error); }),
      M.addListener('end', () => { running.current = false; ended.current?.(); ended.current = null; }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  /* false when Apple's recogniser can't be used (no permission, or not available); the caller then records with expo-audio */
  async function start(lang: 'zh' | 'en') {
    if (!mod) return false;
    const M = mod.ExpoSpeechRecognitionModule;
    try {
      if (!M.isRecognitionAvailable()) return false;
      if (!(await M.requestPermissionsAsync()).granted) return false;
    } catch {
      return false;
    }
    segs.current = []; interim.current = ''; file.current = null; setText('');
    running.current = true;
    M.start({
      lang: lang === 'zh' ? 'zh-CN' : 'en-US',
      interimResults: true, continuous: true, addsPunctuation: true, iosTaskHint: 'dictation',
      requiresOnDeviceRecognition: true,           // applied where the phone supports it; then no audio goes to Apple
      recordingOptions: { persist: true, outputDirectory: new Directory(Paths.document, 'audio').uri, outputSampleRate: 16000, outputEncoding: 'pcmFormatInt16' },
    });
    return true;
  }

  /* stop, and hand back the recording once the recogniser has finished writing it */
  function stop(): Promise<string | null> {
    return new Promise((resolve) => {
      if (!mod || !running.current) { resolve(file.current); return; }
      const t = setTimeout(() => { ended.current = null; resolve(file.current); }, 4000);
      ended.current = () => { clearTimeout(t); resolve(file.current); };
      mod.ExpoSpeechRecognitionModule.stop();
    });
  }

  return { on: !!mod, text, start, stop };
}
