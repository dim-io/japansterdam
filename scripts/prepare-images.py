"""Build responsive public images, without changing originals or CMS content."""
import concurrent.futures, html, io, json, pathlib, re, subprocess, urllib.parse
from PIL import Image, ImageOps
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'.site-dist/assets/optimized'
API='https://japansterdam-api.sam-jesse.workers.dev'
def download(url):
    return subprocess.check_output(['curl','--fail','--silent','--show-error','--location','--max-time','25','--max-filesize','12582912',url])
provenance=json.loads((ROOT/'api/web/image-provenance.json').read_text())
confirmed_generated=set(provenance['trainedAlgorithmicMedia'])
AI_XMP=b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></rdf:RDF></x:xmpmeta>'
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
editorial_hosts={'substackcdn.com','images.squarespace-cdn.com','images.metmuseum.org','world-fn.com','image-cdn.hypb.st','www.couvertureandthegarbstore.com','nepenthes.co.jp','media.gqjapan.jp','cdn.shopify.com','go.wool.com','old.mu.nl'}
def editorial_key(url):
    value=14695981039346656037
    for byte in url.encode('utf-8'):value=((value^byte)*1099511628211)&0xffffffffffffffff
    return f'{value:016x}'
try:
    content=json.loads(download(API+'/public/content'))
    for article in content.get('journal',{}).get('articles',[]):
        if article.get('published') is not True: continue
        urls=[article.get('cover','')]+re.findall(r'<img\b[^>]*\bsrc=[\"\x27]([^\"\x27]+)',article.get('bodyHtml',''),re.I)
        for raw in urls:
            url=html.unescape(raw);parsed=urllib.parse.urlsplit(url)
            if parsed.scheme=='https' and parsed.hostname in editorial_hosts and not parsed.username and not parsed.password:
                sources['editorial/'+editorial_key(url)]=url
except Exception as e:
    print('Editorial images use their original URLs until the next build:',type(e).__name__)
def prepare(entry):
    name,source=entry
    try:
        data=download(source) if isinstance(source,str) else source.read_bytes()
        with Image.open(io.BytesIO(data)) as original:
            xmp=original.info.get('xmp',b'')
            if name.startswith('uploads/') and 'products/'+name.removeprefix('uploads/') in confirmed_generated and b'DigitalSourceType' not in xmp:
                if xmp: # Preserve the existing packet and add the missing property.
                    xmp=xmp.replace(b'</rdf:RDF>',AI_XMP.split(b'<rdf:RDF',1)[1].split(b'>',1)[1].split(b'</rdf:RDF>',1)[0]+b'</rdf:RDF>',1)
                else: xmp=AI_XMP
            metadata={'xmp':xmp} if xmp else {}
            if original.info.get('icc_profile'): metadata['icc_profile']=original.info['icc_profile']
            image=ImageOps.exif_transpose(original)
            image=image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
            for width in (320,480,768,960):
                target=OUT/(name+'-'+str(width)+'.webp');target.parent.mkdir(parents=True,exist_ok=True)
                resized=image.resize((width,round(image.height*width/image.width)),Image.Resampling.LANCZOS)
                resized.save(target,'WEBP',quality=82 if width==960 else 78,method=4,**metadata)
        return True
    except Exception as e:
        print('Using original for',name,':',type(e).__name__);return False
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    results=list(pool.map(prepare,sources.items()))
print('Prepared responsive variants for',sum(results),'of',len(results),'public images')
