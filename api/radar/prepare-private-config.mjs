import fs from 'node:fs';
import {requirePrivateRuntime} from './private-runtime.mjs';

const {policy,deployment}=requirePrivateRuntime(process.env);
if(!/^[a-f0-9]{32}$/.test(deployment.accountId||'')||!/^[a-f0-9-]{36}$/.test(deployment.databaseId||''))throw Error('Radar deployment config is incomplete');
if(!/^[a-f0-9]{32}$/.test(deployment.sourceAccountId||'')||!/^[a-f0-9-]{36}$/.test(deployment.sourceDatabaseId||''))throw Error('Radar migration config is incomplete');
const configPath=new URL('./wrangler.toml',import.meta.url);
const outputPath=new URL('./.wrangler.generated.toml',import.meta.url);
const source=fs.readFileSync(configPath,'utf8');
if(!source.includes('__RADAR_DATABASE_ID__'))throw Error('Radar deployment template is invalid');
fs.writeFileSync(outputPath,source.replace('__RADAR_DATABASE_ID__',deployment.databaseId),{mode:0o600});
if(process.env.GITHUB_ENV){
  fs.appendFileSync(process.env.GITHUB_ENV,`CLOUDFLARE_ACCOUNT_ID=${deployment.accountId}\nRADAR_DATABASE_ID=${deployment.databaseId}\n`);
}
// Keep validation output free of account and database identifiers.
if(!policy.enabled)throw Error('Radar trial policy is disabled in the private config');
console.log('Private Radar-config en deploymentinstellingen zijn geldig.');
