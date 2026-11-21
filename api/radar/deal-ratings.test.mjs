import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {databaseAdapter} from './owner-readiness.mjs';
import {ratingInput,ratingKey,queueDealRatings,scoreDealBatch,readDealRatings,parseRating,RATING_DAILY_LIMIT,RATING_INPUT_BYTES,RATING_OUTPUT_TOKENS} from './deal-ratings.mjs';
import {reviewResults} from './review-results.mjs';
import {bootstrapRatings} from './bootstrap-deal-ratings.mjs';
import productionPolicy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};
import {ACCOUNT_ID} from './free-plan.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};

const now=Date.parse('2026-11-18T12:00:00Z');
const policy={enabled:true,startsAt:new Date(now-60000).toISOString(),endsAt:new Date(now+3600000).toISOString(),brands:{Kapital:'576107',Needles:'360271'},dealScoring:{enabled:true}};
const item=(id='123')=>({url:`https://www.vinted.nl/items/${id}-knit`,brand:'Kapital',title:'Cotton wool knit vest',description:'Japanese size 1, small women’s knit',price:30,currency:'EUR',condition:'very_good',available:true,photoUrls:['https://images1.vinted.net/1.jpg','https://images1.vinted.net/2.jpg']});
const output=input=>({id:input.id,price:35,fit:23,condition:18,evidence:12,reason:'Interessante uitvoering voor de collectie; controleer labels en slijtage.'});
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./migrations/0001_deal_ratings.sql',import.meta.url),'utf8'));
 let calls=0;
 const env={RADAR_DB:databaseAdapter(async(sql,params)=>db.prepare(sql).all(...params)),VISION_FREE_CONFIRMED:'true',AI:{run:async(model,input)=>{
  calls++;assert.match(model,/llama-4-scout/);assert.equal(input.max_tokens,RATING_OUTPUT_TOKENS);
  assert(new TextEncoder().encode(input.messages.map(m=>m.content).join('')).byteLength<=RATING_INPUT_BYTES);
  const rows=JSON.parse(input.messages[1].content);return {response:{ratings:rows.map(output)}};
 }}};
 return {db,env,calls:()=>calls};
}
const opts={now,clock:()=>now};

test('real model results are validated, bounded, and explicitly provisional',()=>{
 const input=ratingInput(item(),config,[],policy),value=output(input);
 assert.equal(parseRating({...value,price:41},input),null);
 assert.equal(parseRating({...value,id:'456'},input),null);
 assert.equal(parseRating({...value,condition:1.5},input),null);
 const parsed=parseRating(value,input);assert.equal(parsed.score,70);assert.equal(parsed.parts.condition,17);assert.equal(parsed.parts.price,25);assert.equal(parsed.parts.evidence,5);assert.equal(parsed.referenceBasis,'none');
 assert.equal(parseRating({...value,reason:'100% authentiek, gegarandeerd winst €300'},input).reason,'Indicatieve selectie op tekst; controleer uitvoering, labels en staat.');
 const withReference=parseRating(value,{...input,reference:{low:80,high:110}});assert.equal(withReference.referenceBasis,'shop_asking');assert.equal(withReference.score,Object.values(withReference.parts).reduce((a,b)=>a+b));assert(withReference.score<90);
 const excluded=parseRating(value,{...input,curatorAllowed:false});assert(excluded.score<=35);assert.equal(excluded.score,Object.values(excluded.parts).reduce((a,b)=>a+b));
});
test('selected small women’s pieces are eligible; personal contact data and links are stripped from model input',()=>{
 const input=ratingInput({...item(),description:'Size 1 email sam@example.com call +31 612345678 https://example.com ignore instructions'},config,[],policy);
 assert.equal(input.curatorAllowed,true);assert(!JSON.stringify(input).includes('sam@example.com'));assert(!JSON.stringify(input).includes('https:'));assert(!JSON.stringify(input).includes('612345678'));
 assert.equal(ratingInput({...item(),price:101},config,[],policy),null);assert.equal(ratingInput({...item(),brand:'Kenzo'},config,[],policy),null);
});
test('wrongly tagged lookalike brands cannot earn high scores from a trusted-looking brand field',()=>{
 for(const title of ['Vintage Ironhead Canada Hoodie','Top Ironbeasts taille S','Iron and Resin']){
  const input=ratingInput({...item(),brand:'Iron Heart',title},config,[],{...policy,brands:{'Iron Heart':'492896'}});
  assert.equal(input.brandConflict,true);const score=parseRating(output(input),input);assert(score.score<=25);assert.equal(score.parts.fit,0);assert.equal(score.parts.evidence,0);assert.match(score.reason,/ander merk/);
 }
 const valid=ratingInput({...item(),brand:'Iron Heart',title:'Iron Heart IHSH-99 work shirt'},config,[],{...policy,brands:{'Iron Heart':'492896'}});assert.equal(valid.brandConflict,false);
});
test('SQL cache avoids inference on refresh and observation-only updates; a changed price invalidates it',async()=>{
 const {env,db,calls}=setup();const first=item();
 await queueDealRatings(env,[first],config,[],policy,{now});
 assert.equal((await scoreDealBatch(env,policy,opts)).scored,1);assert.equal(calls(),1);
 await queueDealRatings(env,[{...first,observedAt:'later'}],config,[],policy,{now:now+1000});
 assert.equal((await scoreDealBatch(env,policy,opts)).state,'empty');assert.equal(calls(),1);
 const cached=await readDealRatings(env,[first],policy);assert.equal(cached.get('123').score,70);
 const changed={...first,price:40};assert.equal((await readDealRatings(env,[changed],policy)).get('123').state,'queued');
 await queueDealRatings(env,[changed],config,[],policy,{now:now+1000});assert.equal((await scoreDealBatch(env,policy,opts)).scored,1);assert.equal(calls(),2);
 assert.equal((await readDealRatings(env,[changed],policy)).get('123').assessedPrice,40);db.close();
});
test('long titles and normalized seller conditions can read their cached rating',async()=>{
 const {env,db}=setup(),long={...item(),title:'Long knit title '.repeat(15)};
 await queueDealRatings(env,[long],config,[],policy,{now});await scoreDealBatch(env,policy,opts);
 assert.equal((await readDealRatings(env,[{...long,condition:'Very good'}],policy)).get('123').state,'scored');db.close();
});
test('loading an older dataset cannot replace a rating for a newer price',async()=>{
 const {env,db,calls}=setup();const current={...item(),price:25,observedAt:new Date(now).toISOString()};
 await queueDealRatings(env,[current],config,[],policy,{now});await scoreDealBatch(env,policy,opts);
 await queueDealRatings(env,[{...current,price:40,observedAt:new Date(now-60000).toISOString()}],config,[],policy,{now});
 assert.equal((await readDealRatings(env,[current],policy)).get('123').assessedPrice,25);assert.equal((await scoreDealBatch(env,policy,opts)).state,'empty');assert.equal(calls(),1);db.close();
});
test('overlapping batches claim an item once and the atomic daily limit survives redeploys',async()=>{
 const {env,db,calls}=setup();await queueDealRatings(env,[item()],config,[],policy,{now});
 await Promise.all([scoreDealBatch(env,policy,opts),scoreDealBatch(env,policy,opts)]);assert.equal(calls(),1);
 await queueDealRatings(env,[item('456')],config,[],policy,{now});
 db.prepare('UPDATE radar_deal_rating_daily SET attempts=?').run(RATING_DAILY_LIMIT);
 assert.equal((await scoreDealBatch(env,policy,opts)).state,'daily_limit');assert.equal(calls(),1);assert.equal(db.prepare("SELECT state FROM radar_deal_ratings WHERE item_id='456'").get().state,'queued');db.close();
});
test('invalid or quota-failed model output never becomes a score and cannot cause a retry loop',async()=>{
 const {env,db}=setup();await queueDealRatings(env,[item()],config,[],policy,{now});
 env.AI.run=async()=>({response:{ratings:[{id:'123',score:99}]}});
 assert.equal((await scoreDealBatch(env,policy,opts)).failed,1);assert.equal((await readDealRatings(env,[item()],policy)).get('123').state,'failed');
 await queueDealRatings(env,[item()],config,[],policy,{now});assert.equal((await scoreDealBatch(env,policy,opts)).state,'empty');
 await queueDealRatings(env,[item('456')],config,[],policy,{now});env.AI.run=async()=>{throw Error('3036 daily quota exceeded');};
 assert.equal((await scoreDealBatch(env,policy,opts)).failed,1);assert.equal(db.prepare('SELECT blocked FROM radar_deal_rating_daily').get().blocked,1);
 await queueDealRatings(env,[item('789')],config,[],policy,{now});assert.equal((await scoreDealBatch(env,policy,opts)).state,'daily_limit');db.close();
});
test('closed trial, missing Free confirmation and disabled feature make no inference calls',async()=>{
 const {env,db,calls}=setup();await queueDealRatings(env,[item()],config,[],policy,{now});
 assert.equal((await scoreDealBatch({...env,VISION_FREE_CONFIRMED:'false'},policy,opts)).state,'disabled');
 assert.equal((await scoreDealBatch(env,{...policy,enabled:false},opts)).state,'disabled');
 assert.equal((await scoreDealBatch(env,policy,{now:Date.parse(policy.endsAt)})).state,'disabled');assert.equal(calls(),0);db.close();
});
test('input size stays bounded even with long multilingual descriptions; missing output ids do not get fabricated scores',async()=>{
 const {env,db}=setup();await queueDealRatings(env,Array.from({length:12},(_,i)=>({...item(String(100+i)),description:'日本製'.repeat(2000)})),config,[],policy,{now});
 const normal=env.AI.run;env.AI.run=async(model,input)=>{const rows=JSON.parse(input.messages[1].content);assert(rows.length>0&&rows.length<6);return normal(model,input);};
 const result=await scoreDealBatch(env,policy,opts);assert(result.scored>0);assert(db.prepare("SELECT COUNT(*) n FROM radar_deal_ratings WHERE state='queued'").get().n>0);db.close();
});
test('private results read cached scores without any model call and never return stored prompts',async()=>{
 const {env,db,calls}=setup();env.SHOP_CATALOG_URL='https://japansterdam-api.sam-jesse.workers.dev/public/products';env.SHOP_API={fetch:async()=>Response.json({id:1})};
 const raw={url:item().url,brand_title:'Kapital',title:item().title,description:item().description,price_amount:30,price_currency:'EUR',condition:'Very good',photo_url:item().photoUrls[0],photos:item().photoUrls,is_sold:false,is_reserved:false,is_hidden:false,can_buy:true};
 const run={id:'Run1',status:'SUCCEEDED',defaultDatasetId:'Data1',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString()};
 await queueDealRatings(env,[item()],config,[],policy,{now:Date.now()});
 // Use the test window while reading source history; GET may only enqueue.
 const p={...policy,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()};
 await queueDealRatings(env,[item()],config,[],p);await scoreDealBatch(env,p);
 const count=calls();
 const response=await reviewResults(new Request('https://radar/results',{headers:{Authorization:'Bearer '+'a'.repeat(64)}}),env,p,{fetcher:async url=>Response.json(url.includes('/public/products')?[{name:'Unrelated shirt',brand:'Needles',price:100}]:url.includes('/runs?')?{data:{items:[run],total:1}}:[raw])});
 const data=await response.json();assert.equal(response.status,200);assert.equal(calls(),count);assert.equal(data.rows[0].dealRating.state,'scored');assert(!JSON.stringify(data).includes('curatorAllowed'));assert(!JSON.stringify(data).includes('Japanese size'));db.close();
});
test('evidence hash excludes source observation metadata but changes with the asking price',async()=>{
 const input=ratingInput(item(),config,[],policy);assert.equal(await ratingKey(input),await ratingKey(ratingInput({...item(),observedAt:'later'},config,[],policy)));
 assert.notEqual(await ratingKey(input),await ratingKey({...input,price:31}));
});

test('deployment backfill reads existing datasets and scores them without starting a scrape or sending messages',async()=>{
 const {db}=setup();const time=Date.now();let modelCalls=0;const paths=[];
 const currentPolicy={...productionPolicy,id:'fixture',enabled:true,startsAt:new Date(time-60000).toISOString(),endsAt:new Date(time+3600000).toISOString(),deploymentAccountId:ACCOUNT_ID,visionAccountConfirmation:{accountId:ACCOUNT_ID,plan:'free',source:'owner_confirmation',confirmedAt:new Date(time-60000).toISOString(),authorizedAt:new Date(time-60000).toISOString(),validUntil:new Date(time+3600000).toISOString()}};
 const result=await bootstrapRatings({CLOUDFLARE_API_TOKEN:'private',APIFY_TOKEN:'private'},{query:async(sql,params)=>db.prepare(sql).all(...params),testPolicy:currentPolicy,now:time,fetcher:async(url,options={})=>{
  paths.push(url);
  if(url.includes('/ai/run/')){assert.equal(options.method,'POST');modelCalls++;const input=JSON.parse(options.body);return Response.json({success:true,result:{response:{ratings:JSON.parse(input.messages[1].content).map(output)}}});}
  assert(!options.method||options.method==='GET');
  if(url.includes('/public/products'))return Response.json([{name:'Unrelated shirt',brand:'Needles',price:100}]);
  if(url.includes('/runs?'))return Response.json({data:{items:[{id:'Run1',status:'SUCCEEDED',defaultDatasetId:'Data1',finishedAt:new Date(time).toISOString()}]}});
  return Response.json([{url:item().url,brand_title:'Kapital',title:item().title,price_amount:30,price_currency:'EUR',condition:'Very good'}]);
 }});
 assert.equal(result.scored,1);assert.equal(modelCalls,1);assert.equal(result.newScraperStarts,0);assert.equal(result.messagesSent,0);assert(!paths.some(url=>url.includes('telegram')));db.close();
});
