import test from 'node:test';
import assert from 'node:assert/strict';
import {compareRadarResults,mergeRadarResult,publicationLabel} from '../../admin/radar-data.js';
const row=(id,posted,observed='2026-11-18T11:00:00Z')=>({id,brand:'Needles',uploadedAt:posted,uploadTimeKind:'estimated',uploadPrecision:'hour',observedAt:observed,price:40});
test('newest placement compares actual timestamps across dates, with unknown times last and stable ties',()=>{
 const items=[row('10',null),row('20','2026-10-31T23:50:00Z'),row('30','2026-11-18T09:00:00Z'),row('40','2026-11-18T09:00:00Z'),row('50','2026-11-17T23:59:00Z'),row('60','invalid')];
 assert.deepEqual(items.sort(compareRadarResults).map(r=>r.id),['40','30','50','20','60','10']);
});
test('refresh cannot make an estimated upload newer; current price, availability and AI rating still refresh',()=>{
 const first=row('100','2026-11-18T09:00:00Z');
 const later={...first,uploadedAt:'2026-11-18T09:45:00Z',observedAt:'2026-11-18T11:45:00Z',price:30,dealRating:{state:'scored',score:70}};
 const merged=mergeRadarResult(first,later);
 assert.equal(merged.uploadedAt,first.uploadedAt);assert.equal(merged.price,30);assert.equal(merged.dealRating.score,70);assert.equal(merged.observedAt,later.observedAt);
 assert.deepEqual(mergeRadarResult(later,first),merged);
});
test('an older history page improves placement evidence without replacing the current listing data',()=>{
 const latest={...row('100','2026-11-18T09:45:00Z','2026-11-18T11:45:00Z'),price:25};
 const historic={...row('100','2026-11-18T09:00:00Z','2026-11-18T10:00:00Z'),price:40};
 assert.equal(mergeRadarResult(latest,historic).uploadedAt,historic.uploadedAt);assert.equal(mergeRadarResult(latest,historic).price,25);
 const unknown={...latest,uploadedAt:null,uploadTimeKind:'unknown'};assert.equal(mergeRadarResult(historic,unknown).uploadedAt,historic.uploadedAt);
});
test('exact source timestamps override estimates rather than being frozen to a rounded age',()=>{
 const estimated=row('100','2026-11-18T08:00:00Z');
 const exact={...row('100','2026-11-18T08:28:21Z'),uploadTimeKind:'exact',uploadPrecision:'minute'};
 assert.equal(mergeRadarResult(estimated,exact).uploadedAt,exact.uploadedAt);assert.equal(mergeRadarResult(exact,estimated).uploadTimeKind,'exact');
});
test('last found and AI sorting remain separate from placement order',()=>{
 const old={...row('1','2026-11-01T00:00:00Z','2026-11-18T12:00:00Z'),dealRating:{state:'scored',score:75}};
 const fresh=row('2','2026-11-18T10:00:00Z');
 assert.deepEqual([old,fresh].sort((a,b)=>compareRadarResults(a,b,'recent')).map(r=>r.id),['2','1']);
 for(const sort of ['found','score'])assert.deepEqual([fresh,old].sort((a,b)=>compareRadarResults(a,b,sort)).map(r=>r.id),['1','2']);
});
test('labels reveal estimates and do not invent precise minutes for rounded hours or days',()=>{
 const approximate=row('1','2026-11-18T09:34:21Z');assert.match(publicationLabel(approximate),/ca\./);assert(!publicationLabel(approximate).includes('34'));
 assert.match(publicationLabel({...approximate,uploadPrecision:'day'}),/18-11-2026/);assert(!publicationLabel({...approximate,uploadPrecision:'day'}).includes('10:'));
 assert.match(publicationLabel({...approximate,uploadTimeKind:'exact',uploadPrecision:'minute'}),/10:34/);
 assert.equal(publicationLabel({...approximate,uploadedAt:null}),'Plaatsingstijd onbekend');
});
