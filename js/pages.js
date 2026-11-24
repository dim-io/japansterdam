import { renderPage } from './page-views.js';
// Render public pages using the current CMS content.
import './layout.js?v=visitor-insights-3';
import { getContent, esc } from './data.js?v=visitor-insights-3';

const c = await getContent();
const root = document.getElementById('page-root');
const kind = document.body.dataset.page;

root.innerHTML = renderPage(kind,c);
