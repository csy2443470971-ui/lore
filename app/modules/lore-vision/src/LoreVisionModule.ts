import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class LoreVisionModule extends NativeModule<{}> {
  /* the subject of a photo cut out with a white sticker edge, saved as a PNG; null when there is no clear subject */
  lift(uri: string): Promise<string | null>;
  /* the object inside a circled region (fractions of the photo, from its top left); only in the newer app */
  liftIn?(uri: string, x: number, y: number, w: number, h: number): Promise<string | null>;
  /* fonts Apple offers to download (by PostScript name); only in the newer app */
  fontReady?(name: string): boolean;
  fetchFont?(names: string[]): Promise<boolean>;
  /* places from Apple Maps, and a small map of one with its pin (a PNG file); only in the newer app */
  searchPlaces?(query: string, lat?: number | null, lng?: number | null): Promise<{ name: string; address?: string; lat: number; lng: number }[]>;
  mapSnapshot?(lat: number, lng: number, w: number, h: number, dark: boolean): Promise<string>;
}

/* optional: an app installed before this module existed still runs the same JS update, just without it */
export default requireOptionalNativeModule<LoreVisionModule>('LoreVision');
