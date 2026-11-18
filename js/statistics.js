// Anonymous first-party counters; never send query strings, account/order data or IDs.
import { API_BASE } from './config.js';
const production=['japansterdam.com','www.japansterdam.com'].includes(location.hostname);
function allowed(){try{return production&&navigator.doNotTrack!=='1'&&navigator.globalPrivacyControl!==true&&(!localStorage.getItem('jp_admin_token')||localStorage.getItem('jp_stats_include_owner')==='yes');}catch{return false;}}
let sent=0;
export function track(event,product='',duration=0){
 if(!allowed()||sent>=30||document.visibilityState!=='visible')return;
 sent++;
 fetch(API_BASE+'/public/statistics/event',{method:'POST',credentials:'omit',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({event,page:location.pathname,product,referrer:document.referrer?new URL(document.referrer).origin:'',duration})}).catch(()=>{});
}
let viewed=false,loaded=false;
function pageview(){if(!viewed&&document.visibilityState==='visible'){viewed=true;track('pageview');}}
function load(){if(loaded||document.visibilityState!=='visible')return;const n=performance.getEntriesByType?.('navigation')?.[0];if(n?.loadEventEnd>0){loaded=true;track('load','',Math.round(n.loadEventEnd-n.startTime));}}
pageview();
document.addEventListener('visibilitychange',()=>{pageview();load();});
if(document.readyState==='complete')load();else window.addEventListener('load',()=>setTimeout(load,0),{once:true});
document.addEventListener('click',e=>{const a=e.target.closest?.('a[data-site]');if(a&&['substack','grailed','instagram'].includes(a.dataset.site))track(a.dataset.site);});
