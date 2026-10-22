/* The sticker set: illustrated everyday objects with a white die-cut edge, drawn for Lore. Stickers made from the
   person's own photos (cut out on the phone) are kept as files and named 'file:<path inside Documents>'. */
import { fileUri } from './store';

export type SetSticker = { name: string; src: number };
/* drawn in Lovart (GPT Image 2.5) from a Pinterest brief: risograph grain, warm ink outline, the app's red, teal and ochre;
   everyday city things first (coffee to go, a laptop, a museum), no brand marks */
export const SET: SetSticker[] = [
  { name: 'takeaway', src: require('../assets/stickers/takeaway.webp') },
  { name: 'coffee', src: require('../assets/stickers/coffee.webp') },
  { name: 'icedlatte', src: require('../assets/stickers/icedlatte.webp') },
  { name: 'bubbletea', src: require('../assets/stickers/bubbletea.webp') },
  { name: 'croissant', src: require('../assets/stickers/croissant.webp') },
  { name: 'egg', src: require('../assets/stickers/egg.webp') },
  { name: 'ramen', src: require('../assets/stickers/ramen.webp') },
  { name: 'laptop', src: require('../assets/stickers/laptop.webp') },
  { name: 'phone', src: require('../assets/stickers/phone.webp') },
  { name: 'earbuds', src: require('../assets/stickers/earbuds.webp') },
  { name: 'camera', src: require('../assets/stickers/camera.webp') },
  { name: 'instant', src: require('../assets/stickers/instant.webp') },
  { name: 'vinyl', src: require('../assets/stickers/vinyl.webp') },
  { name: 'mic', src: require('../assets/stickers/mic.webp') },
  { name: 'controller', src: require('../assets/stickers/controller.webp') },
  { name: 'museum', src: require('../assets/stickers/museum.webp') },
  { name: 'bust', src: require('../assets/stickers/bust.webp') },
  { name: 'painting', src: require('../assets/stickers/painting.webp') },
  { name: 'popcorn', src: require('../assets/stickers/popcorn.webp') },
  { name: 'boarding', src: require('../assets/stickers/boarding.webp') },
  { name: 'books', src: require('../assets/stickers/books.webp') },
  { name: 'lamp', src: require('../assets/stickers/lamp.webp') },
  { name: 'tote', src: require('../assets/stickers/tote.webp') },
  { name: 'sunglasses', src: require('../assets/stickers/sunglasses.webp') },
  { name: 'key', src: require('../assets/stickers/key.webp') },
  { name: 'plant', src: require('../assets/stickers/plant.webp') },
  { name: 'bicycle', src: require('../assets/stickers/bicycle.webp') },
];

/* where a sticker's picture comes from */
export function stickerSrc(s: string): number | { uri: string } | undefined {
  if (s.startsWith('set:')) return SET.find((x) => x.name === s.slice(4))?.src;
  if (s.startsWith('file:')) return { uri: fileUri(s.slice(5)) };
  return undefined;
}
