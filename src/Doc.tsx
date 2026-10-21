import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Badge, Mosaic } from './Photos';
import { Pic, Said, Unit } from './session';
import { SZ } from './theme';
import { useFace, useLang, useS, useT } from './ui';

const src = (p: Pic) => (p.uri ? { uri: p.uri } : p.asset);
const tagOf = (u: Unit) => (u.idx.length > 1 ? `${u.idx[0] + 1}–${u.idx[u.idx.length - 1] + 1}` : String(u.idx[0] + 1));

function useTx() {
  const t = useT();
  const face = useFace();
  const zh = useLang() === 'zh';
  return [zh ? d.tx : d.txEn, { color: t.ink, fontFamily: face.body }];
}

/* Before layout: only the tidied words, and the photos they were said about, in the order they were said. */
export function Stream({ items, photos }: { items: Said[]; photos: Pic[] }) {
  const tx = useTx();
  return (
    <View style={{ gap: 16 }}>
      {items.map((x, i) => x.kind === 'talk' ? <Text key={i} style={tx}>{x.text}</Text> : (
        <View key={i} style={{ gap: 12 }}>
          {x.parts.map((p, j) => (
            <View key={j} style={d.row}>
              <View>
                {p.unit.idx.length > 1
                  ? <Mosaic pics={p.unit.idx.map((k) => photos[k]).filter(Boolean)} w={52} h={52} r={SZ.tileR} />
                  : photos[p.unit.idx[0]] ? <Image source={src(photos[p.unit.idx[0]])} contentFit="cover" style={d.th} /> : null}
                <Badge text={tagOf(p.unit)} />
              </View>
              <Text style={[tx, { flex: 1 }]}>{p.text}</Text>
            </View>
          ))}
        </View>
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
  const inner = Dimensions.get('window').width - 24 - 40;
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
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  th: { width: 52, height: 52, borderRadius: SZ.tileR },
  page: { borderRadius: SZ.panelR, padding: 20 },
  cover: { height: 120, borderRadius: SZ.panelR - 8, marginBottom: 18 },
  title: { fontSize: 25, lineHeight: 35 },
  titleEn: { fontSize: 29, lineHeight: 35, letterSpacing: -0.3 },
  meta: { fontSize: 13, marginTop: 6 },
  one: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14 },
});
