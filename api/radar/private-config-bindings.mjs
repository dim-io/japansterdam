// Cloudflare limits each secret text binding to 5 KiB. ASCII JSON makes chunk
// boundaries deterministic even when a review contains non-ASCII characters.
export function privateConfigBindings(raw){
 const ascii=JSON.stringify(JSON.parse(raw)).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 const chunks=ascii.match(/.{1,4500}/g)||[];
 if(!chunks.length||chunks.length>16)throw Error('Private Radar config exceeds bounded storage');
 return {...Object.fromEntries(chunks.map((part,i)=>[i?'RADAR_PRIVATE_CONFIG_'+(i+1):'RADAR_PRIVATE_CONFIG',part])),RADAR_PRIVATE_CONFIG_PARTS:String(chunks.length)};
}
export function readPrivateConfig(env){
 if(!env.RADAR_PRIVATE_CONFIG)return undefined;
 if(!env.RADAR_PRIVATE_CONFIG_PARTS)return env.RADAR_PRIVATE_CONFIG;
 const count=Number(env.RADAR_PRIVATE_CONFIG_PARTS);
 if(!Number.isInteger(count)||count<1||count>16)throw Error('Invalid private Radar config parts');
 return Array.from({length:count},(_,i)=>{const part=env[i?'RADAR_PRIVATE_CONFIG_'+(i+1):'RADAR_PRIVATE_CONFIG'];if(typeof part!=='string'||!part.length)throw Error('Missing private Radar config part');return part;}).join('');
}
