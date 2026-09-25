"""Slice transparent sprite sheets into individual trimmed PNGs.

Finds connected blobs in the alpha channel (after dilating so thin gaps inside
one sprite don't split it), orders them row-major, and writes name_N.png.
Usage: slice.py <sheet.png> <outprefix> [expected_count] [--rows]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def slice_sheet(src, prefix, expected=None, dilate=6, min_area=1500):
    im = Image.open(src).convert("RGBA")
    a = np.array(im)
    mask = a[..., 3] > 24
    grown = ndimage.binary_dilation(mask, iterations=dilate)
    labels, n = ndimage.label(grown)
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(labels), 1):
        if sl is None:
            continue
        area = int((labels[sl] == i).sum())
        if area < min_area:
            continue
        boxes.append((sl, i))
    # row-major ordering: group by vertical centre into rows
    def centre(b):
        sl = b[0]
        return ((sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2)
    boxes.sort(key=lambda b: centre(b)[0])
    rows, cur = [], []
    for b in boxes:
        if cur and centre(b)[0] - centre(cur[-1])[0] > (b[0][0].stop - b[0][0].start) * 0.5:
            rows.append(cur); cur = []
        cur.append(b)
    if cur:
        rows.append(cur)
    ordered = [b for r in rows for b in sorted(r, key=lambda b: centre(b)[1])]
    out = []
    for k, (sl, i) in enumerate(ordered):
        piece = a[sl].copy()
        piece[..., 3] = np.where(labels[sl] == i, piece[..., 3], 0)
        # zero RGB where transparent (kills the model's hidden glow halo)
        piece[piece[..., 3] < 8] = 0
        ys, xs = np.nonzero(piece[..., 3] > 8)
        piece = piece[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        p = Path(f"{prefix}_{k}.png")
        Image.fromarray(piece).save(p, optimize=True)
        out.append((p.name, piece.shape[1], piece.shape[0]))
    msg = f"{src}: {len(out)} sprites"
    if expected and len(out) != expected:
        msg += f"  (EXPECTED {expected}!)"
    print(msg)
    for o in out:
        print("   ", o)
    return out


if __name__ == "__main__":
    slice_sheet(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else None)
