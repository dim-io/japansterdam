// Public URLs describe the garment; the CMS slug remains its stable internal ID.
const slugify = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const shorten = (value) => value.length <= 90 ? value : value.slice(0, 91).replace(/-[^-]*$/, '');
export const productPath = (slug) => 'product.html?p=' + encodeURIComponent(slug);

export function createProductRoutes(products) {
  const legacy = new Map(products.map((p) => [p.slug, p]));
  const friendly = new Map();
  const paths = new Map();
  const baseFor = (p) => {
    const name = slugify(p.name), brand = slugify(p.brand);
    return shorten(brand && name !== brand && !name.startsWith(brand + '-') ? brand + '-' + name : name) || 'piece';
  };
  const bases = products.map(baseFor);
  const counts = new Map();
  bases.forEach((base) => counts.set(base, (counts.get(base) || 0) + 1));
  // Stable across catalogue reordering. Include sold pieces to preserve their links.
  for (const p of [...products].sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)) {
    const base = baseFor(p);
    const size = slugify(p.size);
    const stem = base + (counts.get(base) > 1 && size ? '-size-' + size : '');
    let slug = stem, suffix = 2;
    while (friendly.has(slug) || (legacy.has(slug) && legacy.get(slug) !== p)) slug = stem + '-' + suffix++;
    friendly.set(slug, p);
    paths.set(p.slug, productPath(slug));
  }
  return {
    find: (slug) => legacy.get(slug) || friendly.get(slug) || null,
    urlFor: (slug) => paths.get(slug) || productPath(slug),
  };
}
