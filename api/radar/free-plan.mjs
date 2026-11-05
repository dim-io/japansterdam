export const ACCOUNT_ID = '0e3359947b78095a7afd9ce36f5cac6f';
export function validOwnerConfirmation(policy, now=Date.now()) {
  const c=policy?.visionAccountConfirmation;
  const issued=Date.parse(c?.confirmedAt),expires=Date.parse(c?.validUntil),end=Date.parse(policy?.endsAt);
  return c?.accountId===ACCOUNT_ID&&c.plan==='free'&&c.source==='owner_confirmation'
    &&Number.isFinite(issued)&&Number.isFinite(expires)&&issued<=now+300000&&now>=issued&&now<expires
    &&expires===end&&expires-issued<=86400000;
}
export function freePlanDecision({ok=false,data=null,status=0}={},policy,now=Date.now()) {
  if(ok&&data?.success===true&&Array.isArray(data.result)) {
    if(data.result.some(s=>/workers?/i.test(String(s.rate_plan?.id||'')+' '+String(s.rate_plan?.public_name||s.rate_plan?.name||''))&&!/free/i.test(String(s.rate_plan?.id||'')+' '+String(s.rate_plan?.public_name||s.rate_plan?.name||'')))) return {allowed:false,basis:'paid_worker_plan_detected'};
    if(data.result.length===0&&(!data.result_info?.total_count||data.result_info.total_count===0))return {allowed:true,basis:'account_api'};
  }
  return validOwnerConfirmation(policy,now)?{allowed:true,basis:'owner_confirmation_for_current_trial'}:{allowed:false,basis:'free_plan_not_confirmed'};
}
