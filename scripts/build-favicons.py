"""Export favicons from the exact embroidered crosses in the original logo PNG."""
import base64
import io
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/icons'
BACKGROUND = '#f3efe6'
# The existing transparent wordmark contains the original red thread artwork.
# Crop only that artwork; never redraw, recolour, separate or rearrange crosses.
SOURCE = ROOT / 'assets/img/site/header-logo.png'
CROP = (517, 26, 702, 82)
crosses = Image.open(SOURCE).convert('RGBA').crop(CROP)
master = Image.new('RGBA', (512, 512), BACKGROUND)
width = 460
height = round(width * crosses.height / crosses.width)
resized = crosses.resize((width, height), Image.Resampling.LANCZOS)
master.alpha_composite(resized, ((512-width)//2, (512-height)//2))
master = master.convert('RGB')
# Keep the legacy SVG URL faithful too, embedding the original cropped pixels.
png = io.BytesIO()
crosses.save(png, 'PNG', optimize=True)
encoded = base64.b64encode(png.getvalue()).decode('ascii')
(OUT/'favicon.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="{BACKGROUND}"/><image x="{(512-width)//2}" y="{(512-height)//2}" width="{width}" height="{height}" href="data:image/png;base64,{encoded}"/></svg>\n')
for size in (16, 32, 48, 96, 192, 512):
    master.resize((size, size), Image.Resampling.LANCZOS).save(OUT/f'favicon-{size}.png', optimize=True)
master.resize((180,180), Image.Resampling.LANCZOS).save(OUT/'apple-touch-icon.png', optimize=True)
master.save(OUT/'favicon.ico', sizes=[(16,16),(32,32),(48,48),(64,64)])
print('Exported favicons using the original embroidered cross pixels')
