import sanitize from 'sanitize-html';
import { esc, ORIGIN } from './render.mjs';
import { responsiveAttrs } from '../../js/responsive-images.js';
import { orderJournalStories } from '../../js/journal-order.js';
const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const storyURL=a=>'journal.html?story='+encodeURIComponent(a.slug);
export const liveStories=c=>orderJournalStories((c.journal?.articles||[]).filter(a=>a.published===true&&a.slug&&a.title));
export function articleBody(html){
 return sanitize(String(html||''),{
  allowedTags:['p','h2','h3','h4','strong','em','b','i','a','ul','ol','li','blockquote','figure','figcaption','img','br','hr','sup','sub'],
  allowedAttributes:{a:['href','rel'],img:['src','alt','width','height','loading','decoding','srcset','sizes']},
  allowedSchemes:['http','https'],allowProtocolRelative:false,
  transformTags:{a:(tagName,attribs)=>({tagName,attribs:{href:attribs.href||'',rel:'noopener'}}),img:(tagName,attribs)=>({tagName,attribs:{...attribs,loading:'lazy',decoding:'async'}})}
 }).replace(/<img\b[^>]*>/g,tag=>{const src=tag.match(/\bsrc="([^"]+)"/)?.[1];return src?tag.replace('<img','<img'+responsiveAttrs(src,'(min-width:900px) 800px, 100vw')):tag;});
}
function date(a){return /^\d{4}-\d{2}-\d{2}$/.test(a.date||'')?new Date(a.date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'';}
export function storyCard(a,i=0){return `<a class="story-card" href="${esc(storyURL(a))}"><div class="story-card__image"><img src="${esc(a.cover)}"${responsiveAttrs(a.cover)} alt="${esc(a.coverAlt||a.title)}" width="1200" height="900" loading="lazy" decoding="async"></div><div class="story-card__copy"><p class="eyebrow">${String(i+1).padStart(2,'0')} / ${esc(a.category||'Journal')}</p><h2>${esc(a.title)}</h2><p class="story-card__summary">${esc(a.subtitle)}</p><p class="story-card__meta">${esc(date(a))}</p><span class="story-card__read">Read story ↗</span></div></a>`;}
export function journalHTML(content,products,slug){
 const stories=liveStories(content),article=slug?stories.find(a=>a.slug===slug):null;
 if(slug&&!article)return null;
 const subscribe=`<section class="journal-subscribe"><div><p class="eyebrow">Letters from Japansterdam</p><h2>A closer look, in your inbox.</h2><p>New stories on the people, materials and cultural connections behind Japanese garments.</p></div><a class="btn btn--primary" href="${esc(content.site?.substack||'https://japansterdam.substack.com/')}" rel="noopener" target="_blank">Subscribe on Substack ↗</a></section>`;
 if(!slug)return {html:`<div class="wrap journal-index"><header class="journal-intro"><p class="eyebrow">Japansterdam / Editorial</p><h1 class="page-title">${esc(content.journal?.title||'Journal')}</h1><p>${esc(content.journal?.intro||'People, materials and cultural connections behind Japanese garments. Curated in Amsterdam.')}</p></header><div class="journal-grid">${stories.map(storyCard).join('')}</div>${subscribe}</div>`,meta:{title:'Japansterdam Journal — Japanese Clothing, Designers & Culture',description:'Stories on Japanese clothing, designers and culture, by Japansterdam founder and curator Sam de Greef.',url:ORIGIN+'journal.html'}};
 const body=articleBody(article.bodyHtml);
 return {html:`<article class="journal-article"><header class="story-header wrap"><a class="story-back" href="journal.html">← Journal</a><p class="eyebrow">${esc(article.category||'Journal')}</p><h1>${esc(article.title)}</h1><p class="story-deck">${esc(article.subtitle)}</p><p class="story-byline">By Sam de Greef · ${esc(date(article))}</p></header><div class="story-body">${body}</div><div class="wrap story-after">${subscribe}${stories.length>1?'<section class="more-stories"><h2 class="h-block">Keep reading</h2><div class="journal-grid">'+stories.filter(a=>a.slug!==slug).slice(0,2).map(storyCard).join('')+'</div></section>':''}</div></article>`,meta:{title:article.title+' — Japansterdam Journal',description:article.subtitle||plain(body).slice(0,170),image:new URL(article.cover,ORIGIN).href,url:ORIGIN+storyURL(article)},schema:{'@context':'https://schema.org','@type':'Article',headline:article.title,description:article.subtitle,image:[new URL(article.cover,ORIGIN).href],author:{'@type':'Person',name:'Sam de Greef'},publisher:{'@type':'Organization',name:'Japansterdam',url:ORIGIN},...(date(article)?{datePublished:article.date}:{}),mainEntityOfPage:ORIGIN+storyURL(article)}};
}
