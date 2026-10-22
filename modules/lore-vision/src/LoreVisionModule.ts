import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class LoreVisionModule extends NativeModule<{}> {
  /* the subject of a photo cut out with a white sticker edge, saved as a PNG; null when there is no clear subject */
  lift(uri: string): Promise<string | null>;
}

/* optional: an app installed before this module existed still runs the same JS update, just without it */
export default requireOptionalNativeModule<LoreVisionModule>('LoreVision');
