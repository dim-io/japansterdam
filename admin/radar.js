// Private source browser; loading results never starts a paid scrape.
import {compareRadarResults,mergeRadarResult,publicationLabel,radarScore} from './radar-data.js?v=time-1';
export async function radarView({root,h,read,toast}){
 let rows=new Map(),offset=0,selected=[],active=false,cycle=75,filterBrand='',query='',sort='recent',max='70',includeOld=false,busy=false,onlyUnread=false,walking=false,updated=null,minScore='',includeUnrated=true;
 const loadedRuns=new Set(),failures=new Map();
 const storage='jp_radar_read';let seen=new Set();try{seen=new Set(JSON.parse(localStorage.getItem(storage)||'[]'));}catch{}
 const controls=h('section',{class:'radar-controls'}),summary=h('p',{role:'status'}),sortNote=h('p',{class:'radar-sort-note'}),grid=h('div',{class:'radar-grid'}),footer=h('div',{class:'radar-footer'});
 const euro=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(n);
 const date=v=>v?new Date(v).toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'}):'Onbekend';
 const button=(name,fn)=>h('button',{type:'button',class:'btn',onclick:fn},name);
 const brands=h('select',{'aria-label':'Merk',onchange:e=>{filterBrand=e.target.value;paint();}});
 const search=h('input',{type:'search',placeholder:'Zoek model, materiaal of titel','aria-label':'Zoek resultaten',oninput:e=>{query=e.target.value;paint();}});
 const price=h('input',{type:'number',min:0,value:max,placeholder:'Maximum €','aria-label':'Maximumprijs',oninput:e=>{max=e.target.value;paint();}});
 const order=h('select',{'aria-label':'Sorteren',onchange:e=>{sort=e.target.value;paint();}},[['recent','Nieuwste plaatsing'],['score','Hoogste AI-dealscore'],['found','Laatst gevonden'],['price','Laagste prijs'],['brand','Merk A–Z']].map(([value,label])=>h('option',{value},label)));
 const scores=h('select',{'aria-label':'Minimum AI-dealscore',onchange:e=>{minScore=e.target.value;paint();}},[['','Alle scores'],['50','50+'],['60','60+'],['70','70+'],['80','80+'],['unrated','Nog niet beoordeeld']].map(([value,label])=>h('option',{value},label)));
 const unrated=h('input',{type:'checkbox',checked:true,onchange:e=>{includeUnrated=e.target.checked;paint();}});
 const old=h('input',{type:'checkbox',onchange:e=>{includeOld=e.target.checked;paint();}});
 const unread=h('input',{type:'checkbox',onchange:e=>{onlyUnread=e.target.checked;paint();}});
 const loading=button('Meer zoekrondes laden',()=>load());
 const all=button('Alle beschikbare zoekrondes laden',async()=>{if(busy||walking)return;walking=true;try{do{if(!await load())break;}while(offset!==null);}finally{walking=false;}});
 const refresh=button('Ververs resultaten',()=>load(true));
 controls.append(h('label',{class:'field'},h('span',{},'Merk'),brands),h('label',{class:'field'},h('span',{},'Zoeken'),search),h('label',{class:'field'},h('span',{},'Prijs'),price),h('label',{class:'field'},h('span',{},'Volgorde'),order),h('label',{class:'field'},h('span',{},'AI-dealscore'),scores),h('label',{},unrated,' Ook nog niet beoordeeld bij scorefilter'),h('label',{},old,' Ook eerder gevonden, inmiddels uitgeschakelde merken'),h('label',{},unread,' Alleen nog niet bekeken'));
 root.replaceChildren(h('h2',{},'Radar — alle bronresultaten'),h('p',{},'Bekijk de recentste zoekresultaten, ook als ze geen melding kregen. Het overzicht ververst iedere minuut zolang je het bekijkt. Kleine maten en damesstukken blijven zichtbaar.'),h('details',{class:'radar-score-guide'},h('summary',{},'Hoe werkt de AI-dealscore?'),h('p',{},'1–100 punten om koopkansen te rangschikken: prijs 40, aansluiting bij Japansterdam 25, opgegeven staat 20 en onderbouwing 15. De AI leest advertentietekst; foto’s en authenticiteit worden hiermee niet gecontroleerd. Zonder prijsreferentie is de score terughoudender. Een eigen shopvraagprijs is geen bewezen verkoopwaarde; scores blijven daarom onder 90.'),h('p',{},'Beoordelingen worden in kleine batches opgeslagen binnen een dagbudget. Verversen start geen AI-call. Ontbreekt een beoordeling, dan blijft het stuk zichtbaar. Kies een minimumscore en zet “Ook nog niet beoordeeld” uit om alleen beoordeelde stukken te zien.')),controls,refresh,sortNote,summary,grid,footer);
 const value=radarScore;
 function saveSeen(){try{localStorage.setItem(storage,JSON.stringify([...seen].slice(-3000)));}catch{}}
 function paint(renderCards=true){
  const allowed=new Set(selected);const q=query.trim().toLowerCase();
  const filtered=[...rows.values()].filter(r=>(includeOld||allowed.has(r.brand))&&(!filterBrand||r.brand===filterBrand)&&(!q||(r.title+' '+r.category).toLowerCase().includes(q))&&(max===''||r.currency==='EUR'&&r.price<=Number(max))&&(!onlyUnread||!seen.has(r.id))&&(!minScore||(minScore==='unrated'?value(r)===null&&r.dealRating?.state!=='not_eligible':value(r)!==null?value(r)>=Number(minScore):includeUnrated&&r.dealRating?.state!=='not_eligible')));
  order.value=sort;
  filtered.sort((a,b)=>compareRadarResults(a,b,sort));
  const unknown=filtered.filter(r=>!Number.isFinite(Date.parse(r.uploadedAt))).length;
  sortNote.textContent=sort==='recent'?`Nieuwste plaatsing: van links naar rechts, rij voor rij. “ca.” betekent geschat uit de ouderdom bij de bron.${unknown?' '+unknown+' items zonder plaatsingstijd staan onderaan.':''}`:sort==='found'?'Laatst gevonden: op de laatste broncontrole. Een recent gecontroleerd item kan al langer te koop staan.':'';
  const failed=[...failures.values()].reduce((sum,n)=>sum+n,0);
  const rated=filtered.filter(r=>value(r)!==null).length;
  summary.textContent=`${filtered.length} zichtbare / ${rows.size} unieke resultaten · ${rated} met AI-score · ${loadedRuns.size} zoekrondes geladen${failed?' · '+failed+' datasets konden niet worden geladen':''}. ${active?'Radar actief':'Proef afgelopen; dit overzicht leest de historie'}. Volledige merkencyclus: ${cycle} minuten.${updated?' Bijgewerkt '+updated.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})+'.':''} Meldingen zijn een aparte selectie.`;
  if(renderCards)grid.replaceChildren(...filtered.flatMap((r,index)=>{
   const card=h('article',{class:'radar-card'+(seen.has(r.id)?' is-read':'')});
   card.append(h('div',{class:'radar-card__time'},sort==='recent'?h('span',{class:'radar-rank'},String(index+1)+'.'):null,h('time',{datetime:r.uploadedAt||null,title:r.uploadTimeKind==='exact'?'Plaatsingstijd uit de bron':r.sourceAge?'Geschat uit bronleeftijd: '+r.sourceAge:'De bron geeft geen plaatsingstijd.'},publicationLabel(r))));
   const open=()=>{seen.add(r.id);saveSeen();card.classList.add('is-read');};
   if(r.image)card.append(h('a',{href:r.url,target:'_blank',rel:'noopener',onclick:open},h('img',{src:r.image,alt:r.title,loading:'lazy',referrerpolicy:'no-referrer'})));
   const rating=r.dealRating,score=value(r),ratingBlock=h('div',{class:'radar-rating'});
   ratingBlock.append(h('span',{class:'radar-score'+(score!==null?' is-scored':'')},score!==null?`AI ${score}/100`:rating?.state==='pending'?'In beoordeling':rating?.state==='not_eligible'?'Buiten scoreselectie':['failed','unavailable'].includes(rating?.state)?'Beoordeling niet beschikbaar':'Nog niet beoordeeld'));
   if(score!==null){
    ratingBlock.append(h('p',{class:'radar-score-reason'},rating.reason),h('details',{},h('summary',{},'Indicatief · bekijk onderbouwing'),h('p',{},`Prijs ${rating.parts.price}/40 · Collectie ${rating.parts.fit}/25 · Staat ${rating.parts.condition}/20 · Onderbouwing ${rating.parts.evidence}/15`),h('p',{},rating.referenceBasis==='shop_asking'?'Met eigen shopvraagprijs als indicatie; geen bevestigde marktwaarde.':'Zonder passende prijsreferentie; beperkte onderbouwing.'),h('p',{},'Beoordeling op advertentietekst · '+date(rating.ratedAt))));
   }
   card.append(ratingBlock);
   card.append(h('div',{class:'radar-card__body'},h('h3',{},r.title),h('p',{},`${r.currency==='EUR'?euro(r.price):r.price+' '+r.currency} · ${r.size||'Maat onbekend'} · ${r.condition||'Staat onbekend'}`),h('p',{class:'radar-meta'},'Laatste broncontrole: '+date(r.observedAt)),h('p',{class:'radar-meta'},r.category),h('div',{class:'radar-links'},h('a',{href:r.url,target:'_blank',rel:'noopener',onclick:open},'Bekijk op Vinted ↗'),h('a',{href:r.runUrl,target:'_blank',rel:'noopener'},'Zoekronde in Apify ↗'),button(seen.has(r.id)?'Bekeken ✓':'Markeer bekeken',()=>{seen.add(r.id);saveSeen();paint();}))));
   const unknownStart=sort==='recent'&&!Number.isFinite(Date.parse(r.uploadedAt))&&(index===0||Number.isFinite(Date.parse(filtered[index-1].uploadedAt)));
   return unknownStart?[h('p',{class:'radar-time-divider'},'Plaatsingstijd onbekend — deze items staan onderaan de tijdsvolgorde.'),card]:[card];
  }));
  if(renderCards&&!filtered.length)grid.append(h('p',{},'Geen resultaten binnen deze filters. Laad meer zoekrondes of pas de filters aan.'));
  loading.disabled=busy||offset===null;all.disabled=busy||offset===null;
  refresh.disabled=busy;
  footer.replaceChildren(loading,all,h('p',{},'Laden leest bestaande resultaten en start geen scraper. Filters gelden voor de geladen historie. Bekeken-markeringen worden op dit apparaat bewaard.'));
 }
 async function load(latest=false){
  if(busy||!root.contains(grid)||!latest&&offset===null)return false;
  const page=latest?0:offset;let changed=false;busy=true;paint(false);
  try{const data=await read(page);for(const row of data.rows){const prev=rows.get(row.id),merged=mergeRadarResult(prev,row);if(JSON.stringify(prev)!==JSON.stringify(merged)){rows.set(row.id,merged);changed=true;}}
   selected=data.selectedBrands;active=data.active;cycle=data.cycleMinutes;for(const id of data.runIds||data.rounds.map(r=>r.id))loadedRuns.add(id);failures.set(page,data.failedDatasets);updated=new Date();if(!latest)offset=data.nextOffset;
   const choices=[...new Set([...selected,...[...rows.values()].map(r=>r.brand)])].sort();brands.replaceChildren(h('option',{value:''},'Alle merken'),...choices.map(b=>h('option',{value:b,selected:b===filterBrand},b)));
   return true;
  }catch(e){toast(e.message,true);return false;}finally{busy=false;if(root.contains(grid))paint(changed||!grid.childElementCount);}
 }
 // Skip a few empty pages automatically; a quiet recent batch need not make
 // the entire history look empty. This reads existing datasets only.
 for(let page=0;page<4;page++){
  if(!await load()||offset===null||[...rows.values()].filter(r=>selected.includes(r.brand)&&r.currency==='EUR'&&r.price<=70).length>=24)break;
 }
 const timer=setInterval(()=>{
  if(!root.contains(grid)){clearInterval(timer);return;}
  if(active&&document.visibilityState==='visible'&&!busy&&!walking)void load(true);
 },60000);
}
