import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Mosaic } from './Photos';
import { Pic, Said } from './session';
import { SZ } from './theme';
import { useFace, useLang, useS, useT } from './ui';

const src = (p: Pic) => (p.uri ? { uri: p.uri } : p.asset);

function useTx() {
  const t = useT();
  const face = useFace();
  const zh = useLang() === 'zh';
  return [zh ? d.tx : d.txEn, { color: t.ink, fontFamily: face.body }];
}

/* Before layout: only the tidied words, in the order they were said. Photos aren't matched to sentences yet;
   the spoken numbers ("one is…") stay in the text and are matched to photos at Lay out. */
export function Stream({ items }: { items: Said[] }) {
  const S = useS();
  const tx = useTx();
  return (
    <View style={{ gap: 16 }}>
      {items.map((x, i) => (
        <Text key={i} style={tx}>
          {x.kind === 'talk' ? x.text : x.parts.map((p) => S.rangeWord(p.unit.idx[0] + 1, p.unit.idx[p.unit.idx.length - 1] + 1, S.numWord) + S.is + p.text).join(S.is === '是' ? '' : ' ')}
        </Text>
      ))}
    </View>
  );
}

/* After the person taps Lay out: the same words and photos set as a page. */
export function Page({ items, photos }: { items: Said[]; photos: Pic[] }) {
  const t = useT();
  const S = useS();
  const face = useFace();
  const zh = useLang() === 'zh';
  const tx = useTx();
  const inner = Dimensions.get('window').width - 2 * SZ.px - 40;
  const first = items.flatMap((x) => (x.kind === 'photos' ? x.parts.map((p) => p.unit.idx[0]) : []))[0];
  const cover = first !== undefined ? photos[first] : undefined;
  return (
    <View style={[d.page, { backgroundColor: t.panel }]}>
      {cover ? <Image source={src(cover)} contentFit="cover" style={d.cover} /> : null}
      <Text style={[zh ? d.title : d.titleEn, { color: t.ink, fontFamily: face.title }]}>{S.todayTitle}</Text>
      <Text style={[d.meta, { color: t.mut }]}>{S.date}  ·  {S.nSaid(items.length)}</Text>
      <View style={{ gap: 20, marginTop: 20 }}>
        {items.map((x, i) => x.kind === 'talk' ? <Text key={i} style={tx}>{x.text}</Text> : (
          <View key={i} style={{ gap: 20 }}>
            {x.parts.map((p, j) => (
              <View key={j} style={{ gap: 10 }}>
                {p.unit.idx.length > 1
                  ? <Mosaic pics={p.unit.idx.map((k) => photos[k]).filter(Boolean)} w={inner} h={p.unit.idx.length >= 4 ? inner : inner / 2} r={14} />
                  : photos[p.unit.idx[0]] ? <Image source={src(photos[p.unit.idx[0]])} contentFit="cover" style={d.one} /> : null}
                <Text style={tx}>{p.text}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const d = StyleSheet.create({
  tx: { fontSize: 16, lineHeight: 29 },
  txEn: { fontSize: 17.5, lineHeight: 27 },
  page: { borderRadius: SZ.panelR, padding: 20 },
  cover: { height: 120, borderRadius: SZ.panelR - 8, marginBottom: 18 },
  title: { fontSize: 25, lineHeight: 35 },
  titleEn: { fontSize: 29, lineHeight: 35, letterSpacing: -0.3 },
  meta: { fontSize: 13, marginTop: 6 },
  one: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14 },
});
