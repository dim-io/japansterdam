import { normalize, identifyBrand } from './scoring.mjs';

export function garmentType(name) {
  const text = normalize(name);
  if (/\b(set|co ord|coord|ensemble|suit)\b/.test(text)) return 'set';
  if (/\b(short|shorts|bermuda|bermudas)\b/.test(text)) return 'shorts';
  if (/\b(pants|trousers|pantalon|pantalone|broek|jeans|hose|jogging|joggers)\b/.test(text)) return 'trousers';
  if (/\b(t shirt|tshirt|tee)\b/.test(text)) return 'tee';
  if (/\b(shirt|chemise|overhemd|hemd)\b/.test(text)) return 'shirt';
  if (/\b(hoodie|sweatshirt|sweater|knit|cardigan|trui|pullover|strickjacke)\b/.test(text)) return 'knit';
  if (/\b(jacket|coat|parka|blazer|jas|veste|manteau|jacke|mantel)\b/.test(text)) return 'outerwear';
  return null;
}

export function estimateFromShop(item, products, config) {
  const brand = identifyBrand(item.brand, config), type = garmentType(item.title);
  if (!brand || !type) return null;
  // A mass-market collaboration is not comparable to the mainline label.
  const collaboration = /\b(uniqlo|gu)\b/.exec(normalize(item.title + ' ' + (item.description || '')))?.[1] || null;
  const references = products.filter((p) => identifyBrand(p.brand, config) === brand && garmentType(p.name) === type
    && ((/\b(uniqlo|gu)\b/.exec(normalize(p.name))?.[1] || null) === collaboration)
    && typeof p.price === 'number' && Number.isFinite(p.price) && p.price > 0);
  if (!references.length) return null;
  const prices = references.map((p) => p.price).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const reference = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  return { basis: 'japansterdam_asking', low: Math.round(reference * .45), high: Math.round(reference * .65),
    references: references.slice(0, 3).map((p) => ({ title: p.name, price: p.price })) };
}

export function missingReferenceReason(item, products, config) {
  const brand = identifyBrand(item.brand, config), type = garmentType(item.title);
  if (!brand) return 'Merk wordt niet herkend';
  if (!type) return 'Kledingtype niet herkend; geen onderbouwde flipwaarde';
  const collab = /\b(uniqlo|gu)\b/.exec(normalize(item.title + ' ' + (item.description || '')))?.[1];
  if (collab) return `${collab.toUpperCase()}-samenwerking: geen passende shopreferentie; hoofdcollectieprijzen niet gebruikt`;
  return `Geen shopreferentie voor ${brand} / ${type}; flipwaarde onbekend`;
}

