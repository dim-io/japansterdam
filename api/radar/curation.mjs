import {identifyBrand,listingUrl,normalize} from '../../tools/deal-radar/scoring.mjs';
import {garmentType} from '../../tools/deal-radar/valuation.mjs';
export const itemId=item=>/\/items\/(\d+)/.exec(listingUrl(item.url)||'')?.[1];
export function modelNumbers(text){return [...new Set((String(text||'').toUpperCase().match(/\b[A-Z]{1,4}[- ]?\d{3,5}[A-Z]?\b/g)||[]).map(s=>s.replace(/[- ]/g,'')).filter(s=>!['RN','CA','TEL','VAT','ZIP','FR','EU','US'].includes(s.match(/^[A-Z]+/)?.[0])))].slice(0,5);}
export function isNeedlesTrackPants(item,config){return identifyBrand(item.brand,config)==='Needles'&&garmentType(item.title)==='trousers'&&/\b(track|jogging|joggers|sweatpants|velour|velours|velvet)\b/.test(normalize(item.title+' '+(item.description||'')));}
export function curation(item,config){
 if(!config.curationPreferences?.enabled)return {allowed:true,boost:0,reason:'brand_selection',bundleWorthChecking:false};
 const id=itemId(item),brand=identifyBrand(item.brand,config),type=garmentType(item.title),text=normalize(item.title+' '+(item.description||''));
 const review=config.curationPreferences.listingFeedback?.[id];
 if(review?.verdict==='skip')return {allowed:false,boost:0,reason:review.reason,bundleWorthChecking:false};
 const track=isNeedlesTrackPants(item,config);
 const distinctive=/\b(rebuild|patchwork|mohair|jacquard|bandana|sashiko|boro|velour|velours|velvet|kountry)\b/.test(text);
 const preferred=brand==='Needles'&&['outerwear','shirt','knit','set'].includes(type);
 return {allowed:!track,boost:Number(preferred)*6+Number(distinctive)*3+Number(review?.verdict==='interesting')*4+Number(modelNumbers(item.description).length>0)*2,
  reason:track?'needles_track_pants_require_set_and_label_evidence':preferred?'preferred_needles_garment':distinctive?'distinctive_execution':'brand_selection',
  bundleWorthChecking:!!item.sellerRef&&(preferred||(distinctive&&['outerwear','trousers','shorts','set'].includes(type))||(brand==='orSlow'&&type==='outerwear'&&item.price<=35)||review?.verdict==='interesting'),track};
}
export function matchingCompanion(main,other,config){
 if(identifyBrand(main.brand,config)!==identifyBrand(other.brand,config)||!identifyBrand(main.brand,config)||itemId(main)===itemId(other))return false;
 const types=[garmentType(main.title),garmentType(other.title)];
 if(!types.some(t=>['trousers','shorts'].includes(t))||!types.some(t=>['outerwear','knit','shirt'].includes(t)))return false;
 const texts=[main,other].map(i=>normalize(i.title+' '+(i.description||'')));
 const groups=[['velour','velours','velvet'],['ripstop'],['poly smooth'],['corduroy','cord'],['jacquard'],['paisley'],['marble','abstract']];
 const material=groups.some(words=>texts.every(t=>words.some(w=>(' '+t+' ').includes(' '+w+' '))));
 const colors=[['blue','blau','bleu','blauw','navy'],['purple','violet','lila','paars'],['black','schwarz','noir','zwart'],['green','grun','vert','groen','olive'],['red','rot','rouge','rood'],['grey','gray','grau','gris','grijs']];
 const color=colors.some(words=>texts.every(t=>words.some(w=>(' '+t+' ').includes(' '+w+' '))));
 return material&&color;
}
export function coherentLabelCodes(a,b){
 const codes=screen=>screen?.state==='visually_consistent'?modelNumbers(screen.careText):[];
 const left=codes(a),right=codes(b);
 return left.length>0&&right.length>0&&left.some(x=>right.some(y=>x.match(/^[A-Z]+/)?.[0]===y.match(/^[A-Z]+/)?.[0]));
}
