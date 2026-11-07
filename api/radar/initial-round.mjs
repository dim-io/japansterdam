import {pathToFileURL} from 'node:url';
import {wake,inWindow} from './worker.mjs';
import {client,TARGET} from './account-migration.mjs';
import {databaseAdapter,aiAdapter} from './owner-readiness.mjs';
import {freePlanDecision} from './free-plan.mjs';
import policy from '../../tools/deal-radar/pilot-v3.json' with {type:'json'};

// Start only the first reserved round while a new Cron propagates. The same
// atomic D1 reservation is shared with the production Worker: never two starts.
export async function initialRound(env,{query,now=Date.now(),run=wake,testPolicy=policy}={}){
  if(!inWindow(now,testPolicy)||now-Date.parse(testPolicy.startsAt)>=3600000)return {initialRound:'outside_first_hour'};
  const control=(await query('SELECT attempts FROM radar_control WHERE id=?',[testPolicy.id]))[0];
  if(!control)throw Error('Trial is niet geïnitialiseerd');
  if(control.attempts>0)return {initialRound:'already_started'};
  if(!freePlanDecision({},testPolicy,now).allowed)throw Error('Gratis account niet bevestigd');
  const result=await run({...env,VISION_FREE_CONFIRMED:'true',SHOP_CATALOG_URL:'https://japansterdam-api.japansterdam-api.workers.dev/public/products',RADAR_DB:databaseAdapter(query),AI:aiAdapter(env.CLOUDFLARE_API_TOKEN)},{now,clock:Date.now,policy:testPolicy});
  // Public output contains only aggregate operational results, never listings.
  return {initialRound:result.skipped?'already_reserved':'completed',checked:result.checked||0,sent:result.sent||0,researchSent:result.researchSent||0,photoReviewSent:result.photoReviewSent||0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)initialRound(process.env,{query:client(TARGET,process.env.CLOUDFLARE_API_TOKEN)}).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Eerste radarcontrole niet voltooid; geen automatische herstart buiten het uurbudget.');process.exitCode=1;});
