/* not on the web: the preview has no subject lifting */
export default null as null | { lift(uri: string): Promise<string | null>; liftIn?(uri: string, x: number, y: number, w: number, h: number): Promise<string | null>; fontReady?(name: string): boolean; fetchFont?(names: string[]): Promise<boolean> };
