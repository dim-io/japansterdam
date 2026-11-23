import test from 'node:test';
import assert from 'node:assert/strict';
import baseConfig from '../../tools/deal-radar/config.json' with {type:'json'};
const config={...baseConfig,curationPreferences:{...baseConfig.curationPreferences,enabled:true}};
import policy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};
import {identifyBrand,itemPriceLimit} from '../../tools/deal-radar/scoring.mjs';
import {canonicalListingBrand,selectionRejection} from '../../tools/deal-radar/selection.mjs';
import {itemType,estimateFromShop} from '../../tools/deal-radar/valuation.mjs';
import {monitorInput,monitorRow} from './monitor-source.mjs';
import {scanSelection} from './worker.mjs';
import {freshIntake} from './intake.mjs';
import {researchCandidate} from './research.mjs';
import {parseScreening} from './vision.mjs';

const now=Date.parse('2026-11-18T00:00:00Z');
const base={url:'https://www.vinted.nl/items/99999-test',price:30,currency:'EUR',available:true,condition:'very_good',size:'36',publishedAt:new Date(now-60000).toISOString(),observedAt:new Date(now).toISOString(),photoUrls:[1,2,3,4].map(n=>'https://images1.vinted.net/'+n+'.png')};
const additions=['VANQUISH','A Vontade','Haversack','Junya Watanabe','Comme des Garçons Homme','Undercover','Sugar Cane','Resolute','Porter Yoshida','Moonstar','Shoes Like Pottery','ASICS','A.PRESSE','Snow Peak','And Wander','Norbit','Sacai','Comoli','Goldwin','Hender Scheme'];
test('all twenty additions run within the same bounded budget, with a truthful 90-minute full cycle',()=>{
 for(const brand of additions){assert(brand in policy.brands,brand);assert.equal(identifyBrand(brand,config),brand);assert(config.researchBrands.includes(brand));}
 for(const brand of Object.keys(policy.brands))assert.equal(itemPriceLimit(brand,config),100,brand);
 assert.equal(Object.keys(policy.brands).length,52);assert.equal(policy.brandGroups.length*5,90);
 const seen=policy.brandGroups.flatMap((_,slot)=>scanSelection(policy,slot).map(([brand])=>brand));assert.equal(new Set(seen).size,52);assert.equal(seen.length,52);
 assert.equal(policy.maxCostPerMonitorRunUsd,.015);
 assert.equal(policy.enabled,false);assert.equal('sourceBudget' in policy,false);assert.equal('startsAt' in policy,false); // Private trial values are supplied by the Worker secret.
 assert.throws(()=>scanSelection({...policy,brandGroups:[...policy.brandGroups,policy.brandGroups[0]]},0),/merkschema/);
});
test('every group has capped keyword searches; exclusive ASICS never adds an unrestricted ASICS search',()=>{
 for(const names of policy.brandGroups){
  const input=monitorInput(names.map(brand=>[brand,policy.brands[brand]]));
  assert(input.maxItems<=30);assert(input.searchQueries.length<=9);assert.equal(input.skipFirstRun,true);assert.equal(input.resetMonitor,false);assert.deepEqual(input.catalogIds,['5','1904']);
  assert.equal(input.priceTo,100);for(const query of input.searchQueries)if(query.startsWith('https:'))assert.equal(new URL(query).searchParams.get('price_to'),'100');
 }
 const names=policy.brandGroups.find(g=>g.includes('ASICS'));const input=monitorInput(names.map(b=>[b,policy.brands[b]]));
 assert(!input.brands.includes('ASICS'));assert(!input.includeKeywords.includes('ASICS'));assert.equal(input.maxItems,30);assert.equal(input.maxItemsPerSearch,4);
 const queries=input.searchQueries.map(s=>new URL(s).searchParams.get('search_text'));
 for(const q of ['ASICS Kiko Kostadinov','ASICS NOVALIS','ASICS Cecilie Bahnsen','ASICS JJJJound','ASICS HAL STUDIOS'])assert(queries.includes(q));
 assert(!queries.includes('ASICS'));assert(!queries.includes('ASICS GEL-KAYANO 14'));
});
test('text-search brands use exact title-backed matches and stay within Vinted query caps',()=>{
 for(const brand of ['A.PRESSE','Snow Peak','And Wander','Norbit','Sacai','Comoli','Goldwin','Hender Scheme']){
  const group=policy.brandGroups.find(names=>names.includes(brand));
  const input=monitorInput(group.map(name=>[name,policy.brands[name]]));
  assert(input.searchQueries.length<=9,brand);
  for(const url of input.searchQueries){const u=new URL(url);assert.equal(u.searchParams.has('brand_ids[]'),false);}
 }
 const hender={...base,brand:'Hender Scheme',title:'Hender Scheme handmade leather shoes',category:'Women > Shoes'};
 assert.equal(freshIntake(hender,config,now),null);
 assert.equal(freshIntake({...hender,title:'Hender Scheme leather bag',category:'Women > Bags'},config,now),null);
 for(const title of ['Hender Scheme wool sweater','Hender Scheme cotton shirt'])assert.equal(freshIntake({...hender,title,category:'Women > Clothing'},config,now),'product_type_outside_selection');
});
test('Neighborhood must be visible in the listing itself, so generic cheap womenwear is excluded',()=>{
 const generic={...base,brand:'Neighborhood',title:'Women blouse',category:'Women > Clothing'};
 assert.equal(selectionRejection(generic,config),'selected_line_unconfirmed');
 assert.equal(freshIntake(generic,config,now),'brand_claim_unsupported');
 assert.equal(freshIntake({...generic,title:'Neighborhood logo work shirt'},config,now),null);
 const miscategorized={...generic,brand:'Other',title:'NBHD utility jacket'};
 assert.equal(canonicalListingBrand(miscategorized,config),'Neighborhood');
 assert.equal(freshIntake({...miscategorized,brand:'Neighborhood'},config,now),null);
});
test('Japanese Vanquish is distinct from fitness and the separately selected Fragment collaboration',()=>{
 assert.equal(freshIntake({...base,brand:'VANQUISH',title:'Vanquish Shibuya Hachiko souvenir jacket'},config,now),null);
 for(const title of ['Vanquish Fitness gym shirt','Vanquish jacket','Vanquish Japan gymwear shirt'])assert(selectionRejection({brand:'VANQUISH',title},config));
 assert.equal(identifyBrand('Denim by Vanquish & Fragment',config),'Denim by Vanquish & Fragment');
});
test('Homme and Junya MAN/eYe are supported without admitting generic PLAY or womenswear',()=>{
 const homme={...base,brand:'Comme des Garçons',title:'Comme des Garçons Homme wool jacket'};
 assert.equal(canonicalListingBrand(homme,config),'Comme des Garçons Homme');
 assert.equal(canonicalListingBrand({...homme,title:'Comme des Garçons PLAY shirt'},config),null);
 assert.equal(canonicalListingBrand({...homme,brand:'Other'},config),null);
 assert.equal(selectionRejection({...homme,brand:'Comme des Garçons Homme',title:'Comme des Garçons Homme Plus jacket'},config),'excluded_brand_line');
 assert.equal(freshIntake({...base,brand:'Junya Watanabe MAN',title:'eYe Junya Watanabe MAN jacket'},config,now),null);
 assert.equal(selectionRejection({brand:'Junya Watanabe',title:'Junya Watanabe skirt'} ,config),'product_type_outside_selection');
});
test('Porter bags enter intake/research; wallets, unrelated Porter and clothing do not',()=>{
 for(const title of ['Porter Yoshida shoulder bag','Yoshida Porter shoulder bag','Porter Tanker backpack']){
  const item={...base,brand:'Porter',title,category:'Women > Bags'};
  assert.equal(itemType(item),'accessory');assert.equal(freshIntake(item,config,now),null);
  const candidate=researchCandidate({...item,brand:canonicalListingBrand(item,config)},config,now);assert(candidate?.priority>=policy.minimumResearchPriority,title);
 }
 assert(selectionRejection({brand:'Porter',title:'Yoshida Porter wallet'},config));
 assert(selectionRejection({brand:'Porter',title:'Porter International bag'},config));
 assert(selectionRejection({brand:'Porter',title:'Porter bag'},config));
 assert(selectionRejection({brand:'Porter',title:'Porter Yoshida shirt'},config));
});
test('both Japanese shoe brands and selected ASICS can pass with small sizes and women categories',()=>{
 const items=[
  {brand:'Moonstar',title:'Moonstar Alweather',category:'Women > Shoes'},
  {brand:'Shoes Like Pottery',title:'Shoes Like Pottery sneakers'},
  {brand:'ASICS',title:'ASICS NOVALIS GEL-TEREMOA'},
  {brand:'ASICS',title:'ASICS x Kiko Kostadinov GEL-KIRIL sneakers'},
  {brand:'ASICS',title:'ASICS x Cecilie Bahnsen',category:'Women > Shoes'},
  {brand:'ASICS',title:'ASICS JJJJound GEL-KAYANO 14'},
  {brand:'ASICS',title:'ASICS HAL STUDIOS GEL-1130 shoes'}
 ];
 for(const patch of items){const item={...base,...patch};assert.equal(itemType(item),'footwear');assert.equal(freshIntake(item,config,now),null,patch.title);assert(researchCandidate(item,config,now)?.priority>=7,patch.title);}
 for(const title of ['ASICS GEL-KAYANO 14 sneakers','ASICS GEL-1130 shoes','ASICS running shoes'])assert.equal(freshIntake({...base,brand:'ASICS',title},config,now),'selected_line_unconfirmed');
 assert.equal(freshIntake({...base,brand:'ASICS',title:'ASICS NOVALIS jacket'},config,now),'product_type_outside_selection');
 assert.equal(freshIntake({...base,brand:'Shoes Like Pottery',title:'Shoes Like Pottery t-shirt'},config,now),'product_type_outside_selection');
 assert.equal(freshIntake({...base,brand:'ASICS',title:'ASICS replica JJJJound sneakers'},config,now),'imitation_language');
});
test('shoe condition, price, availability and photos remain necessary',()=>{
 const item={...base,brand:'ASICS',title:'ASICS NOVALIS GEL-TEREMOA'};
 assert(researchCandidate({...item,price:70},config,now));
 for(const patch of [{price:100.01},{available:false},{condition:'satisfactory'},{flaws:['worn sole']},{photoUrls:[]}])assert.equal(researchCandidate({...item,...patch},config,now),null);
 assert.equal(freshIntake({...item,publishedAt:undefined},config,now),'upload_time_unknown');
 const source={url:base.url,title:item.title,brand_title:'ASICS',price_amount:30,price_currency:'EUR',condition:'Very good',category_path:['Women','Shoes'],uploaded_ago:'a minute ago',availability:'InStock'};
 assert.equal(monitorRow(source,base.observedAt).brand,'ASICS');assert.equal(monitorRow({...source,price_amount:100},base.observedAt).price,100);assert.equal(monitorRow({...source,price_amount:100.01},base.observedAt),null);
 assert.equal(monitorRow({...source,brand_title:'Other'},base.observedAt),null);
});
test('shoe and bag triage still requires a readable brand and material/article label',()=>{
 for(const brand of ['ASICS','Porter Yoshida']){
  const value={garment_visible:true,brand_text:brand==='ASICS'?'ASICS':'PORTER',brand_photo:0,care_text:'Made in Japan. Article 123456.',care_photo:1,contradiction:false,reason:'consistent_visuals'};
  assert.equal(parseScreening({response:value},{brand},config,2).state,'visually_consistent');
  assert.equal(parseScreening({response:{...value,care_text:'',care_photo:-1}},{brand},config,2).state,'inconclusive');
 }
});
test('ASICS comparisons never substitute general releases or another collaboration',()=>{
 const item={brand:'ASICS',title:'ASICS JJJJound GEL-KAYANO 14 sneakers'};
 const other=[{brand:'ASICS',name:'ASICS GEL-KAYANO 14 sneakers',price:150},{brand:'ASICS',name:'ASICS HAL STUDIOS GEL-KAYANO 14 sneakers',price:200}];
 assert.equal(estimateFromShop(item,other,config),null);
 assert(estimateFromShop(item,[...other,{brand:'ASICS',name:item.title,price:200}],config));
});
