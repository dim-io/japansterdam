import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import {BUNDLE_SCHEMA,queueBestBundle,checkNextBundle} from './bundles.mjs';
const now=Date.now();
const policy={id:'fixture',enabled:true,bundleChecks:{enabled:true,maxAttempts:4},startsAt:new Date(now-60000).toISOString(),endsAt:new Date(now+23*3600000).toISOString()};
const pants={url:'https://www.vinted.nl/items/123-pants',title:'Needles blue velour track pants',brand:'Needles',price:70,currency:'EUR',condition:'very_good',available:true,observedAt:new Date(now).toISOString(),sellerRef:{id:'42'},photoUrls:['https://images1.vinted.net/a.png','https://images1.vinted.net/b.png']};
const top={...pants,url:'https://www.vinted.nl/items/456-top',title:'Needles blue velour track jacket',price:60};
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../migrations/0002_radar.sql',import.meta.url),'utf8'));for(const sql of BUNDLE_SCHEMA)db.exec(sql);
 const env={APIFY_TOKEN:'fixture',TELEGRAM_BOT_TOKEN:'123:fixture',TELEGRAM_CHAT_ID:'42',RADAR_DB:{prepare(sql){return{bind(...args){const s=db.prepare(sql);return{async first(){return s.get(...args)||null;},async all(){return{results:s.all(...args)};},async run(){return s.run(...args);}};}};}}};
 let runs=0,messages=0;
 const options={now,clock:()=>now,budget:async()=>({freePlanConfirmed:true,enoughCredit:true}),wardrobe:async()=>{runs++;return[pants,top];},screen:async(env,item)=>({state:'visually_consistent',careText:item.url===pants.url?'MR138 polyester':'MR141 polyester'}),fetcher:async(url,opts)=>{assert(String(url).startsWith('https://api.telegram.org/'));const msg=JSON.parse(opts.body).text;assert(msg.includes('€130.00'));assert(msg.includes('geen echtheidsbewijs'));messages++;return Response.json({ok:true,result:{message_id:messages}});}};
 return{db,env,options,runs:()=>runs,messages:()=>messages};
}
test('queue is deduplicated; a matching labelled set sends one research notice without authenticating it',async()=>{
 const c=setup();await queueBestBundle(c.env,[pants,top],config,policy,now);await queueBestBundle(c.env,[pants,top],config,policy,now);
 assert.equal(c.db.prepare('SELECT COUNT(*) n FROM radar_bundle_checks').get().n,2);
 const result=await checkNextBundle(c.env,config,policy,c.options);assert.equal(result.sent,1);
 await checkNextBundle(c.env,config,policy,c.options);assert.equal(c.runs(),1);assert.equal(c.messages(),1);c.db.close();
});
test('missing model labels, mismatched garments or absent primary item cannot promote track pants',async()=>{
 for(const patch of [{screen:async()=>({state:'disabled'})},{wardrobe:async()=>[pants,{...top,title:'Needles red velour jacket'}]},{wardrobe:async()=>[top]}]){
  const c=setup();await queueBestBundle(c.env,[pants],config,policy,now);
  const result=await checkNextBundle(c.env,config,policy,{...c.options,...patch});assert.equal(result.sent,0);assert.equal(c.messages(),0);c.db.close();
 }
});
test('expired, unavailable or budget-blocked items never start a wardrobe scan; only four actor reservations are possible',async()=>{
 const c=setup();await queueBestBundle(c.env,[pants],config,policy,now);
 assert.equal((await checkNextBundle(c.env,config,{...policy,endsAt:new Date(now-1).toISOString()},c.options)).bundleCheck,'inactive');
 assert.equal((await checkNextBundle(c.env,config,policy,{...c.options,budget:async()=>({freePlanConfirmed:true,enoughCredit:false})})).bundleCheck,'budget_blocked');
 c.db.prepare('INSERT INTO radar_bundle_limits VALUES (?,4)').run(policy.id);
 assert.equal((await checkNextBundle(c.env,config,policy,c.options)).bundleCheck,'budget_exhausted');assert.equal(c.runs(),0);c.db.close();
});
