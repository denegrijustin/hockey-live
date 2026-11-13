"""Builds the KC Scouts / BRING NHL TO KC decal textures for the Zamboni model (sharp, transparent PNGs; they are applied to the vehicle only).
   python3 tools/zamboni/make_textures.py <out_dir>"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/zam/tex"
os.makedirs(OUT, exist_ok=True)
LOGO = os.path.join(os.path.dirname(__file__), "../../public/logos/vintage/kansas-city-scouts-1974-hyhk1nf6yl2e5aflm7sxagthl.png")
FONT = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
WHITE = (255, 255, 255, 255)

def italic(img, shear=0.2):
    w, h = img.size
    pad = int(h * shear)
    out = img.transform((w + pad, h), Image.AFFINE, (1, shear, -pad, 0, 1, 0), resample=Image.BICUBIC)
    return out

GOLD = (255, 205, 70, 255)
NAVY = (9, 24, 72, 255)

def text_layer(lines, size, width, height, spacing, align="left", outline=0, colors=None):
    """White (or per-line coloured) italic text with a navy outline, so it holds up on the blue paint at any distance."""
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = ImageFont.truetype(FONT, size)
    y = 0
    for i, ln in enumerate(lines):
        bbox = d.textbbox((0, 0), ln, font=f)
        x = 0 if align == "left" else (width - (bbox[2] - bbox[0])) // 2 - bbox[0]
        if outline:
            for dx in range(-outline, outline + 1):
                for dy in range(-outline, outline + 1):
                    if dx * dx + dy * dy <= outline * outline: d.text((x + dx, y + dy), ln, font=f, fill=NAVY)
        d.text((x, y), ln, font=f, fill=(colors[i] if colors else WHITE))
        y += size * spacing
    return italic(layer)

def disc_logo(d):
    logo = Image.open(LOGO).convert("RGBA").resize((d, d), Image.LANCZOS)
    # a white ring just outside the logo keeps its round shape crisp on the blue paint
    ring = Image.new("RGBA", (d + 24, d + 24), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse((0, 0, d + 23, d + 23), fill=(255, 255, 255, 255))
    ring.alpha_composite(logo, (12, 12))
    return ring

def side():
    """BRING / NHL / TO KC with the Scouts logo: the side of the snow tank (about 5.8 ft by 2.3 ft)."""
    W, H = 2048, 812
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = int(H * 0.92)
    lg = disc_logo(d)
    img.alpha_composite(lg, (int(W * 0.012), (H - lg.size[1]) // 2))
    tl = text_layer(["BRING", "NHL", "TO KC"], 252, 1330, 800, 0.99, outline=8, colors=[WHITE, GOLD, WHITE])
    img.alpha_composite(tl, (int(W * 0.012) + lg.size[0] + 50, 6))
    img.save(os.path.join(OUT, "decal_side.png"), optimize=True)

def rear():
    W, H = 2048, 1100
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    tl = text_layer(["BRING", "NHL", "TO KC"], 360, 1700, 1100, 0.96, align="center", outline=10, colors=[WHITE, GOLD, WHITE])
    img.alpha_composite(tl, ((W - tl.size[0]) // 2 + 20, 0))
    img.save(os.path.join(OUT, "decal_rear.png"), optimize=True)

def top():
    """The flat top of the machine, seen from above: the Scouts logo and BRING NHL TO KC, large (about 5.4 ft by 5.8 ft)."""
    W, H = 1800, 1940
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    lg = disc_logo(900)
    img.alpha_composite(lg, ((W - lg.size[0]) // 2, 30))
    # two lines, with NHL in gold: the first line is drawn in two parts
    layer = Image.new("RGBA", (1760, 820), (0, 0, 0, 0)); d = ImageDraw.Draw(layer); f = ImageFont.truetype(FONT, 330)
    def put(txt, x, y, col):
        for dx in range(-10, 11):
            for dy in range(-10, 11):
                if dx * dx + dy * dy <= 100: d.text((x + dx, y + dy), txt, font=f, fill=NAVY)
        d.text((x, y), txt, font=f, fill=col)
    wb = d.textlength("BRING ", font=f); wn = d.textlength("NHL", font=f); total = wb + wn
    x0 = (1760 - total) / 2
    put("BRING ", x0, 0, WHITE); put("NHL", x0 + wb, 0, GOLD)
    wt = d.textlength("TO KC", font=f); put("TO KC", (1760 - wt) / 2, 360, WHITE)
    layer = italic(layer, 0.12)
    img.alpha_composite(layer, ((W - layer.size[0]) // 2, 1000))
    img.save(os.path.join(OUT, "decal_top.png"), optimize=True)

side(); rear(); top()
print("textures in", OUT)
