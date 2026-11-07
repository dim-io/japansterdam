import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {TABLES,transfer,digest,inserts} from './account-migration.mjs';
function databases(){
  const source=new DatabaseSync(':memory:'),target=new DatabaseSync(':memory:');
  for(const file of ['0002_radar.sql','0003_radar_transport_retry.sql','0004_radar_vision.sql','0005_radar_second_trial.sql','0006_radar_research.sql','0007_radar_research_test.sql'])source.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  source.exec("CREATE TABLE users (password TEXT); INSERT INTO users VALUES ('private-shop-login'); CREATE TABLE products (data TEXT); INSERT INTO products VALUES ('private-draft');");
  source.prepare('INSERT INTO radar_control (id,attempts,last_slot) VALUES (?,?,?)').run('pilot-2026-11-04',24,7);
  source.prepare('INSERT INTO radar_alerts VALUES (?,?,?,?,?,?)').run('pilot-2026-11-06','photo-review:123',35,'sent',12345,1);
  source.exec("UPDATE radar_vision_control SET smoke_ok=1,attempts=3; INSERT INTO radar_research VALUES ('pilot-2026-11-06','123','{\"title\":\"research\"}',5,'notified','needs_labels',1,2)");
  const query=db=>async(sql,params=[])=>{const statement=db.prepare(sql);return statement.columns().length?statement.all(...params):(statement.run(...params),[]);};
  return {source,target,read:query(source),write:query(target)};
}
test('private migration preserves spending and delivery state, excludes shop tables and can be resumed without rereading source',async()=>{
  const {source,target,read,write}=databases();
  const result=await transfer(read,write,{migrate:true});
  assert.equal(Object.keys(result.counts).length,TABLES.length);
  assert.equal(target.prepare("SELECT attempts FROM radar_control WHERE id='pilot-2026-11-04'").get().attempts,24);
  assert.deepEqual(target.prepare('SELECT * FROM radar_alerts').all(),source.prepare('SELECT * FROM radar_alerts').all());
  assert.equal(target.prepare('SELECT COUNT(*) n FROM radar_research').get().n,1);
  assert.equal(target.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('users','products')").get().n,0);
  assert.equal(target.prepare('SELECT smoke_ok FROM radar_vision_control LIMIT 1').get().smoke_ok,0);
  assert.equal(target.prepare('SELECT attempts FROM radar_vision_control LIMIT 1').get().attempts,3);
  assert((await transfer(()=>{throw Error('source must not be accessed');},write)).alreadyVerified);
  source.close();target.close();
});
test('migration is explicit and does not overwrite mismatching target state',async()=>{
  const {source,target,read,write}=databases();
  await assert.rejects(transfer(read,write),/migration_not_verified/);
  target.exec(readFileSync(new URL('../migrations/0002_radar.sql',import.meta.url),'utf8'));
  target.exec(readFileSync(new URL('../migrations/0003_radar_transport_retry.sql',import.meta.url),'utf8'));
  target.prepare('INSERT INTO radar_control (id,attempts) VALUES (?,?)').run('pilot-2026-11-04',25);
  await assert.rejects(transfer(read,write,{migrate:true}),/transfer_verification_failed/);
  assert.equal(target.prepare('SELECT attempts FROM radar_control').get().attempts,25);
  assert.equal(target.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='radar_transfer'").get().n,0);
  source.close();target.close();
});
test('parameterized copy bounds bind counts and handles quotes without SQL interpolation',()=>{
  const rows=Array.from({length:200},(_,i)=>({id:String(i),data:"name'; DROP TABLE users; --"}));
  const queries=inserts('radar_seen',rows,['id','data']);
  assert(queries.every(q=>q.params.length<=90&&!q.sql.includes('DROP')));
  assert.equal(digest(rows,['id','data']),digest([...rows].reverse(),['id','data']));
  assert.throws(()=>inserts('users',rows,['id']),/not_allowed/);
});
