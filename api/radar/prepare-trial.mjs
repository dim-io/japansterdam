import {pathToFileURL} from 'node:url';
import {client,TARGET} from './account-migration.mjs';
import {check} from './owner-readiness.mjs';
import {preflight} from '../../tools/deal-radar/budget.mjs';
import policy from '../../tools/deal-radar/pilot-v3.json' with {type:'json'};

// Read-only account/source checks precede even the single bounded blank-image test.
export async function prepareTrial(env,{query,now=Date.now(),fetcher=fetch,testPolicy=policy,readiness=check,budget=preflight}={}) {
  if((await query('SELECT id FROM radar_control WHERE id=?',[testPolicy.id])).length)return {alreadyInitialized:true};
  if(!testPolicy.enabled||now>=Date.parse(testPolicy.endsAt))throw Error('trial_window_closed');
  const source=await budget(env.APIFY_TOKEN,fetcher,testPolicy.bundleChecks?.enabled?1.81:1.69);
  if(!source.freePlanConfirmed)throw Error('free_source_budget_not_confirmed:free_plan_unconfirmed');
  if(!source.enoughCredit)throw Error('free_source_budget_not_confirmed:insufficient_free_credit');
  const ready=await readiness(env,{query,now,fetcher});
  if(!ready.shopReferences||!ready.telegramReady||ready.photoState!=='ready')throw Error('trial_readiness_not_confirmed');
  return {freeSourceBudgetConfirmed:true,photoState:ready.photoState,newScraperStarts:0,messagesSent:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)prepareTrial(process.env,{query:client(TARGET,process.env.CLOUDFLARE_API_TOKEN)}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error((error.message.startsWith('free_source_budget_not_confirmed:')||['trial_window_closed','trial_readiness_not_confirmed'].includes(error.message))?error.message:'trial_preparation_failed');process.exitCode=1;});
