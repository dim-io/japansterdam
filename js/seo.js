// Establish the page identity before CMS data or rendering loads. Strip tracking
// and shop filters, but preserve the product/story identifier on detail pages.
(() => {
  const current = new URL(location.href);
  const page = current.pathname.split('/').pop();
  const key = page === 'product.html' ? 'p' : page === 'journal.html' ? 'story' : null;
  const canonical = new URL(page || '', 'https://japansterdam.com/');
  if (key && current.searchParams.get(key)) canonical.searchParams.set(key, current.searchParams.get(key));
  const link = document.querySelector('link[rel="canonical"]') || document.createElement('link');
  link.rel = 'canonical';
  link.href = canonical.href;
  if (!link.parentNode) document.head.appendChild(link);
  const og = document.querySelector('meta[property="og:url"]');
  if (og) og.content = canonical.href;
})();
