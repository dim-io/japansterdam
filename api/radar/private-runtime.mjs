import {readPrivateConfig} from './private-config-bindings.mjs';
import operation from '../../tools/deal-radar/operation.json' with {type:'json'};
import {continuousPolicy} from './continuous.mjs';
import publicConfig from '../../tools/deal-radar/config.json' with {type:'json'};
import publicPolicy from '../../tools/deal-radar/pilot-v4.json' with {type:'json'};
import publicReadiness from './owner-readiness.json' with {type:'json'};

export function privateRuntime(env={},now=Date.now()) {
  const raw=readPrivateConfig(env);
  if(!raw)return {config:publicConfig,policy:publicPolicy,readiness:publicReadiness,deployment:{}};
  let privateValues;
  try { privateValues=JSON.parse(raw); } catch { throw Error('Radar private config is invalid'); }
  if(!privateValues||typeof privateValues!=='object'||Array.isArray(privateValues))throw Error('Radar private config is invalid');
  const config={...publicConfig,...(privateValues.config||{})};
  config.aliases=Object.fromEntries([...new Set([...Object.keys(publicConfig.aliases),...Object.keys(privateValues.config?.aliases||{})])].map(brand=>[brand,[...new Set([...(publicConfig.aliases[brand]||[]),...(privateValues.config?.aliases?.[brand]||[])])]]));
  for(const key of ['coreBrands','researchBrands','peripheralBrands'])config[key]=[...new Set([...(publicConfig[key]||[]),...(privateValues.config?.[key]||[])])];
  config.selectionProfiles={...publicConfig.selectionProfiles,...(privateValues.config?.selectionProfiles||{})};
  const deployment=privateValues.deployment||{};
  const policy=continuousPolicy({...publicPolicy,...(privateValues.policy||{}),brands:publicPolicy.brands,brandGroups:publicPolicy.brandGroups,revision:publicPolicy.revision,deploymentAccountId:deployment.accountId},operation,now);
  const readiness={...(privateValues.readiness||publicReadiness),deploymentAccountId:deployment.accountId};
  if(policy.enabled&&(!policy.id||!policy.startsAt||!policy.endsAt||!policy.maxAttempts||!policy.sourceBudget))throw Error('Radar private policy is incomplete');
  if(policy.enabled&&policy.visionAccountConfirmation?.accountId!==deployment.accountId)throw Error('Radar private account confirmation does not match deployment');
  return {config,policy,readiness,deployment};
}

export function requirePrivateRuntime(env={}) {
  const result=privateRuntime(env);
  if(!env.RADAR_PRIVATE_CONFIG)throw Error('Radar private config is not configured');
  return result;
}
