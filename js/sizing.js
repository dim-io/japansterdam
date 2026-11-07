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
  return Array.isArray(product.fitsLike)
    ? FIT_SIZES.filter(size => product.fitsLike.includes(size))
    : suggestedFitsLike(product.size);
}
export const matchesFit = (product, size) => !size || productFitsLike(product).includes(size);
