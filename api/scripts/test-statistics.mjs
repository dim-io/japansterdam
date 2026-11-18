import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {collect,report,period,dayKey,midnight,shiftDay,trafficSource,cleanupStatistics} from '../src/statistics.mjs';
import worker from '../src/index.js';
function setup(){const db=new DatabaseSync(':memory:');for(const f of ['0001_init.sql','0008_checkout.sql','0010_statistics.sql'])db.exec(fs.readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));db.prepare('INSERT INTO products(slug,data,position,updated_at) VALUES (?,?,0,0)').run('test-jacket',JSON.stringify({slug:'test-jacket',name:'A jacket',active:true,price:120}));const env={ALLOWED_ORIGINS:'https://japansterdam.com',DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};}}};return{env,db};}
const event=(body,headers={})=>new Request('https://api.test/public/statistics/event',{method:'POST',headers:{Origin:'https://japansterdam.com','Content-Type':'application/json','User-Agent':'Mozilla/5.0 iPhone Mobile',...headers},body:JSON.stringify(body)});
const request=p=>new Request('https://api.test/admin/statistics'+p);
function order(db,id,{created,paid,total=12000,refund=0,chargeback=0,mode='live',status='paid'}={}){db.prepare(`INSERT INTO orders(id,access_hash,request_hash,mode,status,customer,items,policy,subtotal,shipping,total,payment_request,created_at,updated_at,paid_at,refunded,chargeback) VALUES (?,'a','b',?,?,'{}',?,'{}',11000,1000,?,'{}',?,?,?, ?,?)`).run(id,mode,status,JSON.stringify([{slug:'test-jacket',cents:11000}]),total,created,created,paid,refund,chargeback);}
test('Amsterdam days handle DST and windows are bounded, valid and inclusive',()=>{
 assert.equal(dayKey(Date.parse('2026-11-17T23:30:00Z')),'2026-11-18');
 assert.equal(midnight('2026-03-30')-midnight('2026-03-29'),23*3600000);
 assert.equal(midnight('2026-10-26')-midnight('2026-10-25'),25*3600000);
 const p=period(new URL('https://a/?from=2026-11-01&to=2026-11-07'),Date.parse('2026-11-18'));assert.equal(p.days,7);assert.equal(p.previousFrom,'2026-10-25');assert.equal(p.previousTo,'2026-10-31');
 for(const s of ['from=2026-02-30','from=2026-01-01&to=2026-11-18','to=2027-01-01','from=2026-11-10&to=2026-11-01'])assert.throws(()=>period(new URL('https://a/?'+s),Date.parse('2026-11-18')));
});
test('events store only bounded anonymous aggregates, merging repeat events and stripping referrer data',async()=>{
 const {env,db}=setup();for(let i=0;i<2;i++)assert.equal((await collect(event({event:'pageview',page:'/shop.html',referrer:'https://www.google.com/search?q=private-email&secret=123'}),env)).status,204);
 const rows=db.prepare('SELECT * FROM statistics_daily').all();assert.equal(rows.length,1);assert.equal(rows[0].count,2);assert.equal(rows[0].source,'Zoekmachines');assert.equal(rows[0].device,'Mobiel');assert(!JSON.stringify(rows).includes('private-email'));
 assert.deepEqual(Object.keys(rows[0]),['day','event','page','product','source','device','country','count','duration_sum','duration_count']);
 await collect(event({event:'load',page:'/shop.html',duration:1234}),env);const r=await (await report(request(''),env)).json();assert.equal(r.current.loadMs,1234);assert.equal(r.current.loadSamples,1);assert.equal(r.current.counters.pageview,2);
});
test('bad origins, known bots and privacy opt-outs never increment counters; arbitrary URLs/products are rejected',async()=>{
 const {env,db}=setup();for(const h of [{Origin:'https://evil.test'},{DNT:'1'},{'Sec-GPC':'1'},{'User-Agent':'Googlebot'}])await collect(event({event:'pageview',page:'/'},h),env);assert.equal(db.prepare('SELECT COUNT(*) n FROM statistics_daily').get().n,0);
 for(const b of [{event:'pageview',page:'/admin/'},{event:'pageview',page:'/checkout.html?accessToken=private'},{event:'unknown',page:'/'},{event:'product',page:'/product.html',product:'missing'}])await assert.rejects(collect(event(b),env));
 await collect(event({event:'product',page:'/product.html',product:'test-jacket'}),env);assert.equal(db.prepare('SELECT product FROM statistics_daily').get().product,'test-jacket');
});
test('sales use payment date and live orders; checkout cohort is separate; current corrections are explicit',async()=>{
 const {env,db}=setup(),d=dayKey(),start=midnight(d);
 order(db,'paid',{created:start-86400000,paid:start+10,refund:1000,chargeback:500});
 order(db,'test',{created:start+10,paid:start+20,mode:'test'});
 order(db,'open',{created:start+10,paid:null,status:'open'});
 order(db,'old',{created:start-86400000,paid:start-10});
 const r=await (await report(request('?from='+d+'&to='+d),env)).json();
 assert.equal(r.current.orders,1);assert.equal(r.current.created,1);assert.equal(r.current.paidFromCreated,0);assert.equal(r.current.gross,12000);assert.equal(r.current.net,10500);assert.equal(r.current.averageOrder,12000);assert.equal(r.current.products[0].revenue,11000);assert.equal(r.previous.orders,1);assert.equal(r.current.daily.length,1);assert.equal(r.current.daily[0].paid,1);assert(!JSON.stringify(r).includes('access_hash'));assert(!JSON.stringify(r).includes('customer'));
});
test('fresh dashboard reports true zeros and null averages; report is authenticated',async()=>{
 const {env}=setup();const r=await (await report(request(''),env)).json();assert.equal(r.current.orders,0);assert.equal(r.current.averageOrder,null);assert.equal(r.current.loadMs,null);assert.deepEqual(r.current.products,[]);assert.equal(r.current.daily.length,28);
 assert.equal((await worker.fetch(request(''),env,{})).status,401);
});
test('retention removes old aggregates, never orders; sources cannot include arbitrary hostnames',async()=>{
 const {env,db}=setup();db.prepare("INSERT INTO statistics_daily(day,event,page,source,device,country,count) VALUES (?,'pageview','/','Direct','Desktop','NL',1)").run(shiftDay(dayKey(),-401));await cleanupStatistics(env);assert.equal(db.prepare('SELECT count(*) n FROM statistics_daily').get().n,0);
 assert.equal(trafficSource('https://personal-private-subdomain.example.com/secret'),'Overig extern');assert.equal(trafficSource('https://japansterdam.com/shop.html'),'Intern');
});

import vm from 'node:vm';
const clientCode=fs.readFileSync(new URL('../../js/statistics.js',import.meta.url),'utf8').replace("import { API_BASE } from './config.js';","const API_BASE='https://api.test';").replace('export function track','function track');
function browserContext({owner=false,dnt='0',gpc=false,include=false}={}){const sent=[],listeners={},storage=new Map(owner?[['jp_admin_token','secret-token']]:[]);if(include)storage.set('jp_stats_include_owner','yes');const context={location:{hostname:'japansterdam.com',pathname:'/checkout.html',search:'?id=private-order&accessToken=secret'},navigator:{doNotTrack:dnt,globalPrivacyControl:gpc},localStorage:{getItem:k=>storage.get(k)},document:{visibilityState:'visible',referrer:'https://www.google.com/search?email=private@example.com',readyState:'complete',addEventListener:(k,fn)=>listeners[k]=fn},window:{addEventListener(){}},performance:{getEntriesByType:()=>[{loadEventEnd:1400,startTime:0}]},URL,JSON,setTimeout:fn=>fn(),fetch:(url,options)=>{sent.push({url,options,body:JSON.parse(options.body)});return Promise.resolve();}};vm.createContext(context);vm.runInContext(clientCode,context);return{context,sent,listeners};}
test('client excludes owner browsers and privacy opt-outs; public events never send query strings, tokens or referrer paths',()=>{
 for(const opts of [{owner:true},{dnt:'1'},{gpc:true}])assert.equal(browserContext(opts).sent.length,0);
 const {sent,context}=browserContext();assert.equal(sent.length,2);assert.equal(sent[0].body.page,'/checkout.html');assert.equal(sent[0].body.referrer,'https://www.google.com');assert.equal(sent[1].body.duration,1400);assert(!JSON.stringify(sent).includes('secret'));assert(!JSON.stringify(sent).includes('private@'));
 for(let i=0;i<40;i++)vm.runInContext("track('bag','test-jacket')",context);assert.equal(sent.length,30);
 assert.equal(browserContext({owner:true,include:true}).sent.length,2);
});
