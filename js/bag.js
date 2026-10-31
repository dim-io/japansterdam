// Shopping bag: array of product slugs in localStorage ("jp_bag"). Every piece is one-of-a-kind, so quantity is 1.
const KEY = 'jp_bag';
let memory = [];

export function getBag() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return memory;
  }
}
function save(a) {
  memory = a;
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {}
  window.dispatchEvent(new CustomEvent('jp:bag', { detail: a }));
}
export const inBag = (slug) => getBag().includes(slug);
export const bagCount = () => getBag().length;
export function addToBag(slug) {
  const a = getBag();
  if (!a.includes(slug)) save([...a, slug]);
}
export function removeFromBag(slug) { save(getBag().filter((s) => s !== slug)); }
export function setBag(a) { save(a); }
export function clearBag() { save([]); }
export function onBagChange(fn) {
  window.addEventListener('jp:bag', fn);
  window.addEventListener('storage', (e) => { if (e.key === KEY) fn(); });
}
