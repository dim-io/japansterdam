// Existing records only: no scraper starts, AI, notifications or database writes.
import {client,TARGET} from '../../api/radar/account-migration.mjs';
import policy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};
import {monitorRow} from '../../api/radar/monitor-source.mjs';
import {freshIntake} from '../../api/radar/intake.mjs';
import {researchAssessment} from '../../api/radar/research.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
const query=client(TARGET,process.env.CLOUDFLARE_API_TOKEN);
const control=(await query('SELECT * FROM radar_control WHERE id=?',[policy.id]))[0];
const last=control?.last_report?JSON.parse(control.last_report):null;
console.log(JSON.stringify({databaseSummary:{trial:policy.id,attempts:control?.attempts,lastError:control?.last_error,lastReport:last,newResearch:await query('SELECT item_id,data,priority,state,photo_state,first_seen FROM radar_research WHERE pilot_id=? AND first_seen>=?',[policy.id,Date.parse(policy.startsAt)]),newAlerts:await query('SELECT delivery,COUNT(*) AS count FROM radar_alerts WHERE pilot_id=? AND attempted_at>=? GROUP BY delivery',[policy.id,Date.parse(policy.startsAt)])}}));
const get=async path=>{const r=await fetch('https://api.apify.com/v2'+path,{headers:{Authorization:'Bearer '+process.env.APIFY_TOKEN},redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('audit_http_'+r.status);return r.json();};
const list=await get('/acts/topapi~vinted-scraper/runs?desc=true&limit=60');
for(const run of list.data.items){
 if(run.startedAt<policy.startsAt||run.startedAt>=policy.endsAt||run.status!=='SUCCEEDED')continue;
 if(!/^[a-zA-Z0-9]+$/.test(run.defaultKeyValueStoreId)||!/^[a-zA-Z0-9]+$/.test(run.defaultDatasetId))continue;
 const input=await get('/key-value-stores/'+run.defaultKeyValueStoreId+'/records/INPUT');
 if(!input.monitorStoreName?.startsWith('japansterdam-new-garments-v1-'))continue;
 const rows=await get('/datasets/'+run.defaultDatasetId+'/items?clean=true&limit=30');
 console.log(JSON.stringify({runId:run.id,startedAt:run.startedAt,usageTotalUsd:run.usageTotalUsd,chargedEventCounts:run.chargedEventCounts,pricingInfo:run.pricingInfo,input:{searchQueries:input.searchQueries,brands:input.brands,priceTo:input.priceTo,monitorStoreName:input.monitorStoreName},rows:rows.map(row=>{const item=monitorRow(row,run.finishedAt);return {id:row.id,title:row.title,brand:row.brand_title,price:row.price_amount,age:row.uploaded_ago,category:row.category_path,normalized:!!item,...(item?{intake:freshIntake(item,config,Date.parse(run.finishedAt),6),assessment:researchAssessment(item,config,Date.parse(run.finishedAt))}:{})};})}));
}
