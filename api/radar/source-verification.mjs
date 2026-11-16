// Three bounded source probes only, with no Telegram, AI or database writes.
import {probe} from '../../tools/deal-radar/provider.mjs';
import {preflight} from '../../tools/deal-radar/budget.mjs';
import policy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};
if(!(await preflight(process.env.APIFY_TOKEN,fetch,.09,policy.sourceBudget)).enoughCredit)throw Error('Source verification budget blocked');
const searches=[['Needles','360271',70],['BEAMS Plus','7373680',40],['Nanamica','596562',40]];
for(const [brand,brandId,maxPrice]of searches){
 const fetcher=async(url,options={})=>{
  if(options.method==='POST'&&String(url).includes('/actors/')){
   const input=JSON.parse(options.body);
   // Avoid the pasted-URL parser: use the actor's documented typed filters.
   input.searchQueries=[brand];input.brandIds=brandId;
   options={...options,body:JSON.stringify(input)};
  }
  return fetch(url,options);
 };
 const result=await probe({token:process.env.APIFY_TOKEN,brandIds:brandId,maxPrice,maxResults:10,maxCostUsd:.03,fetcher});
 console.log(JSON.stringify({brand,method:'plain_keyword_and_typed_brand_filter',maxCostUsd:.03,runId:result.runId,rows:result.items.map(i=>({id:/\/items\/(\d+)/.exec(i.url)?.[1],title:i.title,brand:i.brand,age:i.sourceUploadAge,publishedAt:i.publishedAt}))}));
}
