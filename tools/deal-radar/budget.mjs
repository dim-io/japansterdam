// Read account information privately; log only pass/fail flags, never balances or identity.
export function budgetDecision(user, limits, required=1.69, policy={}) {
  const plan=user?.data?.plan;
  const free=plan?.monthlyBasePriceUsd===0 && (String(plan.tier||plan.id).toUpperCase()==='FREE') && user.data.isPaying!==true;
  const credit=plan?.monthlyUsageCreditsUsd,used=limits?.data?.current?.monthlyUsageUsd,cap=limits?.data?.limits?.maxMonthlyUsageUsd;
  const paid=policy.allowPaidIncludedCredits===true && String(plan?.tier||plan?.id).toUpperCase()==='STARTER'
    && Number.isFinite(plan?.monthlyBasePriceUsd) && plan.monthlyBasePriceUsd>0
    && Number.isFinite(policy.maxMonthlyUsageUsd) && policy.maxMonthlyUsageUsd>0 && policy.maxMonthlyUsageUsd<=19;
  const allowed=free||paid;
  const ceiling=paid?Math.min(credit,cap,policy.maxMonthlyUsageUsd):Math.min(credit,cap);
  return {freePlanConfirmed:free,includedPlanConfirmed:allowed,enoughCredit:allowed && [credit,used,cap,required].every(Number.isFinite) && required>0 && used>=0 && ceiling-used>=required};
}
export async function preflight(token,fetcher=fetch,required=1.69, policy={}) {
  const values=[];
  for(const path of ['/users/me','/users/me/limits']) {
    const r=await fetcher('https://api.apify.com/v2'+path,{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('Budgetcontrole niet beschikbaar');
    values.push(await r.json());
  }
  return budgetDecision(...values,required,policy);
}
