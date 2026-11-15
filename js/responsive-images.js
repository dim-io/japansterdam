// Original files remain available for zooming. Cloudflare serves small, built
// variants; new uploads fall back to their original until the next deployment.
export function imageVariant(src, width) {
  try {
    const u = new URL(src, 'https://japansterdam.com/');
    if (u.pathname.endsWith('/header-logo.png')) return null;
    if (u.search || !/\.(?:jpe?g|png|webp)$/i.test(u.pathname)) return null;
    if (u.origin === 'https://japansterdam-api.japansterdam-api.workers.dev' && /^\/img\/products\/[\w.-]+$/.test(u.pathname))
      return '/assets/optimized/uploads/' + u.pathname.split('/').pop() + '-' + width + '.webp';
    if (u.origin === 'https://japansterdam.com' && /^\/assets\/img\/[\w./-]+$/.test(u.pathname) && !u.pathname.includes('..'))
      return '/assets/optimized/local/' + u.pathname.slice('/assets/img/'.length) + '-' + width + '.webp';
  } catch {}
  return null;
}
export function responsiveAttrs(src, sizes = '(min-width:1100px) 24vw, (min-width:640px) 32vw, 50vw') {
  if (typeof document !== 'undefined' && !document.getElementById('jp-page-data')) return '';
  if (typeof location !== 'undefined' && location.hostname === 'dim-io.github.io') return '';
  const small = imageVariant(src, 480), large = imageVariant(src, 960);
  return small && large ? ` srcset="${small} 480w, ${large} 960w" sizes="${sizes}"` : '';
}
