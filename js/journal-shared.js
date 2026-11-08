import { esc, productUrl } from './data.js';

export const storyUrl = (slug) => 'journal.html?story=' + encodeURIComponent(slug);
export const publishedStories = (journal) => (journal?.articles || []).filter(a => a.published === true && a.slug && a.title);
export const readingMinutes = (html) => Math.max(1, Math.ceil(String(html || '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).length / 220));
export const storyDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z')) : '';

export function storyCard(article, index = 0) {
  return `<a class="story-card" href="${storyUrl(article.slug)}">
    <div class="story-card__image"><img src="${esc(article.cover)}" alt="${esc(article.coverAlt || article.title)}" width="1200" height="900" loading="lazy" decoding="async"></div>
    <div class="story-card__copy"><p class="eyebrow">${String(index + 1).padStart(2, '0')} / ${esc(article.category || 'Journal')}</p>
    <h2>${esc(article.title)}</h2><p class="story-card__summary">${esc(article.subtitle)}</p>
    <p class="story-card__meta">${esc(storyDate(article.date))} <span aria-hidden="true">·</span> ${readingMinutes(article.bodyHtml)} min read</p>
    <span class="story-card__read">Read story <span aria-hidden="true">↗</span></span></div></a>`;
}

export function matchesProduct(article, product) {
  const friendly = new URL(productUrl(product.slug), 'https://japansterdam.com/').searchParams.get('p');
  return (article.relatedProducts || []).some(value => {
    let id = String(value).trim();
    if (id.includes('?p=')) { try { id = new URL(id, 'https://japansterdam.com/').searchParams.get('p'); } catch { return false; } }
    return id === product.slug || id === friendly;
  });
}

export function productStoriesHTML(product, journal) {
  const stories = publishedStories(journal).filter(a => matchesProduct(a, product));
  if (!stories.length) return '';
  return `<aside class="pdp-story" aria-label="The story behind this piece"><p class="eyebrow">From the Journal</p>${stories.map(a => `<a href="${storyUrl(a.slug)}"><span>${esc(a.title)}</span><span aria-hidden="true">↗</span></a>`).join('')}</aside>`;
}

// CMS article content has a narrow, semantic HTML vocabulary. Keep embedded
// controls, event handlers and executable URLs out of the public reading view.
export function safeArticleHTML(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const allowed = new Set(['P','H2','H3','H4','STRONG','EM','B','I','A','UL','OL','LI','BLOCKQUOTE','FIGURE','FIGCAPTION','IMG','BR','HR','SUP','SUB']);
  const forbidden = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','INPUT','BUTTON','SVG']);
  const urlOK = value => /^(https?:\/\/|assets\/|journal\.html|shop\.html|product\.html|#)/i.test(value || '');
  const walk = parent => {
    for (const node of [...parent.children]) {
      if (forbidden.has(node.tagName)) { node.remove(); continue; }
      walk(node);
      if (!allowed.has(node.tagName)) { node.replaceWith(...node.childNodes); continue; }
      for (const attribute of [...node.attributes]) {
        const name = attribute.name;
        if ((name === 'href' && node.tagName === 'A') || (name === 'src' && node.tagName === 'IMG')) {
          if (!urlOK(attribute.value)) node.removeAttribute(name);
        } else if (!(node.tagName === 'IMG' && ['alt','width','height'].includes(name))) node.removeAttribute(name);
      }
      if (node.tagName === 'A' && /^https?:\/\//i.test(node.getAttribute('href') || '')) node.setAttribute('rel', 'noopener');
      if (node.tagName === 'IMG') { node.setAttribute('loading', 'lazy'); node.setAttribute('decoding', 'async'); }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
