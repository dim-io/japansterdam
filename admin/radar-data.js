const time=(row,key)=>{const n=Date.parse(row?.[key]);return Number.isFinite(n)?n:null;};
const uploadKeys=['uploadedAt','uploadTimeKind','uploadPrecision','sourceAge'];
const idOrder=(a,b)=>{
 const left=String(a.id||''),right=String(b.id||'');
 return right.length-left.length||right.localeCompare(left);
};
export const radarScore=row=>row.dealRating?.state==='scored'&&Number.isInteger(row.dealRating.score)?row.dealRating.score:null;
export function compareRadarResults(a,b,sort='recent'){
 const posted=(time(b,'uploadedAt')??-Infinity)-(time(a,'uploadedAt')??-Infinity);
 const recent=Number.isNaN(posted)?0:posted;
 if(sort==='score')return (radarScore(b)??-1)-(radarScore(a)??-1)||recent||idOrder(a,b);
 if(sort==='price')return a.price-b.price||recent||idOrder(a,b);
 if(sort==='brand')return a.brand.localeCompare(b.brand)||recent||idOrder(a,b);
 if(sort==='found')return (time(b,'observedAt')??0)-(time(a,'observedAt')??0)||recent||idOrder(a,b);
 return recent||idOrder(a,b);
}
// Keep current price/state, but never make an old listing look newer just
// because the source rounded "an hour ago" differently on its next fetch.
export function mergeRadarResult(previous,incoming){
 if(!previous)return incoming;
 const latest=(time(incoming,'observedAt')??0)>=(time(previous,'observedAt')??0)?incoming:previous;
 const candidates=[previous,incoming].filter(row=>time(row,'uploadedAt')!==null);
 const exact=candidates.filter(row=>row.uploadTimeKind==='exact');
 const best=(exact.length?exact:candidates).sort((a,b)=>time(a,'uploadedAt')-time(b,'uploadedAt'))[0];
 return best?{...latest,...Object.fromEntries(uploadKeys.map(key=>[key,best[key]]))}:latest;
}
export function publicationLabel(row){
 if(time(row,'uploadedAt')===null)return 'Plaatsingstijd onbekend';
 const approximate=row.uploadTimeKind!=='exact',precision=row.uploadPrecision||'minute';
 const options={timeZone:'Europe/Amsterdam'};
 if(precision==='year')options.year='numeric';
 else if(precision==='month'){options.month='short';options.year='numeric';}
 else{
  options.day='2-digit';options.month='2-digit';options.year='numeric';
  if(precision==='hour'||precision==='minute'){options.hour='2-digit';if(precision==='minute')options.minute='2-digit';}
 }
 return 'Geplaatst'+(approximate?' ca.':'')+': '+new Intl.DateTimeFormat('nl-NL',options).format(new Date(row.uploadedAt))+(precision==='hour'?' uur':'');
}
