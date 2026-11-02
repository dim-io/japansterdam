// Progressive enhancement: the content stays readable without observers or JS.
export function initHomeMotion() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width:900px)');
  const quote = document.getElementById('quote-text');
  const quotePanel = quote?.closest('.quote-sec__text');
  const photo = document.querySelector('.quote-sec__img');
  const grid = document.getElementById('testi-grid');
  const cards = grid ? [...grid.querySelectorAll('.testi')] : [];
  const nav = document.getElementById('testi-nav');
  const prev = document.getElementById('testi-prev');
  const next = document.getElementById('testi-next');
  const counter = document.getElementById('testi-counter');

  if (grid && nav && prev && next && counter && cards.length > 1) {
    let active = 0, frame = 0;
    const paint = () => {
      const rect = grid.getBoundingClientRect();
      const center = rect.left + grid.clientWidth / 2;
      let distance = Infinity;
      cards.forEach((card, i) => {
        const r = card.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - center);
        if (d < distance) { distance = d; active = i; }
      });
      counter.textContent = `${String(active + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
      counter.setAttribute('aria-label', `Review ${active + 1} of ${cards.length}`);
      prev.disabled = active === 0;
      next.disabled = active === cards.length - 1;
      frame = 0;
    };
    const go = (delta) => {
      const index = Math.max(0, Math.min(cards.length - 1, active + delta));
      const left = cards[index].getBoundingClientRect().left - grid.getBoundingClientRect().left + grid.scrollLeft;
      grid.scrollTo({ left, behavior: reduced.matches ? 'auto' : 'smooth' });
    };
    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));
    grid.addEventListener('keydown', (event) => {
      if (desktop.matches || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      go(event.key === 'ArrowRight' ? 1 : -1);
    });
    grid.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(paint); }, { passive: true });
    const layout = () => {
      const mobile = !desktop.matches;
      grid.classList.toggle('is-carousel', mobile);
      nav.hidden = !mobile;
      if (mobile) {
        grid.tabIndex = 0;
        grid.setAttribute('role', 'region');
        grid.setAttribute('aria-roledescription', 'carousel');
        grid.setAttribute('aria-label', 'Customer reviews. Swipe or use the left and right arrow keys.');
      } else {
        grid.removeAttribute('tabindex');
        grid.removeAttribute('role');
        grid.removeAttribute('aria-roledescription');
        grid.removeAttribute('aria-label');
        grid.scrollLeft = 0;
      }
      paint();
    };
    desktop.addEventListener('change', layout);
    if ('ResizeObserver' in window) new ResizeObserver(paint).observe(grid);
    layout();
  }

  if (reduced.matches || !('IntersectionObserver' in window)) return;
  const targets = [quotePanel, photo, ...cards].filter(Boolean);
  const reveal = (entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    }
  };
  const observer = new IntersectionObserver(reveal, { threshold: .15 });
  const cardObserver = new IntersectionObserver(reveal, { threshold: .01 });

  if (quote && quotePanel) {
    const original = quote.textContent;
    let lastWidth = -1;
    const splitLines = () => {
      quote.textContent = '';
      const words = (original.match(/\S+\s*/g) || []).map((word) => {
        const span = document.createElement('span');
        span.textContent = word;
        quote.append(span);
        return span;
      });
      const lines = [];
      let top = null;
      for (const word of words) {
        const y = word.getClientRects()[0]?.top;
        if (top === null || Math.abs(y - top) > 2) { lines.push(''); top = y; }
        lines[lines.length - 1] += word.textContent;
      }
      quote.replaceChildren(...lines.map((text, i) => {
        const line = document.createElement('span');
        line.className = 'quote-line';
        line.style.setProperty('--line-index', i);
        line.textContent = text;
        return line;
      }));
      quotePanel.style.setProperty('--quote-by-delay', `${lines.length * 90 + 200}ms`);
      lastWidth = quote.clientWidth;
    };
    splitLines();
    document.fonts?.ready.then(splitLines);
    const resize = () => { if (Math.abs(quote.clientWidth - lastWidth) > 1) splitLines(); };
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(quote);
    else window.addEventListener('resize', resize);
  }
  cards.forEach((card, i) => card.style.setProperty('--review-index', i));
  targets.forEach((target) => {
    target.classList.add('is-motion-ready');
    (cards.includes(target) ? cardObserver : observer).observe(target);
  });
  reduced.addEventListener('change', () => {
    if (!reduced.matches) return;
    observer.disconnect();
    cardObserver.disconnect();
    targets.forEach((target) => target.classList.add('is-revealed'));
  });
}
