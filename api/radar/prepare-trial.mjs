import {sourceReserve} from './trial-limits.mjs';
import {validOwnerConfirmation} from './free-plan.mjs';
import readinessPolicy from './owner-readiness.json' with {type:'json'};
import {readCatalog} from './catalog.mjs';
import {pathToFileURL} from 'node:url';
import {client,TARGET} from './account-migration.mjs';
import {check,telegramReadiness} from './owner-readiness.mjs';
import {preflight} from '../../tools/deal-radar/budget.mjs';
import policy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};

// Read-only account/source checks precede even the single bounded blank-image test.
export async function prepareTrial(env,{query,now=Date.now(),fetcher=fetch,testPolicy=policy,readiness=check,budget=preflight}={}) {
  if((await query('SELECT id FROM radar_control WHERE id=?',[testPolicy.id])).length)return {alreadyInitialized:true};
  if(!testPolicy.enabled||now>=Date.parse(testPolicy.endsAt))throw Error('trial_window_closed');
  const source=await budget(env.APIFY_TOKEN,fetcher,sourceReserve(testPolicy),testPolicy.sourceBudget);
  if(!(source.includedPlanConfirmed??source.freePlanConfirmed))throw Error('source_budget_not_confirmed:plan_unconfirmed');
  if(!source.enoughCredit)throw Error('source_budget_not_confirmed:insufficient_included_credit');
  // Reuse the actual same-account blank-image test, retaining global daily AI usage.
  if(testPolicy.sourceProvider==='topapi-monitor'&&validOwnerConfirmation(testPolicy,now)){
    const proof=(await query('SELECT state,created_at FROM radar_photo_checks WHERE pilot_id=? AND item_id=? AND evidence_key=?',[readinessPolicy.id,'smoke-v2','empty-pixel-regression-v2']))[0];
    if(readinessPolicy.accountId===testPolicy.visionAccountConfirmation.accountId&&proof?.state==='ready'&&proof.created_at<=now&&now-proof.created_at<86400000){
      await readCatalog({SHOP_CATALOG_URL:'https://japansterdam-api.sam-jesse.workers.dev/public/products'},fetcher);
      if(!await telegramReadiness(env.TELEGRAM_BOT_TOKEN,env.TELEGRAM_CHAT_ID,fetcher))throw Error('trial_readiness_not_confirmed');
      return {includedSourceBudgetConfirmed:true,photoState:'ready',reusedPhotoReadiness:true,newScraperStarts:0,messagesSent:0};
    }
  }
  const ready=await readiness(env,{query,now,fetcher});
  if(!ready.shopReferences||!ready.telegramReady||!ready.workersAiFreePlan||ready.photoState!=='ready'){
    const status={shopReferences:!!ready.shopReferences,telegramReady:!!ready.telegramReady,workersAiFreePlan:!!ready.workersAiFreePlan,photoState:ready.photoState||'unknown',photoReason:ready.photoReason||null};
    throw Error('trial_readiness_not_confirmed:'+JSON.stringify(status));
  }
  return {includedSourceBudgetConfirmed:true,photoState:ready.photoState,newScraperStarts:0,messagesSent:0};
}
export function preparationFailure(error){
  const message=String(error?.message||'');
  if(message==='Budgetcontrole niet beschikbaar')return 'source_budget_unavailable';
  if(message==='database_transport_failed')return 'trial_database_unavailable';
  if(/^database_query_http_\d{3}$/.test(message))return message;
  if(message.startsWith('source_budget_not_confirmed:'))return message;
  if(message.startsWith('trial_readiness_not_confirmed:'))return message;
  if(['trial_window_closed','trial_readiness_not_confirmed','migration_not_verified'].includes(message))return message;
  return 'trial_preparation_failed';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)prepareTrial(process.env,{query:client(TARGET,process.env.CLOUDFLARE_API_TOKEN)}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(preparationFailure(error));process.exitCode=1;});
