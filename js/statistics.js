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
let viewed=false,loaded=false,visibleTotal=0,visibleSince=document.visibilityState==='visible'?Date.now():0,engaged=false,engagementTimer=0;
const scrollDepths=new Set();
function pageview(){if(!viewed&&document.visibilityState==='visible'){viewed=true;track('pageview');}}
function load(){if(loaded||document.visibilityState!=='visible')return;const n=performance.getEntriesByType?.('navigation')?.[0];if(n?.loadEventEnd>0){loaded=true;track('load','',Math.round(n.loadEventEnd-n.startTime));}}
function checkEngagement(){
 clearTimeout(engagementTimer);
 if(engaged||document.visibilityState!=='visible')return;
 const remaining=15000-visibleTotal-(visibleSince?Date.now()-visibleSince:0);
 if(remaining<=0){engaged=true;track('engaged');return;}
 engagementTimer=setTimeout(checkEngagement,remaining);
}
function trackScrollDepth(){
 if(document.visibilityState!=='visible')return;
 const scrollable=document.documentElement.scrollHeight-window.innerHeight;
 if(scrollable<=0)return;
 const position=window.scrollY||document.documentElement.scrollTop||0;
 const percent=position+1>=scrollable?100:Math.floor(position/scrollable*100);
 for(const depth of [25,50,75,100])if(percent>=depth&&!scrollDepths.has(depth)){scrollDepths.add(depth);track('scroll_'+depth);}
}
pageview();checkEngagement();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(!visibleSince)visibleSince=Date.now();pageview();load();checkEngagement();trackScrollDepth();}else{if(visibleSince)visibleTotal+=Date.now()-visibleSince;visibleSince=0;clearTimeout(engagementTimer);}});
document.addEventListener('scroll',trackScrollDepth,{passive:true});
if(document.readyState==='complete')load();else window.addEventListener('load',()=>setTimeout(load,0),{once:true});
document.addEventListener('click',e=>{const a=e.target.closest?.('a[data-site]');if(a&&['substack','grailed','instagram'].includes(a.dataset.site))track(a.dataset.site);});
