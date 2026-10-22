/* Each day is kept on the phone and never leaves it: what was said and how it was laid out, in AsyncStorage
   (one key per day); photos and recordings as files in the app's Documents folder, which the system never
   clears and the iPhone's iCloud backup includes. Files are stored by their path inside Documents, because the
   folder's absolute path changes when the app is updated. */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { PHOTO } from './images';
import { Day, Pic, Placed, Pos, Said, Sticker } from './session';

const PREFIX = 'lore-day:';
const native = Platform.OS !== 'web';

/* a calendar day in local time, e.g. 2026-10-22 */
export function dayKey(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const isDayKey = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k);
/* a page that runs over several days, kept under its first day */
export const isSpanKey = (k: string) => /^r-\d{4}-\d{2}-\d{2}$/.test(k);

const base = () => Paths.document.uri.replace(/\/?$/, '/');
const inside = (uri: string) => (native && uri.startsWith(base()) ? uri.slice(base().length) : null);
const name = (ext: string) => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.${ext}`;

function folder(sub: string) {
  const dir = new Directory(Paths.document, sub);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/* a picked photo lives in the picker's cache; copy it into Documents/photos */
export async function keepPhoto(uri: string): Promise<Pic> {
  if (!native) return { uri };
  try {
    const ext = (uri.match(/\.(\w+)$/)?.[1] ?? 'jpg').toLowerCase();
    const n = name(ext);
    const dest = new File(folder('photos'), n);
    await new File(uri).copy(dest);
    return { uri: dest.uri, file: `photos/${n}` };
  } catch {
    return { uri };                                // still shown, though the system may clear it later
  }
}

/* a recording lives in the recorder's cache; move it into Documents/audio, so a failed upload really is kept */
export async function keepRecording(uri: string): Promise<string> {
  if (!native || inside(uri)) return uri;
  try {
    const f = new File(uri);
    await f.move(folder('audio'));
    return f.uri;
  } catch {
    return uri;
  }
}

type Stored = { photos?: { file?: string; seed?: string; uri?: string; r?: number }[]; groups?: number[][]; said?: Said[]; laid?: number; placed?: Placed[]; moved?: Record<string, Pos>; stickers?: Sticker[]; span?: Day['span'] };
const seedOf = (asset: number) => Object.keys(PHOTO).find((k) => PHOTO[k] === asset);

/* sample photos are saved by name, since the bundle's asset numbers change between updates */
function pack(d: Day): string {
  const photos = d.photos.map((p) => ({ ...(p.file ? { file: p.file } : p.asset !== undefined ? { seed: seedOf(p.asset) } : { uri: p.uri }), ...(p.r ? { r: p.r } : {}) }));
  const rel = (a: string) => inside(a) ?? a;
  const said = d.said.map((x) => (x.kind === 'head' ? x : { ...x, audio: x.audio && rel(x.audio), more: x.more?.map((r) => ({ ...r, audio: rel(r.audio) })) }));
  return JSON.stringify({ photos, groups: d.groups, said, laid: d.laid, placed: d.placed, moved: d.moved, stickers: d.stickers, span: d.span });
}
function unpack(s: string): Day | null {
  try {
    const j: Stored = JSON.parse(s);
    const photos: Pic[] = (j.photos ?? []).map((p) => ({
      ...(p.file && native ? { file: p.file, uri: new File(Paths.document, p.file).uri }
        : p.seed && PHOTO[p.seed] !== undefined ? { asset: PHOTO[p.seed] } : { uri: p.uri }), ...(p.r ? { r: p.r } : {}),
    }));
    return { photos, groups: j.groups ?? [], said: j.said ?? [], laid: j.laid ?? 0, placed: j.placed, moved: j.moved, stickers: j.stickers, span: j.span };
  } catch {
    return null;
  }
}

export async function loadDays(): Promise<Record<string, Day>> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  const out: Record<string, Day> = {};
  for (const [k, v] of await AsyncStorage.multiGet(keys)) {
    const d = v ? unpack(v) : null;
    if (d) out[k.slice(PREFIX.length)] = d;
  }
  return out;
}
/* a recording's file, whether it was saved by its path inside Documents or (just recorded) in full */
export const fileUri = (a: string) => (!native || /^[a-z]+:/.test(a) ? a : new File(Paths.document, a).uri);

export const saveDay = (key: string, d: Day) => AsyncStorage.setItem(PREFIX + key, pack(d));

/* the stickers the person made from photos, newest first, by their path inside Documents */
export async function loadMine(): Promise<string[]> {
  try { const v = await AsyncStorage.getItem('lore-stickers'); return v ? JSON.parse(v) : []; } catch { return []; }
}
export const saveMine = (list: string[]) => AsyncStorage.setItem('lore-stickers', JSON.stringify(list)).catch(() => {});
/* a file made by native code (a full file:// address) kept by its path inside Documents */
export const relative = (uri: string) => inside(uri) ?? uri;
