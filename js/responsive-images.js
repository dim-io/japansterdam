// Original files remain available for zooming. Cloudflare serves small, built
// variants; new uploads fall back to their original until the next deployment.
const editorialHosts=new Set(['substackcdn.com','images.squarespace-cdn.com','images.metmuseum.org','world-fn.com','image-cdn.hypb.st','www.couvertureandthegarbstore.com','nepenthes.co.jp','media.gqjapan.jp','cdn.shopify.com','go.wool.com','old.mu.nl']);
export function editorialSource(src){
  try{const u=new URL(src);return u.protocol==='https:'&&!u.username&&!u.password&&editorialHosts.has(u.hostname)?u.href:null;}catch{return null;}
}
export function editorialKey(src){
  let hash=14695981039346656037n;
  for(const byte of new TextEncoder().encode(src))hash=BigInt.asUintN(64,(hash^BigInt(byte))*1099511628211n);
  return hash.toString(16).padStart(16,'0');
}
export function imageVariant(src, width) {
  try {
    const u = new URL(src, 'https://japansterdam.com/');
    const external=editorialSource(src);
    if(external)return '/assets/optimized/editorial/'+editorialKey(external)+'-'+width+'.webp?source='+encodeURIComponent(external);
    if (u.search || !/\.(?:jpe?g|png|webp)$/i.test(u.pathname)) return null;
    if (u.origin === 'https://japansterdam-api.sam-jesse.workers.dev' && /^\/img\/products\/[\w.-]+$/.test(u.pathname))
      return '/assets/optimized/uploads/' + u.pathname.split('/').pop() + '-' + width + '.webp';
    if (u.origin === 'https://japansterdam.com' && /^\/assets\/img\/[\w./-]+$/.test(u.pathname) && !u.pathname.includes('..'))
      return '/assets/optimized/local/' + u.pathname.slice('/assets/img/'.length) + '-' + width + '.webp';
  } catch {}
  return null;
}
export function responsiveAttrs(src, sizes = '(min-width:1100px) 24vw, (min-width:640px) 32vw, 50vw') {
  if (typeof document !== 'undefined' && !document.getElementById('jp-page-data')) return '';
  if (typeof location !== 'undefined' && location.hostname === 'dim-io.github.io') return '';
  const variants = [320,480,768,960].map(width => [imageVariant(src,width),width]);
  return variants.every(([url])=>url) ? ` srcset="${variants.map(([url,width])=>`${url} ${width}w`).join(', ')}" sizes="${sizes}"` : '';
}
