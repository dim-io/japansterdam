import {pathToFileURL} from 'node:url';
import {client,TARGET,SOURCE} from './account-migration.mjs';
import {screenPhotos} from './vision.mjs';
import {readCatalog} from './catalog.mjs';
import {preflight} from '../../tools/deal-radar/budget.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import policy from './owner-readiness.json' with {type:'json'};

export function allowed(p,now=Date.now()){
  const start=Date.parse(p.startsAt),end=Date.parse(p.endsAt),confirmed=Date.parse(p.freeAccountEvidence?.confirmedAt);
  return p.enabled&&p.accountId===TARGET.account&&p.maxPhotoChecks===1&&p.dailyVisionLimit===3
    &&p.freeAccountEvidence?.plan==='free'&&p.freeAccountEvidence.source==='dashboard_current_plan'
    &&confirmed<=now&&now-confirmed<=3600000&&start<=now&&now<end&&end-start<=3600000;
}
export function databaseAdapter(query){return {prepare(sql){return {bind(...params){return {async first(){return (await query(sql,params))[0]||null;},async run(){await query(sql,params);},async all(){return {results:await query(sql,params)};}};}};}};}
export function aiAdapter(token,fetcher=fetch){return {async run(model,input){
  const response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${TARGET.account}/ai/run/${model}`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(input),redirect:'error',signal:AbortSignal.timeout(90000)});
  const data=await response.json();
  if(!response.ok||!data.success){const codes=(data.errors||[]).map(e=>e.code);throw Error(codes.includes(5016)?'model_terms_required':codes.includes(3036)?'free_quota_exhausted':'model_unavailable');}
  return data.result;
}};}
async function telegramReadiness(token,chat,fetcher){
  if(!/^\d+:[A-Za-z0-9_-]+$/.test(token||'')||!/^\d+$/.test(chat||''))return false;
  // Read-only checks; no messages or listing data are sent.
  for(const action of ['getMe','getChat']){
    try {const r=await fetcher(`https://api.telegram.org/bot${token}/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='getChat'?{chat_id:chat}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok||!data.ok)return false;}
    catch{return false;}
  }
  return true;
}
export async function check(env,{query,fetcher=fetch,now=Date.now(),testPolicy=policy}={}){
  if(!allowed(testPolicy,now))throw Error('readiness_window_closed');
  const marker=await query('SELECT verified FROM radar_transfer WHERE id=?',[SOURCE.database]);
  if(marker[0]?.verified!==1)throw Error('migration_not_verified');
  const summary={migrationVerified:true,shopReferences:false,apifyFree:false,apifyReady:false,telegramReady:false,newScraperStarts:0,messagesSent:0};
  try{await readCatalog({SHOP_CATALOG_URL:'https://japansterdam-api.japansterdam-api.workers.dev/public/products'},fetcher);summary.shopReferences=true;}catch{}
  try{const budget=await preflight(env.APIFY_TOKEN,fetcher,.31);summary.apifyFree=budget.freePlanConfirmed;summary.apifyReady=budget.enoughCredit;}catch{}
  summary.telegramReady=await telegramReadiness(env.TELEGRAM_BOT_TOKEN,env.TELEGRAM_CHAT_ID,fetcher);
  await query('INSERT OR IGNORE INTO radar_vision_control (id) VALUES (?)',[testPolicy.id]);
  const result=await screenPhotos({VISION_FREE_CONFIRMED:'true',AI:aiAdapter(env.CLOUDFLARE_API_TOKEN,fetcher),RADAR_DB:databaseAdapter(query)},{brand:'Kapital'},config,testPolicy,{now,fetcher,clock:Date.now,smoke:true});
  summary.photoState=result.state;summary.photoReason=result.reason;
  summary.photoAttempts=(await query('SELECT attempts FROM radar_vision_control WHERE id=?',[testPolicy.id]))[0]?.attempts||0;
  return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)check(process.env,{query:client(TARGET,process.env.CLOUDFLARE_API_TOKEN)}).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Readinesscontrole niet voltooid; geen ruwe accountgegevens gepubliceerd.');process.exitCode=1;});
