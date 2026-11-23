// Longer sampling is restricted to the cheaper native monitor and a fixed budget.
export function scanLimit(policy){
 return policy.sourceProvider==='topapi-monitor'&&policy.mode==='fresh-rotation'&&policy.maxCostPerMonitorRunUsd===.015?288:25;
}
export function sourceReserve(policy){
 if(policy.continuous)return .31;
 return scanLimit(policy)===288?Math.ceil(policy.maxAttempts*.015*100)/100:policy.mode==='fresh-rotation'?2.16:policy.bundleChecks?.enabled?1.81:1.69;
}
