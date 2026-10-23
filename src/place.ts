/* Where a day was written: the neighbourhood or city, found once on the day's first writing when the person has turned
   "Record where you write" on. Only the place's name is kept, on the phone. The location module is loaded only when the
   installed app has it, so an older app still runs the same update. */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type Loc = typeof import('expo-location');
const loc: Loc | null = Platform.OS !== 'web' && requireOptionalNativeModule('ExpoLocation')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when the native side is there
  ? require('expo-location') : null;

export const canPlace = !!loc;

/* asks once for "while using the app"; true when allowed */
export async function askPlace(): Promise<boolean> {
  if (!loc) return false;
  try { return (await loc.requestForegroundPermissionsAsync()).granted; } catch { return false; }
}

/* the name of where the phone is now: neighbourhood and city ("Williamsburg, Brooklyn"), or null */
export async function wherePlace(): Promise<string | null> {
  if (!loc) return null;
  try {
    if (!(await loc.getForegroundPermissionsAsync()).granted) return null;
    const at = await loc.getCurrentPositionAsync({ accuracy: loc.Accuracy.Low });
    const [a] = await loc.reverseGeocodeAsync({ latitude: at.coords.latitude, longitude: at.coords.longitude });
    if (!a) return null;
    const parts = [a.district, a.city ?? a.subregion].filter((x): x is string => !!x);
    return [...new Set(parts)].join(', ') || a.region || null;
  } catch { return null; }
}
