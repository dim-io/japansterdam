import { renderPage } from './page-views.js';
// Renders about, contact, faq, shipping, size guide and privacy from data/content.json.
import './layout.js?v=visitor-insights-3';
import { getContent, esc } from './data.js?v=visitor-insights-3';

const c = await getContent();
const root = document.getElementById('page-root');
const kind = document.body.dataset.page;

root.innerHTML = renderPage(kind,c);

// inch -> cm toggle (whole centimetres)
if (kind === 'size') {
  const toCm = (txt) => {
    const cm = (n) => Math.round(parseFloat(n) * 2.54);
    if (!txt.includes('”')) return txt;
    return txt
      .replace(/(\d+(?:\.\d+)?)”\s*–\s*(\d+(?:\.\d+)?)”/g, (_, a, b) => `${cm(a)}–${cm(b)} cm`)
      .replace(/(\d+(?:\.\d+)?)”/g, (_, a) => `${cm(a)} cm`);
  };
  const btns = root.querySelectorAll('[data-unit]');
  btns.forEach((b) => b.addEventListener('click', () => {
    const cmMode = b.dataset.unit === 'cm';
    btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    root.querySelectorAll('td[data-in]').forEach((td) => { td.textContent = cmMode ? toCm(td.dataset.in) : td.dataset.in; });
  }));
}
