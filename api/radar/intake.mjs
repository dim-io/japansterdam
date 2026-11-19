import {identifyBrand,normalize} from '../../tools/deal-radar/scoring.mjs';
import {itemType} from '../../tools/deal-radar/valuation.mjs';
import {brandClaimSupported,selectionRejection} from '../../tools/deal-radar/selection.mjs';
// Source upload age is evidence; the time we fetched an item is not its upload time.
const stamp=value=>{
 if(value===undefined||value===null||value==='')return NaN;
 if(typeof value==='string'&&/^\d+$/.test(value)&&!/^\d{10,13}$/.test(value))return NaN;
 const numeric=typeof value==='number'||/^\d{10,13}$/.test(String(value));
 const n=numeric?Number(value):Date.parse(value);
 return numeric&&n<1e12?n*1000:n;
};
export function publicationDetails(row,observedAt){
 const observed=stamp(observedAt);if(!Number.isFinite(observed))return null;
 const valid=n=>Number.isFinite(n)&&n>=Date.UTC(2000,0,1)&&n<=observed+300000;
 for(const key of ['published_at','uploaded_at','created_at','created_at_ts']){
  const n=stamp(row[key]);
  if(valid(n))return {at:new Date(n).toISOString(),kind:'exact',precision:'minute'};
 }
 const scraped=stamp(row.scraped_at),base=valid(scraped)&&scraped<=observed?scraped:observed;
 const age=normalize(row.uploaded_ago||'').replace(/^uploaded\s+/,'').replace(/^geupload\s+/,'');
 if(/^(just now|moments ago|zojuist|a l instant)$/.test(age))return {at:new Date(base).toISOString(),kind:'estimated',precision:'minute'};
 const m=/^(\d+|a|an|one|een)\s*(seconds?|seconden?|minutes?|mins?|minuten?|min|hours?|hrs?|uur|uren|heures?|stunden?|days?|dagen|jours?|tage?|weeks?|weken|semaines?|months?|maanden?|mois|years?|jaren?|jaar|ans?)\b/.exec(age);
 if(!m)return null;
 const amount=/^\d+$/.test(m[1])?Number(m[1]):1;
 const unit=m[2];let precision,n;
 if(/^(month|maand|mois|year|jaren|jaar|ans?)/.test(unit)){
  const date=new Date(base),isMonth=/^(month|maand|mois)/.test(unit),months=isMonth?amount:amount*12;
  if(months>1200)return null;
  const target=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-months,1));
  const lastDay=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(),lastDay));target.setUTCHours(date.getUTCHours(),date.getUTCMinutes(),date.getUTCSeconds(),date.getUTCMilliseconds());
  n=target.getTime();precision=isMonth?'month':'year';
 }else{
  precision=/^(sec|min)/.test(unit)?'minute':/^(hour|hr|uur|uren|heure|stund)/.test(unit)?'hour':'day';
  const scale=/^(sec)/.test(unit)?1000:/^(min)/.test(unit)?60000:precision==='hour'?3600000:/^(day|dag|jour|tag)/.test(unit)?86400000:604800000;
  n=base-amount*scale;
 }
 return valid(n)?{at:new Date(n).toISOString(),kind:'estimated',precision}:null;
}
export function publicationTime(row,observedAt){return publicationDetails(row,observedAt)?.at;}
export function freshIntake(item,config,now,maxAgeHours=6){
 const title=normalize(item.title),category=normalize(item.category||''),text=normalize(item.title+' '+(item.description||''));
 if(/\b(book|books|boek|boeken|livre|magazine|poster|pattern|patroon|sewing|naai|needlework|cushion|kussen|pillow|furniture|meubel|tableware|toy|toys|speelgoed|game|games|dvd|cd|vinyl|mug|tasse|cup|phone|iphone|case|hoesje|perfume|parfum|cosmetic|cosmetica|watch|horloge|keyring|sleutelhanger|sticker|fabric|stoflap|empty box|lege doos)\b/.test(title+' '+category))return 'not_clothing';
 if(!itemType(item))return 'garment_type_unknown';
 const brand=identifyBrand(item.brand,config);
 if(!brand)return 'brand_outside_selection';
 if(!brandClaimSupported(item,config)&&item.brandEvidence!=='verified_vinted_brand_filter')return 'brand_claim_unsupported';
 const selection=selectionRejection(item,config);if(selection)return selection;
 if(/\b(replica|fake|counterfeit|dupe|inspired|style of|namaak|nep)\b/.test(text))return 'imitation_language';
 const published=Date.parse(item.publishedAt);
 if(!Number.isFinite(published))return 'upload_time_unknown';
 if(published>now+300000||now-published>maxAgeHours*3600000)return 'listing_not_recent';
 return null;
}
