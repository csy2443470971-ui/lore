/* A place put on the page: found by name in Apple Maps (free, no key; AutoNavi's data in China), or from a Google Maps,
   高德 or Apple Maps link pasted in. It shows as a card (a small map, the name and address, and where the link is from)
   or as a chip (a pin and the name). A tap opens the link, or Apple Maps when there is none. */
import { Linking, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import LoreVision from '../modules/lore-vision';

/* map: the small maps for the card, light and dark, as paths inside Documents */
export type Pin = {
  name: string; address?: string; lat?: number; lng?: number;
  url?: string; from?: 'google' | 'amap' | 'apple';
  map?: { light?: string; dark?: string };
  look: 'card' | 'chip';
};
export type Found = { name: string; address?: string; lat?: number; lng?: number };

export const canSearch = !!LoreVision?.searchPlaces;

/* roughly where the phone is, to look for places near it first; only when location was already allowed, never asking */
async function near(): Promise<{ lat: number; lng: number } | null> {
  if (Platform.OS === 'web' || !requireOptionalNativeModule('ExpoLocation')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when the native side is there
    const loc = require('expo-location') as typeof import('expo-location');
    if (!(await loc.getForegroundPermissionsAsync()).granted) return null;
    const at = await loc.getLastKnownPositionAsync();
    return at ? { lat: at.coords.latitude, lng: at.coords.longitude } : null;
  } catch { return null; }
}

export async function search(q: string, around?: { lat: number; lng: number } | null): Promise<Found[]> {
  if (!LoreVision?.searchPlaces || !q.trim()) return [];
  const at = around ?? (await near());
  try { return await LoreVision.searchPlaces(q.trim(), at?.lat ?? null, at?.lng ?? null); } catch { return []; }
}

/* ---------- links ---------- */
const URL_RE = /https?:\/\/[^\s<>"'，。）)】]+/i;
export const linkIn = (text: string) => URL_RE.exec(text)?.[0] ?? null;
const fromOf = (u: string): Pin['from'] | undefined =>
  /google\.|goo\.gl/i.test(u) ? 'google' : /amap\.com|autonavi/i.test(u) ? 'amap' : /maps\.apple|apple\.com\/maps|maps\.apple\.com/i.test(u) ? 'apple' : undefined;
const num = (s?: string | null) => (s && Number.isFinite(+s) ? +s : undefined);
const dec = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };

/* what a map link says: the place's name and where it is (Google: /place/Name/@lat,lng and !3d!4d; 高德: position=lng,lat,
   p=id,lat,lng,name; Apple: q=, ll=) */
export function readLink(u: string): Found & { from?: Pin['from'] } {
  let url: URL;
  try { url = new URL(u); } catch { return { name: '' }; }
  const q = url.searchParams;
  if (/consent\.google/.test(url.host) && q.get('continue')) return readLink(q.get('continue')!);
  const from = fromOf(u);
  let name = '', lat: number | undefined, lng: number | undefined, address: string | undefined;
  if (from === 'google') {
    name = dec(/\/place\/([^/@]+)/.exec(url.pathname)?.[1] ?? '');
    const d = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(u) ?? /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(u);
    if (d) { lat = +d[1]; lng = +d[2]; }
    const qq = q.get('q') ?? q.get('query');
    if (qq) { const ll = /^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/.exec(qq); if (ll) { lat = +ll[1]; lng = +ll[2]; } else if (!name) name = qq; }
  } else if (from === 'amap') {
    const pos = q.get('position') ?? /lnglat=([\d.]+,[\d.]+)/.exec(u)?.[1];
    if (pos) { const [a, b] = pos.split(','); lng = num(a); lat = num(b); }
    const p = q.get('p')?.split(',');
    if (p && p.length >= 4) { lat = lat ?? num(p[1]); lng = lng ?? num(p[2]); name = p[3] ?? ''; address = p[4] || undefined; }
    const qq = q.get('q')?.split(',');
    if (qq && qq.length >= 3 && num(qq[0]) !== undefined) { lat = lat ?? num(qq[0]); lng = lng ?? num(qq[1]); name = name || qq[2]; }
    name = name || q.get('name') || q.get('keywords') || '';
  } else if (from === 'apple') {
    name = q.get('q') ?? q.get('name') ?? '';
    const ll = (q.get('ll') ?? q.get('sll') ?? q.get('coordinate') ?? '').split(',');
    lat = num(ll[0]); lng = num(ll[1]);
    address = q.get('address') ?? undefined;
  }
  return { name: name.trim(), lat, lng, address, from };
}

/* the name a shared message gives a place, around its link: 「【高德地图】星巴克(南京西路店) 地址：…」, "Blue Bottle Coffee\nhttps://…" */
export function nameAround(text: string, link: string) {
  const rest = text.replace(link, '\n').split('\n').map((s) => s
    .replace(/【[^】]*】|\[[^\]]*\]/g, '')
    .replace(/^.*?(发现了一个好地方|分享(给你)?(一个)?(地点|位置)|位置|地点)[：:]\s*/, '')
    .replace(/(地址|电话|Address|Phone)[：:].*$/i, '')
    .replace(/(复制|打开|点击).*(链接|App|查看).*$/i, '')
    .trim()).filter((s) => s.length > 1 && !/^https?:/i.test(s));
  return rest[0] ?? '';
}

/* a pasted link (or a message with one in it) as a place: short links are followed to the full one, the name and spot
   read from it, then looked up in Apple Maps by name near that spot for its address. The link itself is kept. */
export async function fromLink(text: string): Promise<(Found & { url: string; from?: Pin['from'] }) | null> {
  const link = linkIn(text);
  if (!link) return null;
  /* where a short link leads: asked with HEAD first, so the map page itself isn't downloaded; GET when HEAD isn't answered */
  let full = link;
  for (const method of ['HEAD', 'GET']) {
    try { const r: Response = await fetch(link, { method }); if (r.url && r.url !== link) { full = r.url; break; } if (r.ok) break; } catch { /* try the next way */ }
  }
  const got = readLink(full);
  const name = got.name || nameAround(text, link);
  const at = got.lat !== undefined && got.lng !== undefined ? { lat: got.lat, lng: got.lng } : null;
  const hits = name ? await search(name, at) : [];
  const best = hits.find((h) => !at || h.lat === undefined || dist(at, h as { lat: number; lng: number }) < 3) ?? (at ? undefined : hits[0]);
  return {
    name: name || best?.name || '',
    address: best?.address ?? got.address,
    lat: best?.lat ?? got.lat, lng: best?.lng ?? got.lng,
    url: link, from: got.from ?? fromOf(link),
  };
}
/* km between two spots (close enough for "is this the same place") */
function dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = Math.PI / 180, x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k), y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * 6371;
}

/* the card's small maps, light and dark, made on the phone (kept as paths inside Documents) */
export async function mapsFor(f: Found): Promise<Pin['map']> {
  if (!LoreVision?.mapSnapshot || f.lat === undefined || f.lng === undefined) return undefined;
  const one = async (dark: boolean) => {
    try {
      const uri = await LoreVision!.mapSnapshot!(f.lat!, f.lng!, 320, 180, dark);
      return uri.slice(uri.indexOf('places/'));
    } catch { return undefined; }
  };
  const [light, dark] = await Promise.all([one(false), one(true)]);
  return light || dark ? { light, dark } : undefined;
}

/* where a tap goes: the link it came from, or Apple Maps at the place */
export function openPin(p: Pin) {
  const ll = p.lat !== undefined && p.lng !== undefined ? `&ll=${p.lat},${p.lng}` : '';
  const url = p.url ?? `https://maps.apple.com/?q=${encodeURIComponent(p.name)}${ll}`;
  Linking.openURL(url).catch(() => {});
}

export const FROM: Record<NonNullable<Pin['from']>, { zh: string; en: string }> = {
  google: { zh: 'Google 地图', en: 'Google Maps' }, amap: { zh: '高德地图', en: 'Amap' }, apple: { zh: 'Apple 地图', en: 'Apple Maps' },
};
