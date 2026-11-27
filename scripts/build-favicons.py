"""Export the existing three-cross brand mark as deterministic search/browser icons."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/icons'
BACKGROUND = '#f3efe6'
RED = '#c8202a'
# A heavier small-size silhouette than the full embroidered wordmark.
# The three horizontal crosses remain inside a circular search-result crop.
CROSSES = [((x - 6, 25), (x + 6, 39), (x + 6, 25), (x - 6, 39)) for x in (13, 32, 51)]
SCALE = 8
master = Image.new('RGB', (512, 512), BACKGROUND)
draw = ImageDraw.Draw(master)
paths = []
for a, b, c, d in CROSSES:
    for start, end in ((a, b), (c, d)):
        draw.line(tuple((round(x*SCALE), round(y*SCALE)) for x, y in (start, end)), fill=RED, width=round(4.5*SCALE))
        paths.append(f'M{start[0]} {start[1]}L{end[0]} {end[1]}')
(OUT/'favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="'+BACKGROUND+'"/><path d="'+' '.join(paths)+'" fill="none" stroke="'+RED+'" stroke-width="4.5" stroke-linecap="butt"/></svg>\n')
for size in (16, 32, 48, 96, 192, 512):
    master.resize((size, size), Image.Resampling.LANCZOS).save(OUT/f'favicon-{size}.png', optimize=True)
master.resize((180,180), Image.Resampling.LANCZOS).save(OUT/'apple-touch-icon.png', optimize=True)
master.save(OUT/'favicon.ico', sizes=[(16,16),(32,32),(48,48),(64,64)])
print('Exported favicon PNGs, SVG, ICO and Apple touch icon')
