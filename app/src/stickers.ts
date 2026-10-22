/* The sticker set: illustrated everyday objects with a white die-cut edge, drawn for Lore. Stickers made from the
   person's own photos (cut out on the phone) are kept as files and named 'file:<path inside Documents>'. */
import { fileUri } from './store';

export type SetSticker = { name: string; src: number };
/* drawn in Lovart (GPT Image 2.5) from a Pinterest brief: risograph grain, warm ink outline, the app's red, teal and ochre */
export const SET: SetSticker[] = [
  { name: 'coffee', src: require('../assets/stickers/coffee.webp') },
  { name: 'croissant', src: require('../assets/stickers/croissant.webp') },
  { name: 'egg', src: require('../assets/stickers/egg.webp') },
  { name: 'lemon', src: require('../assets/stickers/lemon.webp') },
  { name: 'ramen', src: require('../assets/stickers/ramen.webp') },
  { name: 'camera', src: require('../assets/stickers/camera.webp') },
  { name: 'cassette', src: require('../assets/stickers/cassette.webp') },
  { name: 'headphones', src: require('../assets/stickers/headphones.webp') },
  { name: 'books', src: require('../assets/stickers/books.webp') },
  { name: 'letter', src: require('../assets/stickers/letter.webp') },
  { name: 'ticket', src: require('../assets/stickers/ticket.webp') },
  { name: 'key', src: require('../assets/stickers/key.webp') },
  { name: 'plant', src: require('../assets/stickers/plant.webp') },
  { name: 'tulip', src: require('../assets/stickers/tulip.webp') },
  { name: 'umbrella', src: require('../assets/stickers/umbrella.webp') },
  { name: 'bicycle', src: require('../assets/stickers/bicycle.webp') },
  { name: 'sneaker', src: require('../assets/stickers/sneaker.webp') },
];

/* where a sticker's picture comes from */
export function stickerSrc(s: string): number | { uri: string } | undefined {
  if (s.startsWith('set:')) return SET.find((x) => x.name === s.slice(4))?.src;
  if (s.startsWith('file:')) return { uri: fileUri(s.slice(5)) };
  return undefined;
}
