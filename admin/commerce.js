// Checkout setup and order management use the existing authenticated admin client.
export async function commerceView({view,root,h,api,toast,products}){
 const euro=c=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
 if(view==='orders'){
  const orders=await api('/admin/orders');
  const cards=orders.map(o=>{
   const info=h('div',{class:'item'},h('h3',{},'JPN-'+o.id),h('p',{},`${o.mode.toUpperCase()} · ${o.status} · ${euro(o.total)} · ${o.fulfillment}`),h('p',{},new Date(o.createdAt).toLocaleString('nl-NL')),h('p',{},o.customer.name+' · '+o.customer.email),h('p',{},[o.customer.street,o.customer.zip+' '+o.customer.city,o.customer.country].join(', ')),h('p',{},o.items.map(p=>p.brand+' '+p.name+' / '+p.size).join(' · ')));
   if(o.customer.note)info.append(h('p',{},'Customer note: '+o.customer.note));
   if(o.setupError)info.append(h('p',{class:'form-error'},'Payment setup is unconfirmed. Keep the piece reserved and check Mollie.'));
   if(o.refunded||o.chargeback)info.append(h('p',{class:'form-error'},`Refunded: ${euro(o.refunded)} · Charged back: ${euro(o.chargeback)}. Check Mollie before shipping.`));
   if(o.withdrawal)info.append(h('p',{class:'form-error'},'Withdrawal requested '+new Date(o.withdrawal.requested_at).toLocaleString('nl-NL')+' · '+o.withdrawal.note));
   if(o.messages.length)info.append(h('p',{class:'hint'},'Confirmations: '+o.messages.map(m=>m.kind+' '+m.state+(m.attempts>=5?' — check delivery manually':'')).join(' · ')));
   const refresh=h('button',{class:'btn btn--sm',onclick:async()=>{refresh.disabled=true;try{await api('/admin/orders/'+o.id,{method:'POST',body:{action:'sync'}});await commerceView({view,root,h,api,toast,products});}catch(e){toast(e.message,true);refresh.disabled=false;}}},'Check payment / confirmations');
   info.append(refresh);
   if(o.mode==='live'&&o.status==='paid'&&!o.refunded&&!o.chargeback){
    const tracking=h('input',{type:'url',placeholder:'https://… tracking link',value:o.tracking,'aria-label':'Tracking link'});
    const ship=h('button',{class:'btn btn--sm',onclick:async()=>{ship.disabled=true;try{await api('/admin/orders/'+o.id,{method:'POST',body:{action:'ship',tracking:tracking.value}});toast('Marked as shipped');await commerceView({view,root,h,api,toast,products});}catch(e){toast(e.message,true);ship.disabled=false;}}},'Mark as shipped');info.append(h('div',{class:'toolbar'},tracking,ship));
   }
   if(o.mode==='live'&&o.refunded>=o.total&&o.fulfillment!=='returned')info.append(h('button',{class:'btn btn--sm',onclick:async()=>{if(!confirm('Have all returned pieces arrived and been inspected? They will stay marked sold until you manually relist them.'))return;try{await api('/admin/orders/'+o.id,{method:'POST',body:{action:'release-returned',confirmed:true}});toast('Stock released for manual relisting');await commerceView({view,root,h,api,toast,products});}catch(e){toast(e.message,true);}}},'Return received: release for manual relisting'));
   info.append(h('p',{},h('a',{href:'https://my.mollie.com/dashboard/payments',target:'_blank',rel:'noopener'},'Open Mollie for refunds / payment details ↗')));return info;
  });
  root.replaceChildren(h('h1',{},'Orders'),h('p',{class:'hint'},'Live payments and test payments are separate. Test payments never mark real products sold. Refunds are handled in Mollie; refunded pieces are not automatically relisted.'),...cards.length?cards:[h('p',{},'No orders yet.')]);return;
 }
 const state=await api('/admin/checkout'),s=state.settings;
 const form=h('form',{class:'commerce-settings'}),fields={};
 form.append(h('h1',{},'Checkout settings'),h('p',{class:'hint'},'Checkout stays off until payment processing, confirmation email, shipping and business details are ready. Until then the current order-request checkout remains available.'),h('p',{},`Mollie key: ${state.keyMode} · Confirmation email: ${state.emailConfigured?'configured':'not configured'}`));
 const field=(key,label,{long=false,type='text'}={})=>{const input=h(long?'textarea':'input',long?{rows:4}:{type});input.value=s[key]||'';fields[key]=input;form.append(h('label',{class:'field'},h('span',{},label),input));};
 for(const [key,label] of [['company','Registered company / trade name'],['kvk','KvK number (8 digits)'],['vat','VAT ID (if applicable)'],['address','Registered business address'],['email','Order notification / contact email'],['returnAddress','Return address'],['taxNote','Price / tax explanation (check VAT or margin scheme with your accountant)']])field(key,label);
 for(const [key,label] of [['deliveryText','Delivery times, carriers and shipping information'],['termsText','Purchase terms, complaints and statutory conformity information'],['returnsText','Returns: 14-day withdrawal, return instructions, return costs and refunds'],['privacyText','Privacy: customer information, payment/email providers, purposes and retention']])field(key,label,{long:true});
 const shipping=h('div',{}),rates=s.shipping.map(r=>({...r}));
 const drawRates=()=>{
  shipping.replaceChildren(h('h2',{},'Shipping prices per country'));
  rates.forEach((r,i)=>{
   const country=h('input',{placeholder:'NL',maxlength:2,'aria-label':'Country code',value:r.country}),price=h('input',{type:'number',min:0,max:1000,step:'0.01','aria-label':'Shipping price in euros',value:r.cents===''?'':String(r.cents/100)});
   country.oninput=()=>r.country=country.value.toUpperCase();price.oninput=()=>r.cents=price.value===''?'':Math.round(Number(price.value)*100);
   shipping.append(h('div',{class:'toolbar'},country,price,h('button',{type:'button',class:'btn btn--sm',onclick:()=>{rates.splice(i,1);drawRates();}},'Remove')));
  });
  shipping.append(h('button',{type:'button',class:'btn btn--sm',onclick:()=>{rates.push({country:'',cents:''});drawRates();}},'+ Add shipping country'));
 };drawRates();form.append(shipping);
 const methods={};form.append(h('h2',{},'Activated Mollie payment methods'));
 for(const name of ['ideal','creditcard','bancontact']){const input=h('input',{type:'checkbox',checked:s.methods.includes(name)});methods[name]=input;form.append(h('label',{class:'co-setting-check'},input,' '+({ideal:'iDEAL / Wero',creditcard:'Payment cards',bancontact:'Bancontact'})[name]));}
 const mode=h('select',{},h('option',{value:'test'},'Test mode — no real sales'),h('option',{value:'live'},'Live mode — real payments'));mode.value=s.mode;
 const enabled=h('input',{type:'checkbox',checked:s.enabled}),reviewed=h('input',{type:'checkbox',checked:s.reviewed});
 form.append(h('label',{class:'field'},h('span',{},'Payment mode'),mode),h('label',{class:'co-setting-check'},reviewed,' I have reviewed the company, tax, delivery, privacy and returns information and my providers are approved.'),h('label',{class:'co-setting-check'},enabled,' Enable real checkout for customers (live mode only)'));
 const save=h('button',{type:'submit',class:'btn btn--primary'},'Save checkout settings');form.append(save);
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{if(rates.some(r=>r.cents===''))throw Error('Enter a shipping price for every country.');const input={...s,...Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])),shipping:rates,methods:Object.keys(methods).filter(k=>methods[k].checked),mode:mode.value,enabled:enabled.checked,reviewed:reviewed.checked};const result=await api('/admin/checkout',{method:'PUT',body:input});toast(input.enabled?'Live checkout enabled':'Settings saved; checkout is not live');if(result.missing.length)toast('Still needed: '+result.missing.join(', '),true);}catch(e){toast(e.message,true);}finally{save.disabled=false;}};
 const test=h('button',{type:'button',class:'btn',onclick:async()=>{
  test.disabled=true;try{
   const p=products.find(p=>p.active!==false&&!p.sold);if(!p)throw Error('Add an available product first.');if(!s.shipping.length)throw Error('Save at least one shipping country first.');
   const id=crypto.randomUUID(),accessToken=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
   sessionStorage.setItem('jp_order_'+id,accessToken);
   const result=await api('/admin/checkout/test',{method:'POST',body:{requestId:id,accessToken,slugs:[p.slug],customer:{name:'Japansterdam test',email:'test@japansterdam.invalid',street:'Test street 1',zip:'1000AA',city:'Amsterdam',country:s.shipping[0].country},accepted:true}});
   if(!result.checkoutUrl)throw Error('Test payment could not start.');location.assign(result.checkoutUrl);
  }catch(e){toast(e.message,true);test.disabled=false;}
 }},'Open private Mollie test payment');
 root.replaceChildren(form,h('section',{class:'item'},h('h2',{},'Connect the providers'),h('p',{},'In the Cloudflare Worker japansterdam-api, add MOLLIE_API_KEY as an encrypted secret (first a test_ key; later live_). Add RESEND_API_KEY and ORDER_EMAIL_FROM for your verified sending domain. Never paste keys into page content or Git.'),h('p',{},'Save shipping and company details, then run a private test. Public customers cannot start test payments. Test payments do not reserve or sell real inventory and do not send customer emails.'),test,h('button',{type:'button',class:'btn',onclick:async()=>{try{await api('/admin/checkout/email-test',{method:'POST',body:{}});toast('Test email accepted. Check your contact inbox.');}catch(e){toast(e.message,true);}}},'Send test email to my saved contact address'),h('p',{},h('a',{href:'../returns.html',target:'_blank',rel:'noopener'},'View withdrawal page ↗'))));
}
