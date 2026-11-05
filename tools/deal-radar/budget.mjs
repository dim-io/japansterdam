// Read account information privately; log only pass/fail flags, never balances or identity.
export function budgetDecision(user, limits, required=1.69) {
  const plan=user?.data?.plan;
  const free=plan?.monthlyBasePriceUsd===0 && (String(plan.tier||plan.id).toUpperCase()==='FREE') && user.data.isPaying!==true;
  const credit=plan?.monthlyUsageCreditsUsd,used=limits?.data?.current?.monthlyUsageUsd,cap=limits?.data?.limits?.maxMonthlyUsageUsd;
  return {freePlanConfirmed:free,enoughCredit:free && [credit,used,cap].every(Number.isFinite) && used>=0 && Math.min(credit,cap)-used>=required};
}
export async function preflight(token,fetcher=fetch,required=1.69) {
  const values=[];
  for(const path of ['/users/me','/users/me/limits']) {
    const r=await fetcher('https://api.apify.com/v2'+path,{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('Budgetcontrole niet beschikbaar');
    values.push(await r.json());
  }
  return budgetDecision(...values,required);
}
