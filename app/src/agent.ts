import { Platform } from 'react-native';
import { File } from 'expo-file-system';

/* Lore's backend (agent/worker). The address and the app key come from mobile/.env, which is not in git. */
const URL = process.env.EXPO_PUBLIC_LORE_AGENT_URL;
const KEY = process.env.EXPO_PUBLIC_LORE_KEY ?? '';

/* the web preview keeps the demo transcript (it is used for screenshots); the phone uses the real pipeline */
export const agentOn = Platform.OS !== 'web' && !!URL && !!KEY;

/* raw: as heard; tidied: fillers out; text: the final words, with misheard words (and, with grammar on, grammar) fixed */
export type Heard = { raw: string; text: string; tidied?: string; via: string };

/* send one recording: it comes back as the raw transcript and the tidied text.
   The audio travels as base64 in JSON: the multipart file convention ({ uri, name, type }) is not understood by every fetch. */
export async function transcribe(uri: string, grammar = true): Promise<Heard> {
  const audio = await new File(uri).base64();
  const r = await fetch(`${URL}/transcribe`, {
    method: 'POST',
    headers: { 'x-lore-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ audio, mime: uri.endsWith('.wav') ? 'audio/wav' : 'audio/mp4', grammar }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`${r.status}${j.error ? ' ' + j.error : ''}`);
  }
  return r.json();
}

/* one finished stretch of speech, tidied while the person is still talking: fillers out, nothing else */
export async function tidyText(text: string): Promise<string> {
  const r = await fetch(`${URL}/tidy`, { method: 'POST', headers: { 'x-lore-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()).text;
}

/* words already on the phone, corrected once when a day is laid out again: misheard words and, with grammar on, grammar */
export async function fixText(text: string, grammar: boolean): Promise<string> {
  const r = await fetch(`${URL}/fix`, { method: 'POST', headers: { 'x-lore-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify({ text, grammar }) });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()).text;
}

/* the time-heading node: which of the day's sentences start a new time of day, and the heading for each */
export async function sectionsOf(sentences: string[]): Promise<{ sections: { sentence: number; heading: string }[]; breaks: number[] }> {
  const r = await fetch(`${URL}/sections`, { method: 'POST', headers: { 'x-lore-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify({ sentences }) });
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json();
  return { sections: j.sections ?? [], breaks: j.breaks ?? [] };
}

/* the paper-page node: a photo of a handwritten page, read word for word (nothing corrected) */
export async function readPage(uri: string): Promise<string> {
  if (!agentOn) return DEMO_PAGE;
  const image = await new File(uri).base64();
  const mime = /\.png$/i.test(uri) ? 'image/png' : 'image/jpeg';
  const r = await fetch(`${URL}/read`, { method: 'POST', headers: { 'x-lore-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify({ image, mime }) });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()).text ?? '';
}
/* the web preview has no backend: a page reads as this */
const DEMO_PAGE = '下午在图书馆坐了很久，本来想写论文，结果一直在看窗外的银杏树。叶子黄了一半，风一吹就往下掉。';

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
