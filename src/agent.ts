import { Platform } from 'react-native';
import { File } from 'expo-file-system';

/* Lore's backend (agent/worker). The address and the app key come from mobile/.env, which is not in git. */
const URL = process.env.EXPO_PUBLIC_LORE_AGENT_URL;
const KEY = process.env.EXPO_PUBLIC_LORE_KEY ?? '';

/* the web preview keeps the demo transcript (it is used for screenshots); the phone uses the real pipeline */
export const agentOn = Platform.OS !== 'web' && !!URL && !!KEY;

export type Heard = { raw: string; text: string; via: string };

/* send one recording: it comes back as the raw transcript and the tidied text.
   The audio travels as base64 in JSON: the multipart file convention ({ uri, name, type }) is not understood by every fetch. */
export async function transcribe(uri: string): Promise<Heard> {
  const audio = await new File(uri).base64();
  const r = await fetch(`${URL}/transcribe`, {
    method: 'POST',
    headers: { 'x-lore-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ audio, mime: 'audio/mp4' }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`${r.status}${j.error ? ' ' + j.error : ''}`);
  }
  return r.json();
}

/* the raw transcript, marked word by word: false where the tidy took it out (shown struck through for a moment) */
export function marked(raw: string, text: string): [string, boolean][] {
  const tok = (s: string) => s.match(/[\u3400-\u9fff]|[A-Za-z0-9'’]+|\s+|[^\sA-Za-z0-9'’\u3400-\u9fff]/g) ?? [];
  const a = tok(raw), b = tok(text);
  const key = (x: string) => x.toLowerCase();
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = key(a[i]) === key(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: [string, boolean][] = [];
  let i = 0, j = 0;
  while (i < a.length) {
    if (j < b.length && key(a[i]) === key(b[j])) { out.push([a[i], true]); i++; j++; }
    else if (j < b.length && L[i][j + 1] > L[i + 1][j]) j++;
    else { out.push([a[i], /^[\s，,。.、]+$/.test(a[i])]); i++; }
  }
  return out;
}
