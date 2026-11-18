import './layout.js?v=visitor-insights-3';
import { getProducts, getContent, cardHTML, esc } from './data.js?v=visitor-insights-3';
import { matchesBrand } from './brands.js';
import { storyCard, publishedStories } from './journal-shared.js?v=visitor-insights-3';
const brand=document.body.dataset.brand;
const grid=document.getElementById('brand-pieces');
try {
 const products=await getProducts();
 const pieces=products.filter(p=>!p.sold&&matchesBrand(p,brand));
 grid.innerHTML=pieces.length?pieces.map(cardHTML).join(''):'<p class="brand-empty">No pieces are currently available. Explore the full collection or check back for new arrivals.</p>';
 document.getElementById('brand-count').textContent=pieces.length+' '+(pieces.length===1?'piece':'pieces');
} catch {document.getElementById('brand-count').textContent='';grid.innerHTML='<p>We could not load the current collection. Please try again.</p>';}
getContent().then(c=>{
 const stories=publishedStories(c.journal).filter(a=>(a.title+' '+a.subtitle).toLowerCase().includes(brand.toLowerCase()));
 if(!stories.length)return;
 document.getElementById('brand-stories').innerHTML=stories.map(storyCard).join('');
 document.getElementById('brand-journal').hidden=false;
}).catch(()=>{});
