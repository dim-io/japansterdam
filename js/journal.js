import './layout.js?v=checkout-1';
import { getContent, getProducts, esc, cardHTML, setMeta, jsonLd } from './data.js';
import { publishedStories, storyUrl, storyCard, storyDate, readingMinutes, matchesProduct, safeArticleHTML } from './journal-shared.js';

const root = document.getElementById('journal-root');
const content = await getContent();
const journal = content.journal || {};
const stories = publishedStories(journal);
const slug = new URLSearchParams(location.search).get('story');
const substack = content.site?.substack || 'https://japansterdam.substack.com/';
const subscribe = `<section class="journal-subscribe"><div><p class="eyebrow">Letters from Japansterdam</p><h2>A closer look, in your inbox.</h2><p>New stories on the people, materials and cultural connections behind Japanese garments.</p></div><a class="btn btn--primary" href="${esc(substack)}" target="_blank" rel="noopener">Subscribe on Substack ↗</a></section>`;

function canonical(path) {
  const link = document.querySelector('link[rel="canonical"]');
  const url = new URL(path, 'https://japansterdam.com/').href;
  link.href = url; return url;
}

if (!slug) {
  canonical('journal.html');
  root.innerHTML = `<div class="wrap journal-index"><header class="journal-intro"><p class="eyebrow">Japansterdam / Editorial</p><h1 class="page-title">${esc(journal.title || 'Journal')}</h1><p>${esc(journal.intro || 'People, materials and cultural connections behind Japanese garments. Curated in Amsterdam.')}</p></header>
    ${stories.length ? `<div class="journal-grid">${stories.map(storyCard).join('')}</div>` : '<p class="journal-empty">The first stories are on their way. Subscribe to hear when they arrive.</p>'}${subscribe}</div>`;
} else {
  const article = stories.find(a => a.slug === slug);
  if (!article) {
    document.title = 'Story not found — Japansterdam';
    const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex'; document.head.append(robots);
    root.innerHTML = '<div class="wrap notfound"><h1 class="page-title">Story not found</h1><p>This story is not currently published.</p><a class="btn" href="journal.html">Back to Journal</a></div>';
  } else {
    const url = canonical(storyUrl(article.slug));
    setMeta({ title: article.title + ' — Japansterdam Journal', description: article.subtitle, image: article.cover, url });
    const date = storyDate(article.date);
    jsonLd({ '@context': 'https://schema.org', '@type': 'Article', headline: article.title, description: article.subtitle, image: [article.cover], author: { '@type': 'Person', name: 'Sam de Greef' }, publisher: { '@type': 'Organization', name: 'Japansterdam', url: 'https://japansterdam.com/' }, ...(date ? { datePublished: article.date } : {}), mainEntityOfPage: url });
    root.innerHTML = `<article class="journal-article"><header class="story-header wrap"><a class="story-back" href="journal.html">← Journal</a><p class="eyebrow">${esc(article.category || 'Journal')}</p><h1>${esc(article.title)}</h1><p class="story-deck">${esc(article.subtitle)}</p><p class="story-byline">By Sam de Greef <span aria-hidden="true">·</span> ${esc(date)} <span aria-hidden="true">·</span> ${readingMinutes(article.bodyHtml)} min read</p></header>
      <div class="story-body">${safeArticleHTML(article.bodyHtml)}</div>
      <div class="wrap story-after"><section id="story-products" hidden aria-labelledby="story-products-title"><div class="journal-section-head"><div><p class="eyebrow">The Japansterdam selection</p><h2 class="h-block" id="story-products-title">Pieces in this story</h2></div><a class="u" href="shop.html">Explore the collection ↗</a></div><div class="grid" id="story-product-grid"></div></section>
      ${subscribe}${article.substackUrl && !article.substackUrl.includes('/publish/') ? `<p class="story-discuss"><a class="u" href="${esc(article.substackUrl)}" target="_blank" rel="noopener">Join the conversation on Substack ↗</a></p>` : ''}
      ${stories.length > 1 ? `<section class="more-stories" aria-labelledby="more-stories-title"><h2 class="h-block" id="more-stories-title">Keep reading</h2><div class="journal-grid">${stories.filter(a => a.slug !== slug).slice(0, 2).map(storyCard).join('')}</div></section>` : ''}</div></article>`;
    const firstImage = root.querySelector('.story-body img');
    if (firstImage) { firstImage.loading = 'eager'; firstImage.setAttribute('fetchpriority', 'high'); }
    getProducts().then(products => {
      const related = products.filter(p => matchesProduct(article, p)).slice(0, 3);
      if (!related.length) return;
      document.getElementById('story-product-grid').innerHTML = related.map(cardHTML).join('');
      document.getElementById('story-products').hidden = false;
    }).catch(() => {});
  }
}
