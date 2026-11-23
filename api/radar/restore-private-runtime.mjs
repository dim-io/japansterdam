// Bootstrap only from the repository's previously deployed owner configuration.
// Values are passed through the runner environment and encrypted Worker secrets,
// never printed, committed again, or uploaded as artifacts.
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const LEGACY_CONFIG_COMMIT='bb26f1fedd8381ec22a489bd6fd08b05fea1f48c';
export function restorePrivateRuntime(read) {
 const config=JSON.parse(read('tools/deal-radar/config.json'));
 const policy=JSON.parse(read('tools/deal-radar/pilot-v4.json'));
 const readiness=JSON.parse(read('api/radar/owner-readiness.json'));
 const migration=read('api/radar/account-migration.mjs');
 const connection=name=>{
  const match=new RegExp('export const '+name+"=\\{account:'([a-f0-9]{32})',database:'([a-f0-9-]{36})'\\}").exec(migration);
  if(!match)throw Error('Previous Radar deployment settings unavailable');
  return {account:match[1],database:match[2]};
 };
 const source=connection('SOURCE'),target=connection('TARGET');
 if(readiness.accountId!==target.account||policy.visionAccountConfirmation?.accountId!==target.account||!policy.sourceBudget)throw Error('Previous Radar account evidence inconsistent');
 return {config,policy,readiness,deployment:{accountId:target.account,databaseId:target.database,sourceAccountId:source.account,sourceDatabaseId:source.database}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href&&!process.env.RADAR_PRIVATE_CONFIG){
 if(!process.env.GITHUB_ENV)throw Error('Private restoration requires the deployment runner');
 execFileSync('git',['fetch','--depth=1','origin',LEGACY_CONFIG_COMMIT],{stdio:'ignore'});
 const value=JSON.stringify(restorePrivateRuntime(path=>execFileSync('git',['show',LEGACY_CONFIG_COMMIT+':'+path],{encoding:'utf8',maxBuffer:1024*1024})));
 // Register the value with GitHub's log masker before it enters later step environments.
 console.log('::add-mask::'+value.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));
 const delimiter='radar_'+randomUUID();
 appendFileSync(process.env.GITHUB_ENV,'RADAR_PRIVATE_CONFIG<<'+delimiter+'\n'+value+'\n'+delimiter+'\n');
 console.log('Bestaande private Radar-instellingen hersteld voor versleutelde deployment.');
}
