import {identifyBrand,normalize} from './scoring.mjs';
import {itemType} from './valuation.mjs';

const contains=(text,term)=>(' '+normalize(text)+' ').includes(' '+normalize(term)+' ');
export function canonicalListingBrand(item,config) {
  const direct=identifyBrand(item.brand,config);
  if(direct)return direct;
  const text=item.title+' '+(item.description||'');
  for(const [brand,names] of Object.entries(config.brandFieldFamilies||{})){
    if(names.some(name=>normalize(name)===normalize(item.brand))
      &&config.selectionProfiles?.[brand]?.requiredTerms?.some(term=>contains(text,term))
      &&!selectionRejection({...item,brand},config))return brand;
  }
  return null;
}
export function brandClaimSupported(item,config) {
  const brand=identifyBrand(item.brand,config);
  return !!brand&&[brand,...(config.aliases[brand]||[])].some(name=>contains(item.title+' '+(item.description||''),name));
}

// A brand field alone cannot establish a Japanese label or a limited ASICS line.
// These restrictions also apply to priced candidates, before photo/alert budgets.
export function selectionRejection(item,config) {
  const brand=identifyBrand(item.brand,config),profile=config.selectionProfiles?.[brand];
  if(!profile)return ['footwear','accessory'].includes(itemType(item))?'garment_type_unknown':null;
  const text=item.title+' '+(item.description||'');
  if(profile.excludedTerms?.some(term=>contains(text,term)))return 'excluded_brand_line';
  if(profile.allowedTypes&&!profile.allowedTypes.includes(itemType(item)))return 'product_type_outside_selection';
  if(brand==='Porter Yoshida'){
    const bagText=normalize(text+' '+(item.category||''));
    if(/\b(wallet|pouch|coin purse|card holder|key case|keychain|key ring|portemonnee|portefeuille|geldbeutel)\b/.test(bagText))return 'porter_non_bag_accessory';
    if(!/\b(bags?|backpacks?|rucksacks?|totes?|briefcases?|tas|tassen|rugzak|reistas|sac|sacs|sacoche|borsa|zaino|tasche)\b/.test(bagText))return 'porter_bag_category_unconfirmed';
  }
  if(profile.requiredTerms&&!profile.requiredTerms.some(term=>contains(text,term)))return 'selected_line_unconfirmed';
  return null;
}
