// One-time delivery of waiting research tips from recently observed source data.
// Read existing Apify results only: no scraper starts, paid requests or AI calls.
import {pathToFileURL} from 'node:url';
import {client,TARGET} from './account-migration.mjs';
import {databaseAdapter} from './owner-readiness.mjs';
import {existingResults} from './research-test.mjs';
import {researchCandidate,processResearch} from './research.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import policy from '../../tools/deal-radar/pilot-v3.json' with {type:'json'};

export async function reviewBacklog(env,{query,now=Date.now(),clock=Date.now,fetcher=fetch,readExisting=existingResults,testPolicy=policy}={}) {
  if(!testPolicy.enabled||!testPolicy.researchEnabled||now<Date.parse(testPolicy.startsAt)||now>=Date.parse(testPolicy.endsAt))return {state:'outside_trial'};
  const key=testPolicy.id+':unreviewed-backlog-v1';
  const claimed=await query("INSERT OR IGNORE INTO radar_research_tests (pilot_id,attempted_at,state) VALUES (?,?,'pending') RETURNING pilot_id",[key,now]);
  if(!claimed.length)return {state:'already_attempted'};
  const report={state:'completed',waiting:0,revalidated:0,sent:0,excluded:0,unconfirmed:0,newScraperStarts:0,aiCalls:0};
  try {
    const waiting=await query("SELECT item_id,data FROM radar_research WHERE pilot_id=? AND state NOT IN ('notified','rejected','notification_pending') ORDER BY priority DESC,first_seen ASC LIMIT 30",[testPolicy.id]);
    report.waiting=waiting.length;
    const fresh=await readExisting(env.APIFY_TOKEN,testPolicy,{fetcher,now});
    const byId=new Map(fresh.map(item=>[/\/items\/(\d+)/.exec(item.url)?.[1],item]));
    const runtime={...env,RADAR_DB:databaseAdapter(query)};
    for(const row of waiting) {
      if(clock()>=Date.parse(testPolicy.endsAt)){report.unconfirmed++;continue;}
      if(config.researchExcludedItems?.[row.item_id]){
        await query("UPDATE radar_research SET state='rejected' WHERE pilot_id=? AND item_id=?",[testPolicy.id,row.item_id]);report.excluded++;continue;
      }
      // Never replace an old observation timestamp with the current time.
      const item=byId.get(row.item_id);
      if(!item){report.unconfirmed++;continue;}
      const candidate=researchCandidate(item,config,clock());
      if(!candidate){report.unconfirmed++;continue;}
      report.revalidated++;
      const result=await processResearch(runtime,item,candidate,testPolicy,{now:clock(),clock,fetcher,mayScreen:()=>false});
      report.sent+=Number(result.sent);
    }
  }catch{
    // Includes ambiguous delivery: preserve reservations and never retry automatically.
    report.state='incomplete';report.reason='backlog_review_incomplete';
  }
  await query('UPDATE radar_research_tests SET state=?,report=? WHERE pilot_id=?',[report.state,JSON.stringify(report),key]);
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)reviewBacklog(process.env,{query:client(TARGET,process.env.CLOUDFLARE_API_TOKEN)}).then(result=>{console.log(JSON.stringify(result));if(result.state==='incomplete')process.exitCode=1;}).catch(()=>{console.error('Wachtlijstcontrole niet voltooid; geen advertentiegegevens of sleutels gepubliceerd.');process.exitCode=1;});
