"""Build responsive public images, without changing originals or CMS content."""
import concurrent.futures, io, json, pathlib, subprocess
from PIL import Image, ImageOps
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'.site-dist/assets/optimized'
API='https://japansterdam-api.sam-jesse.workers.dev'
def download(url):
    return subprocess.check_output(['curl','--fail','--silent','--show-error','--location','--max-time','25','--max-filesize','12582912',url])
sources={}
for p in (ROOT/'assets/img').rglob('*'):
    if p.is_file() and p.suffix.lower() in {'.jpg','.jpeg','.png','.webp'} and not any(x.startswith('.') for x in p.relative_to(ROOT/'assets/img').parts):
        sources['local/'+p.relative_to(ROOT/'assets/img').as_posix()]=p
try:
    products=json.loads(download(API+'/public/products'))
    for product in products:
        if product.get('active') is False: continue
        for url in product.get('images',[]):
            prefix=API+'/img/products/'
            if url.startswith(prefix):
                name=url[len(prefix):]
                if '/' not in name and '?' not in name and all(c.isalnum() or c in '._-' for c in name): sources['uploads/'+name]=url
except Exception as e:
    print('Live image catalogue unavailable; existing image URLs remain the fallback:',type(e).__name__)
def prepare(entry):
    name,source=entry
    try:
        data=download(source) if isinstance(source,str) else source.read_bytes()
        with Image.open(io.BytesIO(data)) as original:
            image=ImageOps.exif_transpose(original)
            image=image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
            for width in (480,960):
                target=OUT/(name+'-'+str(width)+'.webp');target.parent.mkdir(parents=True,exist_ok=True)
                resized=image.resize((width,round(image.height*width/image.width)),Image.Resampling.LANCZOS)
                resized.save(target,'WEBP',quality=82,method=4)
        return True
    except Exception as e:
        print('Using original for',name,':',type(e).__name__);return False
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    results=list(pool.map(prepare,sources.items()))
print('Prepared responsive variants for',sum(results),'of',len(results),'public images')
