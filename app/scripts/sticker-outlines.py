"""Writes src/outlines.ts: the outline of each sticker in assets/stickers, so the words on a page can wrap around its
shape instead of its box. For each sticker: its width over its height, and for 24 horizontal bands from top to bottom
the leftmost and rightmost opaque point (as fractions of its width), or None where the band is empty.

Run after adding or changing stickers:  python3 scripts/sticker-outlines.py
"""
import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'assets', 'stickers')
OUT = os.path.join(HERE, '..', 'src', 'outlines.ts')
BANDS = 24

out = {}
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.webp'):
        continue
    a = np.asarray(Image.open(os.path.join(SRC, f)).convert('RGBA'))[..., 3] > 96
    h, w = a.shape
    rows = []
    for i in range(BANDS):
        band = a[int(i * h / BANDS):max(int((i + 1) * h / BANDS), int(i * h / BANDS) + 1)]
        cols = np.where(band.any(axis=0))[0]
        rows.append([round(cols[0] / w, 3), round((cols[-1] + 1) / w, 3)] if len(cols) else None)
    out[f[:-5]] = {'a': round(w / h, 3), 'rows': rows}

with open(OUT, 'w') as fh:
    fh.write('/* Made by scripts/sticker-outlines.py from assets/stickers: each sticker\'s width over height, and for 24 bands\n')
    fh.write('   from top to bottom where it starts and ends across (fractions of its width), null where the band is empty.\n')
    fh.write('   The words on a page wrap around this outline. */\n')
    fh.write('export const OUTLINES: Record<string, { a: number; rows: ([number, number] | null)[] }> = ' + json.dumps(out, separators=(',', ':')) + ';\n')
print(len(out), 'outlines')
