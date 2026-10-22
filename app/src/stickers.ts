/* The sticker set: illustrated everyday objects with a white die-cut edge, drawn for Lore. Stickers made from the
   person's own photos (cut out on the phone) are kept as files and named 'file:<path inside Documents>'. */
import { fileUri } from './store';

export type SetSticker = { name: string; src: number };
/* drawn in Lovart (GPT Image 2.5) from a Pinterest brief: risograph grain, warm ink outline, the app's red, teal and ochre;
   everyday city things first (coffee to go, a laptop, a museum), no brand marks */
export const SET: SetSticker[] = [
  { name: 'matcha', src: require('../assets/stickers/matcha.webp') },
  { name: 'takeaway', src: require('../assets/stickers/takeaway.webp') },
  { name: 'icedlatte', src: require('../assets/stickers/icedlatte.webp') },
  { name: 'tumbler', src: require('../assets/stickers/tumbler.webp') },
  { name: 'avotoast', src: require('../assets/stickers/avotoast.webp') },
  { name: 'croissant', src: require('../assets/stickers/croissant.webp') },
  { name: 'egg', src: require('../assets/stickers/egg.webp') },
  { name: 'ramen', src: require('../assets/stickers/ramen.webp') },
  { name: 'laptop', src: require('../assets/stickers/laptop.webp') },
  { name: 'phone', src: require('../assets/stickers/phone.webp') },
  { name: 'tablet', src: require('../assets/stickers/tablet.webp') },
  { name: 'watch', src: require('../assets/stickers/watch.webp') },
  { name: 'headset', src: require('../assets/stickers/headset.webp') },
  { name: 'earbuds', src: require('../assets/stickers/earbuds.webp') },
  { name: 'mirrorless', src: require('../assets/stickers/mirrorless.webp') },
  { name: 'concert', src: require('../assets/stickers/concert.webp') },
  { name: 'controller', src: require('../assets/stickers/controller.webp') },
  { name: 'mic', src: require('../assets/stickers/mic.webp') },
  { name: 'gallery', src: require('../assets/stickers/gallery.webp') },
  { name: 'artwall', src: require('../assets/stickers/artwall.webp') },
  { name: 'bust', src: require('../assets/stickers/bust.webp') },
  { name: 'popcorn', src: require('../assets/stickers/popcorn.webp') },
  { name: 'window', src: require('../assets/stickers/window.webp') },
  { name: 'suitcase', src: require('../assets/stickers/suitcase.webp') },
  { name: 'scooter', src: require('../assets/stickers/scooter.webp') },
  { name: 'bicycle', src: require('../assets/stickers/bicycle.webp') },
  { name: 'tennis', src: require('../assets/stickers/tennis.webp') },
  { name: 'yogamat', src: require('../assets/stickers/yogamat.webp') },
  { name: 'chunky', src: require('../assets/stickers/chunky.webp') },
  { name: 'cap', src: require('../assets/stickers/cap.webp') },
  { name: 'sunglasses', src: require('../assets/stickers/sunglasses.webp') },
  { name: 'tote', src: require('../assets/stickers/tote.webp') },
  { name: 'plant', src: require('../assets/stickers/plant.webp') },
  { name: 'books', src: require('../assets/stickers/books.webp') },
  { name: 'lamp', src: require('../assets/stickers/lamp.webp') },
  { name: 'key', src: require('../assets/stickers/key.webp') },
];

/* where a sticker's picture comes from */
export function stickerSrc(s: string): number | { uri: string } | undefined {
  if (s.startsWith('set:')) return SET.find((x) => x.name === s.slice(4))?.src;
  if (s.startsWith('file:')) return { uri: fileUri(s.slice(5)) };
  return undefined;
}
