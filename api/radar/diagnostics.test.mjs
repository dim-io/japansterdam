import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {brandDiagnostics,summarizeDiagnostics,DIAGNOSTIC_SCHEMA} from './diagnostics.mjs';
import config from '../../tools/deal-radar/config.json' with {type:'json'};
import policy from '../../tools/deal-radar/pilot-v3.json' with {type:'json'};
const now=Date.now();
const item={url:'https://www.vinted.nl/items/123-private',title:'Needles shirt',brand:'Needles',price:35,currency:'EUR',condition:'very_good',available:true,observedAt:new Date(now).toISOString(),photoUrls:['https://images1.vinted.net/a.png','https://images1.vinted.net/b.png'],comparables:[]};
test('all active searches use confirmed numeric brand filters, not broad keywords',()=>{
 assert.equal(Object.keys(policy.brands).length,20);
 assert(Object.values(policy.brands).every(id=>typeof id==='string'&&/^\d+$/.test(id)));
 assert.equal(Object.keys(policy.pausedBrands).length,6);
});
test('aggregate counters distinguish normalization, brand rejection, garment and condition gates without leaking listings',()=>{
 const results=[{brand:'Needles',returned:6,normalizedCount:5,items:[item,{...item,title:'Needles bag'},{...item,condition:'satisfactory'}]}];
 const stats=brandDiagnostics(results,[{itemId:'123',photoScreening:'inconclusive'}],config,now);
 assert.equal(stats[0].excludedAtNormalization,1);assert.equal(stats[0].excludedByBrand,2);
 assert.deepEqual(stats[0].reasons,{research_candidate:1,garment_type_unknown:1,condition_or_flaws:1});
 const raw=JSON.stringify(stats);for(const secret of [item.url,item.title,'123-private','vinted.net'])assert(!raw.includes(secret));
 const totals=summarizeDiagnostics([{report:raw},{report:raw}]);assert.equal(totals[0].scans,2);assert.equal(totals[0].sourceReturned,12);assert.equal(totals[0].reasons.condition_or_flaws,2);
});
test('a replay cannot double-count a reserved round',()=>{
 const db=new DatabaseSync(':memory:');db.exec(DIAGNOSTIC_SCHEMA);
 for(let i=0;i<2;i++)db.prepare('INSERT OR IGNORE INTO radar_scan_reports VALUES (?,?,?)').run('fixture',0,'[]');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM radar_scan_reports').get().n,1);db.close();
});
