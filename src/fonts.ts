import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Font from 'expo-font';
import { Directory, File, Paths } from 'expo-file-system';
import LoreVision from '../modules/lore-vision';
import { F } from './theme';

/* The Chinese face the whole app is set in, chosen in Settings: Songti (Apple's, fetched from Apple the first time),
   Noto Serif SC (in the app), LXGW WenKai (open source, fetched the first time it is chosen) or PingFang (on every
   iPhone). Until a face that has to be fetched is ready, Noto Serif SC stands in, which looks closest. */
export type FontKey = 'song' | 'noto' | 'wenkai' | 'pingfang';
export const FONT_KEYS: FontKey[] = ['song', 'noto', 'wenkai', 'pingfang'];
export type Face = { body: string; title: string };

const NOTO: Face = { body: F.cn, title: F.cnMed };
const SONG: Face = { body: 'STSongti-SC-Regular', title: 'STSongti-SC-Bold' };
const WENKAI_URL = 'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@v1.530/fonts/TTF/LXGWWenKaiLite-Regular.ttf';
const web = Platform.OS === 'web';

/* LXGW WenKai, kept in Documents/fonts once it has been fetched */
async function wenkai(): Promise<boolean> {
  if (Font.isLoaded('LXGWWenKai')) return true;
  if (web) { await Font.loadAsync({ LXGWWenKai: WENKAI_URL }); return true; }
  const dir = new Directory(Paths.document, 'fonts');
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, 'LXGWWenKaiLite-Regular.ttf');
  if (!file.exists || file.size < 1_000_000) await File.downloadFileAsync(WENKAI_URL, file, { idempotent: true });
  await Font.loadAsync({ LXGWWenKai: file.uri });
  return true;
}

/* the face to use now for the chosen one, and whether it is still being fetched */
export function useChineseFace(key: FontKey): { face: Face; fetching: boolean } {
  const [ready, setReady] = useState<Partial<Record<FontKey, boolean>>>(() => ({
    song: web || !!LoreVision?.fontReady?.(SONG.body), wenkai: Font.isLoaded('LXGWWenKai'),
  }));
  const [failed, setFailed] = useState<Partial<Record<FontKey, boolean>>>({});
  useEffect(() => {
    if (ready[key] || failed[key]) return;
    let on = true;
    const done = (ok: boolean) => { if (!on) return; if (ok) setReady((r) => ({ ...r, [key]: true })); else setFailed((f) => ({ ...f, [key]: true })); };
    if (key === 'song') {
      if (LoreVision?.fetchFont) LoreVision.fetchFont([SONG.body, SONG.title]).then(done, () => done(false));
      else done(false);                            // an app installed before this could fetch fonts
    } else if (key === 'wenkai') wenkai().then(done, () => done(false));
    return () => { on = false; };
  }, [key, ready, failed]);
  if (key === 'pingfang') return { face: web ? { body: 'PingFang SC', title: 'PingFang SC' } : { body: 'PingFangSC-Regular', title: 'PingFangSC-Medium' }, fetching: false };
  if (key === 'song' && ready.song) return { face: web ? { body: 'Songti SC', title: 'Songti SC' } : SONG, fetching: false };
  if (key === 'wenkai' && ready.wenkai) return { face: { body: 'LXGWWenKai', title: 'LXGWWenKai' }, fetching: false };
  return { face: NOTO, fetching: (key === 'song' || key === 'wenkai') && !failed[key] };
}
