// Label sizes are evidence, not a universal conversion between brands.
export const FIT_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'One size'];
export function suggestedFitsLike(label) {
  const text = String(label || '').trim().toUpperCase();
  if (/^(ONE[ -]?SIZE|O[ /]?S|FREE(?: SIZE)?)$/.test(text)) return ['One size'];
  const matches = text.match(/\b(?:XXXS|XXS|XS|XXXL|XXL|XL|3XL|2XL|S|M|L)\b/g) || [];
  const found = new Set(matches.map(s => s === 'XXXL' ? '3XL' : s === '2XL' ? 'XXL' : s));
  return FIT_SIZES.filter(s => found.has(s));
}
export function productFitsLike(product) {
  if (product.category === 'Footwear') return [];
  return Array.isArray(product.fitsLike)
    ? FIT_SIZES.filter(size => product.fitsLike.includes(size))
    : suggestedFitsLike(product.size);
}
// Shoe labels stay in their stated sizing system; never convert UK/US/JP to EU.
export function footwearSize(label) {
  const text = String(label || '').trim().replace(/½/g,'.5').replace(/(\d),(\d)/g,'$1.$2');
  const eu = text.match(/\b(?:EU|EUR)\s*(\d{2}(?:\.5)?)\b/i);
  if (eu) return 'EU ' + Number(eu[1]);
  if (/^\d{2}(?:\.5)?$/.test(text) && Number(text) >= 15 && Number(text) <= 55) return 'EU ' + Number(text);
  const system = text.match(/\b(UK|US|JP|CM)\s*(\d{1,2}(?:\.\d+)?)\b/i);
  if (system) return system[1].toUpperCase() + ' ' + Number(system[2]);
  return text ? 'Shoe size ' + text : '';
}
export function productFilterSizes(product) {
  if (product.category !== 'Footwear') return productFitsLike(product);
  const size = footwearSize(product.size);
  return size ? [size] : [];
}
export function filterSizes(products, category = '') {
  const relevant = products.filter(p => p.active !== false && (!category || p.category === category));
  const found = new Set(relevant.flatMap(productFilterSizes));
  return [...FIT_SIZES.filter(s => found.has(s)), ...[...found].filter(s => !FIT_SIZES.includes(s)).sort((a,b) => a.localeCompare(b,'en',{numeric:true}))];
}
export const matchesFit = (product, size) => !size || productFilterSizes(product).includes(size);
