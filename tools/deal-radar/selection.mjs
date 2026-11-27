import {identifyBrand,normalize} from './scoring.mjs';
import {itemType} from './valuation.mjs';

const contains=(text,term)=>(' '+normalize(text)+' ').includes(' '+normalize(term)+' ');
// Goldwin also makes dedicated snow-sport equipment. Keep its lifestyle and
// technical everyday clothing, but reject ski/snowboard listings in any of the
// source's title, description or category fields, including common EU wording.
export function goldwinSkiwear(item) {
  const text=normalize([item.title,item.description,item.category].filter(Boolean).join(' '));
  return /\b(ski|skis|skiing|skiwear|skikleding|skijas|skijassen|skijack|skijacks|skijacket|skijackets|skibroek|skibroeken|skipak|skipakken|skijacke|skijacken|skihose|skihosen|skianzug|skianzuge|skisuit|skisuits|skibukse|skibukser|skidjacka|skidbyxor|snowboard|snowboarding|snowboardwear|snowpants|snowsuit|snowsuits|snowsports|snow sports|sci|sciatore|sciatrice|esqui|esquiar|esquies|narciarskie|narciarska|narciarski|narciarstwo|narty)\b/.test(text);
}
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
  // An owner-requested exclusion also applies to older stored source results
  // and cannot be undone by an older private selection-profile override.
  if(brand==='Goldwin'&&goldwinSkiwear(item))return 'goldwin_skiwear';
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
