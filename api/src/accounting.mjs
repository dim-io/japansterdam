import {AccountingError,fail,cleanSettings,cleanEntry,validatePosting,bookView,purchaseCost,gross,csv,allocate} from './accounting-core.mjs';
const q=(env,s,...v)=>env.DB.prepare(s).bind(...v);
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const entry=r=>({...r,data:JSON.parse(r.data)});
async function list(env){return (await q(env,'SELECT * FROM accounting_entries ORDER BY id').all()).results.map(entry);}
async function body(req){if(Number(req.headers.get('Content-Length'))>80000)fail('Boeking te groot.',413);const s=await req.text();if(s.length>80000)fail('Boeking te groot.',413);try{return JSON.parse(s);}catch{fail('Ongeldige gegevens.');}}
const event=(env,id,action,before,after,user)=>q(env,'INSERT INTO accounting_events(entry_id,action,before_data,after_data,actor_id,created_at) VALUES (?,?,?,?,?,?)',id,action,before?JSON.stringify(before):null,JSON.stringify(after),user.id,Date.now());
async function settings(env){const row=await q(env,"SELECT data FROM accounting_settings WHERE id='main'").first();return cleanSettings(row?JSON.parse(row.data):{});}
async function getRow(env,id){const r=await q(env,'SELECT * FROM accounting_entries WHERE id=?',id).first();if(!r)fail('Boeking niet gevonden.',404);return entry(r);}
export async function accountingRoute(req,env,user){
 const u=new URL(req.url),path=u.pathname.replace('/admin/accounting',''),method=req.method;
 if(path===''&&method==='GET'){
  const entries=await list(env),s=await settings(env),year=Number(u.searchParams.get('year')||new Date().getUTCFullYear());if(!Number.isInteger(year)||year<2000||year>2100)fail('Ongeldig jaar.');
  const docs=(await q(env,'SELECT id,entry_id,name,mime,bytes,sha256,created_at FROM accounting_documents ORDER BY created_at').all()).results;
  return response({settings:s,entries,documents:docs,summary:bookView(entries,s,year)});
 }
 if(path==='/settings'&&method==='PUT'){
  const s=cleanSettings(await body(req)),old=await settings(env);
  await env.DB.batch([q(env,"INSERT INTO accounting_settings(id,data,updated_at) VALUES ('main',?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",JSON.stringify(s),Date.now()),event(env,null,'settings',old,s,user)]);
  return response(s);
 }
 if(path==='/entries'&&method==='POST'){
  const b=await body(req);const d=cleanEntry(b.data,b.kind,'draft');
  const r=await q(env,"INSERT INTO accounting_entries(kind,state,data,created_at,updated_at,created_by) VALUES (?,'draft',?,?,?,?) RETURNING *",b.kind,JSON.stringify(d),Date.now(),Date.now(),user.id).first();
  // Creation is itself retained by the immutable row history, even if a later event write fails.
  await event(env,r.id,'create',null,entry(r),user).run();return response(entry(r),201);
 }
 const m=/^\/entries\/(\d+)(?:\/(post|void|documents|payment))?$/.exec(path);
 if(m){
  const id=Number(m[1]),r=await getRow(env,id),action=m[2];
  if(!action&&method==='PUT'){
   const b=await body(req);if(r.state!=='draft')fail('Geboekte regels zijn vergrendeld. Gebruik een correctie met reden.',409);
   const d=cleanEntry(b.data,r.kind,'draft');if(b.revision!==r.revision)fail('De boeking is intussen gewijzigd. Vernieuw de pagina.',409);
   await env.DB.batch([q(env,"UPDATE accounting_entries SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND state='draft'",JSON.stringify(d),Date.now(),id,r.revision),event(env,id,'edit',r,{...r,data:d},user)]);
   return response(await getRow(env,id));
  }
  if(action==='payment'&&method==='POST'){
   const b=await body(req);if(r.state!=='posted'||b.revision!==r.revision)fail('Boeking gewijzigd of niet definitief.',409);
   const d=cleanEntry({...r.data,paidFrom:b.paidFrom,paymentReference:b.paymentReference,reconciled:b.reconciled},r.kind,'posted');
   await env.DB.batch([q(env,"UPDATE accounting_entries SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",JSON.stringify(d),Date.now(),id,r.revision),event(env,id,'payment',r,{...r,data:d},user)]);
   return response(await getRow(env,id));
  }
  if(action==='post'&&method==='POST'){
   const b=await body(req);if(r.state!=='draft'||r.revision!==b.revision)fail('Boeking gewijzigd of al geboekt.',409);
   const d=cleanEntry(r.data,r.kind,'posted');const entries=await list(env);validatePosting(entries,r.kind,d,id);
   if(r.kind==='sale'&&d.orderId&&entries.some(e=>e.id!==id&&e.state==='posted'&&e.kind==='sale'&&e.data.orderId===d.orderId&&e.data.itemKey===d.itemKey))fail('Deze webshopverkoop is al geboekt.',409);
   const ops=[];
   if(r.kind==='sale')ops.push(q(env,'INSERT INTO accounting_stock_claims(item_key,sale_id) VALUES (?,?)',d.itemKey,id));
   if(r.kind==='refund'&&d.restock){const sale=entries.find(e=>e.id===d.saleId);ops.push(q(env,'DELETE FROM accounting_stock_claims WHERE item_key=? AND sale_id=?',sale.data.itemKey,sale.id));}
   ops.push(q(env,"UPDATE accounting_entries SET state='posted',data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND state='draft'",JSON.stringify(d),Date.now(),id,r.revision),event(env,id,'post',r,{...r,data:d,state:'posted'},user));
   try{await env.DB.batch(ops);}catch{fail('Boeking conflicteert met een andere boeking. Vernieuw en controleer de voorraad.',409);}
   return response(await getRow(env,id));
  }
  if(action==='void'&&method==='POST'){
   const b=await body(req),reason=String(b.reason||'').trim();if(reason.length<5)fail('Geef een duidelijke correctiereden (minimaal 5 tekens).');if(r.state==='void'||b.revision!==r.revision)fail('Boeking gewijzigd of al vervallen.',409);
   const entries=await list(env),deps=entries.filter(e=>e.state==='posted'&&((r.kind==='purchase'&&e.kind==='sale'&&e.data.itemKey.startsWith(id+':'))||(r.kind==='sale'&&e.kind==='refund'&&e.data.saleId===id)));
   if(deps.length)fail('Corrigeer eerst de gekoppelde verkopen of terugbetalingen.',409);
   const ops=[];if(r.kind==='sale')ops.push(q(env,'DELETE FROM accounting_stock_claims WHERE sale_id=?',id));
   if(r.kind==='refund'&&r.data.restock){const sale=entries.find(e=>e.id===r.data.saleId);ops.push(q(env,'INSERT INTO accounting_stock_claims(item_key,sale_id) VALUES (?,?)',sale.data.itemKey,sale.id));}
   ops.push(q(env,"UPDATE accounting_entries SET state='void',revision=revision+1,updated_at=? WHERE id=? AND revision=?",Date.now(),id,r.revision),event(env,id,'void',r,{reason,state:'void'},user));
   try{await env.DB.batch(ops);}catch{fail('Correctie conflicteert met latere voorraadboekingen.',409);}return response(await getRow(env,id));
  }
  if(action==='documents'&&method==='POST'){
   if(Number(req.headers.get('Content-Length'))>3300000)fail('Bestand maximaal 3 MB.',413);
   const form=await req.formData(),file=form.get('file');if(!file||typeof file.arrayBuffer!=='function'||file.size>3145728||file.size===0)fail('Kies een PNG, JPEG, WebP of PDF van maximaal 3 MB.');
   const bytes=new Uint8Array(await file.arrayBuffer());let mime='';
   if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)mime='image/png';
   if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
   if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')mime='image/webp';
   if(new TextDecoder().decode(bytes.slice(0,5))==='%PDF-')mime='application/pdf';
   if(!mime)fail('Niet-ondersteund bestand.');
   const docId=crypto.randomUUID(),key='accounting-private/'+docId,sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
   await env.IMAGES.put(key,bytes);
   try{await env.DB.batch([q(env,'INSERT INTO accounting_documents(id,entry_id,storage_key,name,mime,bytes,sha256,created_at) VALUES (?,?,?,?,?,?,?,?)',docId,id,key,String(file.name).slice(0,150),mime,bytes.length,sha,Date.now()),event(env,id,'document',null,{id:docId,sha256:sha},user)]);}catch(e){await env.IMAGES.delete(key);throw e;}
   return response({id:docId,sha256:sha},201);
  }
 }
 const dm=/^\/documents\/([\w-]+)$/.exec(path);
 if(dm&&method==='GET'){
  const doc=await q(env,'SELECT * FROM accounting_documents WHERE id=?',dm[1]).first();if(!doc)fail('Bewijsstuk niet gevonden.',404);
  const bytes=await env.IMAGES.get(doc.storage_key,{type:'arrayBuffer'});if(!bytes)fail('Bewijsstuk tijdelijk niet beschikbaar.',503);
  const a=new Uint8Array(bytes);let binary='';for(let i=0;i<a.length;i+=16000)binary+=String.fromCharCode(...a.subarray(i,i+16000));
  return response({name:doc.name,mime:doc.mime,sha256:doc.sha256,base64:btoa(binary)});
 }
 if(path==='/export'&&method==='GET'){
  const entries=await list(env),s=await settings(env),documents=(await q(env,'SELECT id,entry_id,name,mime,bytes,sha256,created_at FROM accounting_documents').all()).results,events=(await q(env,'SELECT * FROM accounting_events ORDER BY id').all()).results;
  const rows=[['ID','Type','Status','Datum','Omschrijving','Kanaal','Referentie','Kaal bedrag cent','Totale inkoop cent','Omzet incl verzending cent','Betaalbron','Bank gecontroleerd','Vinted kosten cent','Inkomend verzenden cent','Uitgaand verzenden cent','Platform betaalkosten cent','Verpakking cent','Overige directe kosten cent','Doorberekende verzending cent','Inkoopstuk','Factuur btw registratie cent','Gegevens JSON'],...entries.map(e=>[e.id,e.kind,e.state,e.data.date,e.data.description,e.data.channel,e.data.reference,e.data.amountCents,e.kind==='purchase'?purchaseCost(e.data):'',e.kind==='sale'?gross(e.data):e.kind==='refund'?-e.data.amountCents:'',e.data.paidFrom,e.data.reconciled?1:0,e.data.buyerFeeCents||0,e.data.inboundShippingCents||0,e.data.outboundShippingCents||0,e.data.feeCents||0,e.data.packagingCents||0,e.data.otherCostCents||0,e.data.shippingChargedCents||0,e.data.itemKey||'',e.data.invoiceVatCents||0,JSON.stringify(e.data)])];
  const lineRows=[['Inkoop-ID','Status','Datum','Stuk','Omschrijving','Webshopslug','Kale prijs cent','Toegerekende kosten cent','Totale kostprijs cent']];
  for(const e of entries.filter(e=>e.kind==='purchase')){const d=e.data,shares=allocate(d.buyerFeeCents+d.inboundShippingCents+d.otherCostCents,d.lines.map(l=>l.amountCents));d.lines.forEach((l,i)=>lineRows.push([e.id,e.state,d.date,e.id+':'+i,l.description,l.productSlug,l.amountCents,shares[i],l.amountCents+shares[i]]));}
  return response({lineCsv:csv(lineRows),exportedAt:new Date().toISOString(),version:1,settings:s,entries,documents,events,csv:csv(rows),notice:'Bewijsbestanden zijn niet inbegrepen. Download deze afzonderlijk. Dit is geen btw-aangifte of definitieve jaarrekening.'});
 }
 fail('Administratieroute niet gevonden.',404);
}
