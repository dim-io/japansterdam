import {candidateRun,candidateInput,candidates} from './source-candidates.mjs';
import {preflight} from '../../tools/deal-radar/budget.mjs';
import policy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};
if(!(await preflight(process.env.APIFY_TOKEN,fetch,.06,policy.sourceBudget)).enoughCredit)throw Error('Candidate trial budget blocked');
const seen=new Map();
for(const [actor,brand,phase]of [[candidates[1],'Needles','seed_current_inventory'],[candidates[1],'Needles','only_new_after_seed']]){
 try{
  const result=await candidateRun(actor,candidateInput(actor,brand,{monitor:brand==='Needles'}),{token:process.env.APIFY_TOKEN});
  const rows=result.rows.map(r=>({id:String(r.id||r.item_id||/\/items\/(\d+)/.exec(r.url||r.link||r.item_url||'')?.[1]||''),title:r.title||r.name,brand:r.brand||r.brand_title,age:r.uploaded_ago||r.uploadedAgo||r.uploaded_at||r.created_at||r.createdAt||r.listing_date||r.timestamp,category:r.category_path||r.category,price:r.price_amount??r.price,type:r.type||r.record_type,keys:phase==='seed_current_inventory'?Object.keys(r):[]}));
  const prior=seen.get(actor+brand)||new Set();
  console.log(JSON.stringify({actor,brand,phase,runId:result.runId,observedAt:result.observedAt,usageTotalUsd:result.usageTotalUsd,repeated:rows.filter(r=>prior.has(r.id)).length,rows}));
  seen.set(actor+brand,new Set([...prior,...rows.map(r=>r.id)]));
 }catch(e){console.log(JSON.stringify({actor,brand,phase,error:/^source_|^invalid_/.test(e.message)?e.message:'candidate_check_failed'}));}
}
