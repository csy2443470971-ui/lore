/* not on the web: the preview has no subject lifting */
export default null as null | { lift(uri: string): Promise<string | null>; liftIn?(uri: string, x: number, y: number, w: number, h: number): Promise<string | null>; fontReady?(name: string): boolean; fetchFont?(names: string[]): Promise<boolean>;
  searchPlaces?(query: string, lat?: number | null, lng?: number | null): Promise<{ name: string; address?: string; lat: number; lng: number }[]>;
  mapSnapshot?(lat: number, lng: number, w: number, h: number, dark: boolean): Promise<string> };
