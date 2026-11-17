// Hidden alternate photos have no request URL until deliberate interest.
export function loadCardImage(card) {
  const img = card?.querySelector('img[data-card-src]');
  if (!img) return;
  const ready = () => { if (img.naturalWidth > 0) img.classList.add('is-ready'); };
  img.addEventListener('load', ready, {once: true});
  for (const name of ['sizes', 'srcset', 'src']) {
    const value = img.getAttribute('data-card-' + name);
    if (value) img.setAttribute(name, value);
    img.removeAttribute('data-card-' + name);
  }
  if (img.complete) ready();
}
export function initCardImages(root = document) {
  // Delegation also covers filtering, sorting and client-rendered related cards.
  root.addEventListener('pointerover', event => {
    if (event.pointerType === 'mouse' && matchMedia('(hover:hover) and (pointer:fine)').matches)
      loadCardImage(event.target.closest('.card'));
  });
  root.addEventListener('focusin', event => {
    if (matchMedia('(hover:hover) and (pointer:fine)').matches)
      loadCardImage(event.target.closest('.card'));
  });
}
