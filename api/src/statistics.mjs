// First-party anonymous aggregate statistics. No customer data leaves this route.
export class StatisticsError extends Error {constructor(status,message){super(message);this.name='StatisticsError';this.status=status;}}
const fail=(message,status=400)=>{throw new StatisticsError(status,message);};
const query=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const DAY=86400000;
export const dayKey=(ms=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
export const shiftDay=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
export function midnight(day){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',hour:'2-digit',hourCycle:'h23'}).format(new Date(day+'T00:00:00Z'));return Date.parse(day+'T00:00:00Z')-Number(parts)*3600000;}
export function period(url,now=Date.now()){
 const to=url.searchParams.get('to')||dayKey(now),from=url.searchParams.get('from')||shiftDay(to,-27);
 for(const d of [from,to])if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)fail('Kies geldige datums.');
 const days=Math.round((Date.parse(to)-Date.parse(from))/DAY)+1;
 if(days<1||days>90||to>dayKey(now)||from<shiftDay(dayKey(now),-399))fail('Kies maximaal 90 dagen binnen de laatste 400 dagen, tot en met vandaag.');
 return {from,to,days,previousFrom:shiftDay(from,-days),previousTo:shiftDay(from,-1),start:midnight(from),end:midnight(shiftDay(to,1)),previousStart:midnight(shiftDay(from,-days))};
}
export function trafficSource(raw){
 try{const host=new URL(raw).hostname.toLowerCase();
 if(['japansterdam.com','www.japansterdam.com'].includes(host))return 'Intern';
 if(/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(host))return 'Zoekmachines';
 if(/(^|\.)(instagram\.com|l\.instagram\.com)$/.test(host))return 'Instagram';
 if(/(^|\.)(facebook\.com|fb\.com)$/.test(host))return 'Facebook';
 if(/(^|\.)grailed\.com$/.test(host))return 'Grailed';
 if(/(^|\.)substack\.com$/.test(host))return 'Substack';
 return 'Overig extern';
 }catch{return 'Direct / onbekend';}
}
export const EVENTS=new Set(['pageview','product','bag','substack','grailed','instagram','load','engaged','scroll_25','scroll_50','scroll_75','scroll_100']);
export function visitorSoftware(ua=''){
 const browser=/Edg(?:e|A|iOS)?\//i.test(ua)?'Edge':/SamsungBrowser\//i.test(ua)?'Samsung Internet':/OPR\//i.test(ua)?'Opera':/Firefox\/|FxiOS\//i.test(ua)?'Firefox':/Chrome\/|CriOS\//i.test(ua)?'Chrome':/Safari\//i.test(ua)?'Safari':'Overig';
 const operatingSystem=/Windows NT/i.test(ua)?'Windows':/iPhone|iPad|iPod/i.test(ua)?'iOS':/Android/i.test(ua)?'Android':/CrOS/i.test(ua)?'ChromeOS':/Mac OS X/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Overig';
 return {browser,operatingSystem};
}
export async function collect(request,env){
 const origin=request.headers.get('Origin');
 if(!['https://japansterdam.com','https://www.japansterdam.com'].includes(origin))return new Response(null,{status:403});
 if(request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1'||/bot|crawler|spider|headless|lighthouse|pagespeed|preview/i.test(request.headers.get('User-Agent')||''))return new Response(null,{status:204});
 if(Number(request.headers.get('Content-Length'))>1600)fail('Request too large',413);
 const text=await request.text();if(text.length>1600)fail('Request too large',413);
 let b;try{b=JSON.parse(text);}catch{fail('Invalid event');}
 const event=b?.event,page=b?.page;
 if(!EVENTS.has(event)||typeof page!=='string'||!/^\/(?:[a-z][a-z0-9-]{0,60}\.html)?$/.test(page)||page==='/404.html')fail('Invalid event');
 // Page names are bounded to the public HTML templates, not arbitrary URLs.
 const pages=new Set(['/', 'index.html','shop.html','product.html','checkout.html','journal.html','about.html','contact.html','faq.html','shipping-returns.html','privacy-policy.html','size-guide.html','returns.html','needles.html','kapital.html','wacko-maria.html','nanamica.html','engineered-garments.html','nonnative.html','uniform-experiment.html','ts-s.html','white-mountaineering.html','wtaps.html','ordinary-fits.html','remi-relief.html','fumito-ganryu.html','nulabel.html','beams-plus.html','portvel.html','wislom.html','vanquish.html','denim-by-vanquish-fragment.html','fragment-design.html','sophnet.html','visvim.html','neighborhood.html','evisu.html','kenzo.html','sage-de-cret.html','brands.html','maison-kitsune.html']);
 if(!pages.has(page==='/'?'/':page.slice(1)))fail('Unknown page');
 let product='';
 if(['product','bag'].includes(event)){
  if(typeof b.product!=='string'||b.product.length>250)fail('Invalid product');
  const p=await query(env,'SELECT slug FROM products WHERE slug=? AND COALESCE(json_extract(data,\'$.active\'),1)=1',b.product).first();if(!p)fail('Unknown product');product=p.slug;
 }
 const ua=request.headers.get('User-Agent')||'',device=/iPad|Tablet/i.test(ua)?'Tablet':/Mobile|Android|iPhone/i.test(ua)?'Mobiel':'Desktop';
 const software=visitorSoftware(ua),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
 const country=/^[A-Z]{2}$/.test(request.cf?.country||'')?request.cf.country:'Onbekend';
 const duration=event==='load'&&Number.isFinite(b.duration)&&b.duration>0&&b.duration<=60000?Math.round(b.duration):0;
 if(event==='load'&&!duration)return new Response(null,{status:204});
 await query(env,`INSERT INTO statistics_daily(day,event,page,product,source,device,country,hour,browser,operating_system,count,duration_sum,duration_count) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(day,event,page,product,source,device,country,hour,browser,operating_system) DO UPDATE SET count=count+1,duration_sum=duration_sum+excluded.duration_sum,duration_count=duration_count+excluded.duration_count`,dayKey(),event,page==='/index.html'?'/':page,product,trafficSource(b.referrer),device,country,hour,software.browser,software.operatingSystem,duration,duration?1:0).run();
 return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
}
const sum=(rows,key)=>rows.reduce((s,r)=>s+Number(r[key]||0),0);
function ranked(rows,dimension,event='pageview'){
 const m=new Map();for(const r of rows)if(r.event===event)m.set(r[dimension],(m.get(r[dimension])||0)+r.count);
 return [...m].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
}
export function summarize(rows,orders,p,insightsFromDay='9999-12-31',catalogBrands={}){
 const paid=orders.filter(o=>o.mode==='live'&&o.paid_at>=p.start&&o.paid_at<p.end);
 const created=orders.filter(o=>o.mode==='live'&&o.created_at>=p.start&&o.created_at<p.end);
 const counters={};for(const e of EVENTS)counters[e]=sum(rows.filter(r=>r.event===e),'count');
 const insightRows=rows.filter(r=>r.day>=insightsFromDay&&Number(r.hour)>=0),pageviews=insightRows.filter(r=>r.event==='pageview');
 const hours=Array.from({length:24},(_,hour)=>({hour,count:sum(pageviews.filter(r=>r.hour===hour),'count')}));
 const weekdays=['zo','ma','di','wo','do','vr','za'].map((name,day)=>({day,name,count:sum(pageviews.filter(r=>new Date(r.day+'T12:00:00Z').getUTCDay()===day),'count')}));
 const entryPages=ranked(pageviews.filter(r=>r.source!=='Intern'),'page');
 const brandRows=insightRows.filter(r=>r.event==='product').map(r=>({...r,brand:catalogBrands[r.product]||'Overig'}));
 const audience={hours,weekdays,entryPages,browsers:ranked(pageviews,'browser'),operatingSystems:ranked(pageviews,'operating_system'),brands:ranked(brandRows,'brand','product'),pageviews:sum(pageviews,'count'),engaged:sum(insightRows.filter(r=>r.event==='engaged'),'count'),scrollDepth:[25,50,75,100].map(depth=>({depth,count:sum(insightRows.filter(r=>r.event==='scroll_'+depth),'count')}))};
 const durationCount=sum(rows,'duration_count');
 const total=sum(paid,'total'),refunds=sum(paid,'refunded'),chargebacks=sum(paid,'chargeback');
 const daily=[];for(let d=p.from;d<=p.to;d=shiftDay(d,1))daily.push({day:d,views:sum(rows.filter(r=>r.day===d&&r.event==='pageview'),'count'),paid:paid.filter(o=>dayKey(o.paid_at)===d).length,revenue:sum(paid.filter(o=>dayKey(o.paid_at)===d),'total')});
 const productMap=new Map();
 const get=slug=>{if(!productMap.has(slug))productMap.set(slug,{slug,views:0,bag:0,sold:0,revenue:0});return productMap.get(slug);};
 for(const r of rows)if(r.product&&['product','bag'].includes(r.event))get(r.product)[r.event==='product'?'views':'bag']+=r.count;
 for(const o of paid){let items;try{items=JSON.parse(o.items);}catch{continue;}for(const item of items)if(item.slug){const v=get(item.slug);v.sold++;v.revenue+=Number(item.cents)||0;}}
 return {counters,audience,orders:paid.length,created:created.length,paidFromCreated:created.filter(o=>o.paid_at!=null).length,gross:total,shipping:sum(paid,'shipping'),refunds,chargebacks,net:total-refunds-chargebacks,averageOrder:paid.length?Math.round(total/paid.length):null,loadMs:durationCount?Math.round(sum(rows,'duration_sum')/durationCount):null,loadSamples:durationCount,daily,pages:ranked(rows,'page'),sources:ranked(rows,'source'),devices:ranked(rows,'device'),countries:ranked(rows,'country'),products:[...productMap.values()].sort((a,b)=>b.views-a.views||b.sold-a.sold),statuses:created.reduce((m,o)=>(m[o.status]=(m[o.status]||0)+1,m),{})};
}
export async function report(request,env){
 const p=period(new URL(request.url));
 const [traffic,orders,products,meta]=await Promise.all([
 query(env,'SELECT * FROM statistics_daily WHERE day>=? AND day<=?',p.previousFrom,p.to).all(),
 query(env,"SELECT mode,status,items,total,shipping,refunded,chargeback,created_at,paid_at FROM orders WHERE mode='live' AND (created_at>=? AND created_at<? OR paid_at>=? AND paid_at<?)",p.previousStart,p.end,p.previousStart,p.end).all(),
 query(env,'SELECT slug,data FROM products ORDER BY position').all(),query(env,"SELECT started_at,visitor_insights_started_at FROM statistics_meta WHERE id='main'").first()]);
 const rows=traffic.results||[],allOrders=orders.results||[];
 const catalog=products.results.map(r=>{const v=JSON.parse(r.data);return {slug:r.slug,name:v.name,brand:v.brand,price:v.price,active:v.active!==false,sold:v.sold===true};});
 const insightsStartedAt=meta?.visitor_insights_started_at||null,insightsFromDay=insightsStartedAt?dayKey(insightsStartedAt):'9999-12-31',catalogBrands=Object.fromEntries(catalog.map(x=>[x.slug,x.brand||'Overig']));
 const current=summarize(rows.filter(r=>r.day>=p.from),allOrders,p,insightsFromDay,catalogBrands),previous=summarize(rows.filter(r=>r.day<p.from),allOrders,{...p,from:p.previousFrom,to:p.previousTo,start:p.previousStart,end:p.start},insightsFromDay,catalogBrands);
 return Response.json({period:p,current,previous,catalog,visitorInsightsStartedAt:insightsStartedAt,startedAt:meta?.started_at||null,generatedAt:Date.now(),timezone:'Europe/Amsterdam'},{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
}
export async function cleanupStatistics(env){await query(env,'DELETE FROM statistics_daily WHERE day<?',shiftDay(dayKey(),-399)).run();}
