import {identifyBrand,normalize} from '../../tools/deal-radar/scoring.mjs';
import {itemType} from '../../tools/deal-radar/valuation.mjs';
import {brandClaimSupported,selectionRejection} from '../../tools/deal-radar/selection.mjs';
// Source upload age is evidence; the time we fetched an item is not its upload time.
export function publicationTime(row,observedAt){
 for(const key of ['published_at','uploaded_at','created_at','created_at_ts']){
  const v=row[key];if(v===undefined||v===null||v==='')continue;
  const n=typeof v==='number'?v*(v<1e12?1000:1):Date.parse(v);
  if(Number.isFinite(n))return new Date(n).toISOString();
 }
 const age=normalize(row.uploaded_ago||'').replace(/^uploaded\s+/,'').replace(/^geupload\s+/,'');
 if(/^(just now|moments ago|zojuist|a l instant)$/.test(age))return observedAt;
 const m=/^(\d+|a|an|one|een)\s*(minutes?|mins?|minuten?|min|hours?|hrs?|uur|uren|heures?|stunden?|days?|dagen|jours?|tage?|weeks?|weken|semaines?)\b/.exec(age);
 if(!m)return undefined;
 const amount=/^\d+$/.test(m[1])?Number(m[1]):1;
 const unit=m[2],scale=/^(min)/.test(unit)?60000:/^(hour|hr|uur|uren|heure|stund)/.test(unit)?3600000:/^(day|dag|jour|tag)/.test(unit)?86400000:604800000;
 const observed=Date.parse(observedAt);return Number.isFinite(observed)?new Date(observed-amount*scale).toISOString():undefined;
}
export function freshIntake(item,config,now,maxAgeHours=6){
 const title=normalize(item.title),category=normalize(item.category||''),text=normalize(item.title+' '+(item.description||''));
 if(/\b(book|books|boek|boeken|livre|magazine|poster|pattern|patroon|sewing|naai|needlework|cushion|kussen|pillow|furniture|meubel|tableware|toy|toys|speelgoed|game|games|dvd|cd|vinyl|mug|tasse|cup|phone|iphone|case|hoesje|perfume|parfum|cosmetic|cosmetica|watch|horloge|keyring|sleutelhanger|sticker|fabric|stoflap|empty box|lege doos)\b/.test(title+' '+category))return 'not_clothing';
 if(!itemType(item))return 'garment_type_unknown';
 const brand=identifyBrand(item.brand,config);
 if(!brand)return 'brand_outside_selection';
 if(!brandClaimSupported(item,config))return 'brand_claim_unsupported';
 const selection=selectionRejection(item,config);if(selection)return selection;
 if(/\b(replica|fake|counterfeit|dupe|inspired|style of|namaak|nep)\b/.test(text))return 'imitation_language';
 const published=Date.parse(item.publishedAt);
 if(!Number.isFinite(published))return 'upload_time_unknown';
 if(published>now+300000||now-published>maxAgeHours*3600000)return 'listing_not_recent';
 return null;
}
