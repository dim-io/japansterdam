import { BRAND_PAGES } from '../../js/brand-pages.js';
import { createProductRoutes } from '../../js/product-urls.js';

const origin = 'https://japansterdam.com/';
export const staticPaths = ['', 'shop.html', 'about.html', 'contact.html', 'journal.html', 'size-guide.html', 'faq.html', 'shipping-returns.html', 'privacy-policy.html', ...BRAND_PAGES.map(b=>b.slug+'.html')];
const xml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

export function sitemapXML(products, content) {
  // Use the same route builder and visibility rules as the public shop. Sold
  // archive pages remain valid; inactive products and draft stories stay out.
  const active = products.filter(p => p.active !== false);
  const routes = createProductRoutes(active);
  const paths = [...staticPaths, ...active.map(p => routes.urlFor(p.slug)),
    ...(content.journal?.articles || []).filter(a => a.published === true && a.slug && a.title)
      .map(a => 'journal.html?story=' + encodeURIComponent(a.slug))];
  const urls = [...new Set(paths.map(path => new URL(path, origin).href))];
  // No invented lastmod timestamps: a fetch isn't a content edit.
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(url => '  <url><loc>' + xml(url) + '</loc></url>').join('\n') + '\n</urlset>\n';
}
