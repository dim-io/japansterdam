export class AccountingError extends Error {constructor(status,message){super(message);this.name='AccountingError';this.status=status;}}
export const fail=(message,status=400)=>{throw new AccountingError(status,message);};
const text=(v,n=500)=>typeof v==='string'?v.trim().slice(0,n):'';
export function cents(v){if(!Number.isSafeInteger(v)||v<0||v>100000000)fail('Bedrag moet in hele eurocenten zijn (maximaal €1.000.000).');return v;}
export function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;}
export function cleanSettings(b={}){
 const s={company:text(b.company,120)||'Japansterdam',vatId:text(b.vatId,30).toUpperCase(),korStatus:b.korStatus==='confirmed'?'confirmed':'requested',korStart:text(b.korStart,10),korEnd:text(b.korEnd,10),notes:text(b.notes,3000),otherTurnover:{}};
 if(s.vatId&&!/^NL\d{9}B\d{2}$/.test(s.vatId))fail('Ongeldig Nederlands btw-identificatienummer.');
 if(s.korStatus==='confirmed'&&!validDate(s.korStart))fail('Vul de bevestigde KOR-ingangsdatum in.');
 if(s.korEnd&&(!validDate(s.korEnd)||s.korEnd<=s.korStart))fail('Ongeldige KOR-einddatum.');
 for(const [y,v] of Object.entries(b.otherTurnover||{})){if(!/^20\d{2}$/.test(y))fail('Ongeldig omzetjaar.');s.otherTurnover[y]=cents(v);}
 return s;
}
export function cleanEntry(b,kind,state){
 if(!b||typeof b!=='object'||Array.isArray(b))fail('Ongeldige boeking.');
 if(!['purchase','sale','expense','refund'].includes(kind)||!['draft','posted'].includes(state))fail('Ongeldig boekingstype.');
 const d={date:text(b.date,10),description:text(b.description,250),channel:text(b.channel,80),reference:text(b.reference,150),paymentReference:text(b.paymentReference,200),paidFrom:['business','private','unpaid','unknown'].includes(b.paidFrom)?b.paidFrom:'unknown',reconciled:b.reconciled===true,notes:text(b.notes,3000),amountCents:cents(b.amountCents??0)};
 if(d.date&&!validDate(d.date))fail('Ongeldige datum.');
 if(state==='posted'&&d.date>new Date().toISOString().slice(0,10))fail('Een geboekte datum kan niet in de toekomst liggen.');
 if(state==='posted'&&(!d.date||!d.description||d.amountCents===0))fail('Voor boeken zijn datum, omschrijving en een positief bedrag verplicht.');
 if(kind==='purchase'){
  Object.assign(d,{seller:text(b.seller,200),sellerAddress:text(b.sellerAddress,500),sellerType:['private','margin','business','unknown'].includes(b.sellerType)?b.sellerType:'unknown',country:text(b.country,2).toUpperCase(),buyerFeeCents:cents(b.buyerFeeCents??0),inboundShippingCents:cents(b.inboundShippingCents??0),otherCostCents:cents(b.otherCostCents??0),lines:[]});
  if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>50)fail('Voeg 1 tot 50 afzonderlijke kledingstukken toe.');
  d.lines=b.lines.map(l=>({description:text(l.description,250),productSlug:text(l.productSlug,200),amountCents:cents(l.amountCents??0)}));
  if(d.lines.reduce((s,l)=>s+l.amountCents,0)!==d.amountCents)fail('De stukprijzen moeten samen gelijk zijn aan de kale aankoopprijs.');
  if(state==='posted'&&(!d.seller||!d.lines.every(l=>l.description&&l.amountCents>0)))fail('Vul verkoper, omschrijvingen en stukprijzen in.');
 } else if(kind==='sale'){
  Object.assign(d,{itemKey:text(b.itemKey,50),shippingChargedCents:cents(b.shippingChargedCents??0),feeCents:cents(b.feeCents??0),outboundShippingCents:cents(b.outboundShippingCents??0),packagingCents:cents(b.packagingCents??0),otherCostCents:cents(b.otherCostCents??0),country:text(b.country,2).toUpperCase(),orderId:text(b.orderId,100),costsConfirmed:b.costsConfirmed===true});
  if(state==='posted'&&(!/^\d+:\d+$/.test(d.itemKey)||!d.costsConfirmed))fail('Koppel een inkoopstuk en bevestig de verkoopkosten.');
 }else if(kind==='refund'){
  Object.assign(d,{saleId:Number(b.saleId)||0,restock:b.restock===true,otherCostCents:cents(b.otherCostCents??0)});
  if(state==='posted'&&!Number.isSafeInteger(d.saleId))fail('Kies de oorspronkelijke verkoop.');
 }else Object.assign(d,{category:text(b.category,80)||'Overig',supplier:text(b.supplier,200),invoiceVatCents:cents(b.invoiceVatCents??0),taxReview:b.taxReview===true});
 if(kind==='expense'&&d.invoiceVatCents>d.amountCents)fail('Factuur-btw kan niet hoger zijn dan de factuur.');
 return d;
}
// Largest-remainder allocation guarantees that bundle totals reconcile to the cent.
export function allocate(total,weights){
 if(!Number.isSafeInteger(total)||total<0||!weights.length||weights.some(w=>!Number.isSafeInteger(w)||w<0))fail('Ongeldige kostentoerekening.');
 const sum=weights.reduce((s,w)=>s+w,0);if(!sum)return weights.map((_,i)=>Math.floor(total/weights.length)+(i<total%weights.length?1:0));
 const rows=weights.map((w,i)=>({i,n:Number(BigInt(total)*BigInt(w)/BigInt(sum)),r:BigInt(total)*BigInt(w)%BigInt(sum)}));let left=total-rows.reduce((s,x)=>s+x.n,0);
 for(const r of [...rows].sort((a,b)=>a.r===b.r?a.i-b.i:a.r>b.r?-1:1)){if(left--<=0)break;r.n++;}return rows.map(x=>x.n);
}
export const gross=d=>d.amountCents+(d.shippingChargedCents||0);
export const purchaseCost=d=>d.amountCents+d.buyerFeeCents+d.inboundShippingCents+d.otherCostCents;
export function bookView(entries,settings={},year=new Date().getUTCFullYear()){
 const end=`${year}-12-31`,start=`${year}-01-01`,posted=entries.filter(e=>e.state==='posted'&&e.data.date<=end).sort((a,b)=>a.data.date.localeCompare(b.data.date)||a.id-b.id);
 const stock=new Map(),sales=new Map();let revenue=0,costOfSales=0,sellingCosts=0,expenses=0,purchases=0,cashIn=0,cashOut=0;
 const warnings=[];let running=settings.otherTurnover?.[year]||0,maxTurnover=running;
 for(const e of posted){const d=e.data,inYear=d.date>=start;
  if(e.kind==='purchase'){
   const shares=allocate(d.buyerFeeCents+d.inboundShippingCents+d.otherCostCents,d.lines.map(l=>l.amountCents));
   d.lines.forEach((l,i)=>stock.set(`${e.id}:${i}`,{key:`${e.id}:${i}`,purchaseId:e.id,date:d.date,description:l.description,productSlug:l.productSlug,cost:l.amountCents+shares[i],basePrice:l.amountCents,available:true}));
   if(inYear){purchases+=purchaseCost(d);if(d.paidFrom!=='unpaid')cashOut+=purchaseCost(d);}
   if(d.amountCents>=50000)warnings.push(`Inkoop ${e.id}: controleer ondertekende inkoopverklaring (vanaf €500 bij één leverancier).`);
   if(d.sellerType==='unknown')warnings.push(`Inkoop ${e.id}: verkoperstype nog onbekend.`);
  }else if(e.kind==='sale'){
   const item=stock.get(d.itemKey);const cost=item?.cost||0;if(item)item.available=false;else warnings.push(`Verkoop ${e.id}: inkoopkoppeling ontbreekt.`);
   if(!d.country||d.country!=='NL')warnings.push(`Verkoop ${e.id}: land klant / buitenlandse btw-behandeling controleren.`);
   sales.set(e.id,{entry:e,cost,refunded:0});
   if(inYear){revenue+=gross(d);running+=gross(d);maxTurnover=Math.max(maxTurnover,running);costOfSales+=cost;sellingCosts+=d.feeCents+d.outboundShippingCents+d.packagingCents+d.otherCostCents;if(d.paidFrom!=='unpaid'){cashIn+=gross(d);cashOut+=d.feeCents+d.outboundShippingCents+d.packagingCents+d.otherCostCents;}}
  }else if(e.kind==='refund'){
   const original=sales.get(d.saleId);if(original){original.refunded+=d.amountCents;if(d.restock){const item=stock.get(original.entry.data.itemKey);if(item)item.available=true;if(inYear)costOfSales-=original.cost;}}
   if(inYear){revenue-=d.amountCents;running-=d.amountCents;sellingCosts+=d.otherCostCents;if(d.paidFrom!=='unpaid')cashOut+=d.amountCents+d.otherCostCents;}
  }else if(inYear){expenses+=d.amountCents;if(d.paidFrom!=='unpaid')cashOut+=d.amountCents;}
 }
 const inventory=[...stock.values()].filter(i=>i.available),turnover=revenue+(settings.otherTurnover?.[year]||0);
 return {year,revenue,costOfSales,sellingCosts,expenses,purchases,inventoryValue:inventory.reduce((s,i)=>s+i.cost,0),inventory,resultBeforeTaxes:revenue-costOfSales-sellingCosts-expenses,cashIn,cashOut,cashMovement:cashIn-cashOut,korTurnover:turnover,korRemaining:Math.max(0,2000000-turnover),korExceeded:maxTurnover>2000000,warnings:[...new Set(warnings)],drafts:entries.filter(e=>e.state==='draft').length};
}
export function validatePosting(entries,kind,d,ignoreId){
 const posted=entries.filter(e=>e.state==='posted'&&e.id!==ignoreId);
 if(kind==='sale'){
  const purchase=posted.find(e=>e.kind==='purchase'&&String(e.id)===d.itemKey.split(':')[0]);
  if(!purchase||purchase.data.date>d.date)fail('De geboekte inkoop ontbreekt of ligt na de verkoopdatum.');
  const linkedSales=posted.filter(e=>e.kind==='sale'&&e.data.itemKey===d.itemKey);
  const linkedIds=new Set(linkedSales.map(e=>e.id));
  if(posted.some(e=>((e.kind==='sale'&&linkedIds.has(e.id))||(e.kind==='refund'&&linkedIds.has(e.data.saleId)))&&e.data.date>d.date))fail('De verkoopdatum ligt vóór een latere voorraadmutatie van dit stuk.');
  const inventory=bookView(posted,{},Number(d.date.slice(0,4))).inventory;
  if(!inventory.some(i=>i.key===d.itemKey))fail('Dit stuk is niet beschikbaar in de administratie.');
 }else if(kind==='refund'){
  const sale=posted.find(e=>e.id===d.saleId&&e.kind==='sale');if(!sale||sale.data.date>d.date)fail('Oorspronkelijke verkoop ontbreekt of datum is onjuist.');
  const refunds=posted.filter(e=>e.kind==='refund'&&e.data.saleId===d.saleId);
  if(d.amountCents+refunds.reduce((s,e)=>s+e.data.amountCents,0)>gross(sale.data))fail('Terugbetaling is hoger dan de oorspronkelijke omzet.');
  if(d.restock&&(refunds.length||d.amountCents!==gross(sale.data)))fail('Terug op voorraad kan alleen bij één volledige terugbetaling.');
 }
}
export function csv(rows){return '\ufeff'+rows.map(r=>r.map(v=>{let s=String(v??'');if(typeof v==='string'&&/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(';')).join('\r\n');}
