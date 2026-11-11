// Read-only diagnostics for the last wardrobe attempt: no actor starts or listing exports.
const token=process.env.APIFY_TOKEN;
if(!token)throw Error('source_token_missing');
const base='https://api.apify.com/v2';
const headers={Authorization:'Bearer '+token};
const response=await fetch(base+'/acts/omkar-cloud~vinted-seller-scraper/runs?desc=true&limit=1',{headers,redirect:'manual',signal:AbortSignal.timeout(20000)});
const report={actorHistoryHttp:response.status,newScraperStarts:0};
if(response.ok){
 const data=await response.json();const run=data.data?.items?.[0];
 if(run){
  report.lastRunStatus=['SUCCEEDED','FAILED','ABORTED','TIMED-OUT','RUNNING','READY'].includes(run.status)?run.status:'unknown';
  report.recentAttempt=Date.now()-Date.parse(run.startedAt)<3600000;
  if(report.recentAttempt&&/^[A-Za-z0-9]+$/.test(run.id||'')){
   const log=await fetch(base+'/actor-runs/'+run.id+'/log',{headers,redirect:'manual',signal:AbortSignal.timeout(20000)});
   if(log.ok){const body=(await log.text()).slice(-20000);report.inputValidationFailure=/Input is not valid|input validation|schema validation/i.test(body);report.authFailure=/invalid api key|api key is required|unauthorized|HTTP 401/i.test(body);report.sourceFailure=/failed|error|exception|traceback/i.test(body);report.blockedSource=/403|429|captcha|challenge/i.test(body);}
  }
 }
}
console.log(JSON.stringify(report));
