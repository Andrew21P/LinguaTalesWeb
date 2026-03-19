"""Generate the 1200×630 Open Graph image for social sharing."""
from PIL import Image, ImageDraw, ImageFont
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "og-image.png")

w, h = 1200, 630
img = Image.new("RGBA", (w, h), (38, 52, 43, 255))
draw = ImageDraw.Draw(img)

for y in range(h):
    a = int(30 * (y / h))
    draw.line([(0, y), (w, y)], fill=(254, 249, 238, a))

logo = Image.open(os.path.join(ROOT, "public", "logo.png")).convert("RGBA")
logo = logo.resize((280, 280), Image.LANCZOS)
img.paste(logo, (80, (h - 280) // 2), logo)

try:
    tf = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia Bold.ttf", 52)
    sf = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", 26)
except Exception:
    tf = ImageFont.load_default()
    sf = ImageFont.load_default()

calm = (254, 249, 238, 255)
sand = (229, 217, 198, 255)
mink = (165, 138, 123, 255)
tx = 420

draw.text((tx, 160), "Voxenor", fill=calm, font=tf)
draw.text((tx, 230), "Turn any book into", fill=sand, font=sf)
draw.text((tx, 268), "an audiobook.", fill=calm, font=sf)
draw.text((tx, 340), "PDF \u2022 EPUB \u2022 Any language in,", fill=mink, font=sf)
draw.text((tx, 378), "audiobook in your language out.", fill=mink, font=sf)
draw.text((tx, 450), "voxenor.com", fill=(229, 217, 198, 200), font=sf)

img.convert("RGB").save(OUT, optimize=True, quality=90)
print(f"OG image created: {os.path.getsize(OUT)} bytes")
