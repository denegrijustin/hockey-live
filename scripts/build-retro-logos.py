"""Builds public/logos/retro/<TEAM>.png from the originals in public/logos/vintage (see src/data/retro-logos.json for which original each team uses).

Each logo gets its white backdrop removed (flood fill from the edges, so white inside the mark stays), is trimmed, centred on a square transparent
canvas and scaled to SIZE px, then saved as a small optimised PNG. Run: python3 scripts/build-retro-logos.py
"""
import json, os, glob
from collections import deque
from PIL import Image

SIZE = 192
PAD = 0.06
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
picks = json.load(open(f"{ROOT}/src/data/retro-logos.json"))

def drop_backdrop(im):
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    near_white = lambda p: p[3] > 0 and p[0] > 236 and p[1] > 236 and p[2] > 236
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]:
            continue
        seen[y * w + x] = 1
        if not near_white(px[x, y]):
            continue
        px[x, y] = (255, 255, 255, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im

for team, info in picks.items():
    src = f"{ROOT}/public/logos/vintage/{info['file']}"
    im = drop_backdrop(Image.open(src))
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(box)
    side = round(max(im.size) * (1 + 2 * PAD))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    canvas = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    out = f"{ROOT}/public/logos/retro/{team}.png"
    canvas.save(out, optimize=True)
    canvas.quantize(colors=128, method=Image.FASTOCTREE).save(out, optimize=True)  # small palette PNG keeps the files ~10-20 KB
    # What the mark is mostly drawn in, so the app can put it on a contrasting chip: "dark" ink vanishes on a dark page, "light" ink on a light one.
    px = [p for p in Image.open(out).convert("RGBA").get_flattened_data() if p[3] > 128]
    lum = lambda p: (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255
    dark = sum(lum(p) < 0.1 for p in px) / len(px)
    light = sum(lum(p) > 0.85 for p in px) / len(px)
    info["ink"] = "dark" if dark > 0.22 and dark > light else "light" if light > 0.3 else "mixed"
    print(team, os.path.getsize(out) // 1024, "KB", info["ink"], round(dark, 2), round(light, 2))
json.dump(picks, open(f"{ROOT}/src/data/retro-logos.json", "w"), indent=1, ensure_ascii=False)
