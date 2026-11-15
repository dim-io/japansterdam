// Filter labels are separate from the CMS brand credit shown on product pages.
const key = value => String(value || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const names = new Map(Object.entries({
  'beams plus':'BEAMS Plus','fragment':'Fragment Design','fragment design':'Fragment Design',
  'sophnet':'SOPHNET.','visvim':'Visvim','nulabel':'Nulabel','nulabel cm1y0k42':'Nulabel',
  'ts s':'Ts(s)','tss':'Ts(s)','kapital':'KAPITAL','orslow':'orSlow','or slow':'orSlow',
  'sage de cret':'Sage de Cret','wislom':'WISLOM','wtaps':'WTAPS',
  'denim by vanquish fragment':'Denim by Vanquish & Fragment',
}));
const omittedBrands = new Set(['carhartt', 'nike', 'the changes']);
export const shortBrand = value => names.get(key(value)) || String(value || '').trim();
export function productBrands(product) {
  const raw = String(product.brand || '').trim();
  if (!raw) return [];
  // This is a joint label in its own right, not two independent filter entries.
  if (key(raw) === 'denim by vanquish fragment') return ['Denim by Vanquish & Fragment'];
  const parts = raw.split(/\s+[x×]\s+/i);
  return [...new Set(parts.map(shortBrand).filter(brand => brand && !omittedBrands.has(key(brand))))];
}
export function matchesBrand(product, brand) {
  return !brand || productBrands(product).includes(shortBrand(brand)) || product.brand === brand;
}
export function brandOptions(products) {
  return [...new Set(products.filter(p=>p.active!==false).flatMap(productBrands))].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
}
export function brandCounts(products, predicate=()=>true) {
  const counts = new Map();
  for (const p of products) if (p.active!==false && !p.sold && predicate(p)) {
    for (const brand of productBrands(p)) counts.set(brand,(counts.get(brand)||0)+1);
  }
  return counts;
}
export const brandSearchKey = key;
