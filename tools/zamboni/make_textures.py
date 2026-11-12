"""Builds the KC Scouts / BRING HOCKEY TO KC decal textures for the Zamboni model (sharp, transparent PNGs; they are applied to the vehicle only).
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

def text_layer(lines, size, width, height, spacing, align="left", outline=0):
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = ImageFont.truetype(FONT, size)
    y = 0
    for ln in lines:
        bbox = d.textbbox((0, 0), ln, font=f)
        x = 0 if align == "left" else (width - (bbox[2] - bbox[0])) // 2 - bbox[0]
        if outline:
            for dx in range(-outline, outline + 1):
                for dy in range(-outline, outline + 1):
                    d.text((x + dx, y + dy), ln, font=f, fill=(9, 24, 72, 255))
        d.text((x, y), ln, font=f, fill=WHITE)
        y += size * spacing
    return italic(layer)

def side():
    W, H = 2048, 800
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    logo = Image.open(LOGO).convert("RGBA")
    d = int(H * 0.94)
    logo = logo.resize((d, d), Image.LANCZOS)
    # a white disc just behind the logo keeps its round shape crisp on the blue paint
    img.alpha_composite(logo, (int(W * 0.015), (H - d) // 2))
    tl = text_layer(["BRING", "HOCKEY", "TO KC"], 240, 1300, 760, 1.04, outline=6)
    img.alpha_composite(tl, (int(W * 0.015) + d + 70, 14))
    img.save(os.path.join(OUT, "decal_side.png"), optimize=True)

def rear():
    W, H = 2048, 1100
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    tl = text_layer(["BRING", "HOCKEY", "TO KC"], 330, 1700, 1100, 1.0, align="center", outline=7)
    img.alpha_composite(tl, ((W - tl.size[0]) // 2 + 20, 0))
    img.save(os.path.join(OUT, "decal_rear.png"), optimize=True)

side(); rear()
print("textures in", OUT)
