import {liveStories,articleBody} from './editorial.mjs';
import {createProductRoutes} from '../../js/product-urls.js';
// Send the browser only the content needed on this document. Every navigation
// still reads live prices/availability; private drafts never enter the snapshot.
export function clientSnapshot(content,products,url){
 const articleSlug=url.pathname==='/journal.html'?url.searchParams.get('story'):null;
 const product=url.pathname==='/product.html'?createProductRoutes(products).find(url.searchParams.get('p')||''):null;
 const articles=liveStories(content).map(a=>{
  const {bodyHtml,...meta}=a;
  const readingMinutes=Math.max(1,Math.ceil(String(bodyHtml||'').replace(/<[^>]*>/g,' ').trim().split(/\s+/).length/220));
  return {...meta,readingMinutes,...(a.slug===articleSlug?{bodyHtml:articleBody(bodyHtml)}:{})};
 });
 const publicContent={...content,home:{...content.home,testimonials:[]},journal:{...content.journal,articles}};
 const catalogPage=!['/about.html','/contact.html','/faq.html','/shipping-returns.html','/privacy-policy.html','/size-guide.html'].includes(url.pathname);
 if(!catalogPage)return {content:publicContent};
 const compactProducts=products.map(p=>{
  if(p.slug===product?.slug)return p;
  const {description,measurements,conditionNotes,...card}=p;
  const images=(p.images||[]).slice(0,2);
  return {...card,images,...(p.imageFrames?{imageFrames:p.imageFrames.filter(f=>images.includes(f.url))}:{})};
 });
 return {content:publicContent,products:compactProducts};
}
