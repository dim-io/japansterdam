// Self-contained email HTML: no remote fonts, images, scripts or tracking.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=value=>esc(value).replace(/\r?\n/g,'<br>');
const money=cents=>'€'+(cents/100).toFixed(2);
const section=(title,body)=>`<h2 style="margin:30px 0 12px;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#111">${title}</h2><div style="font-size:14px;line-height:1.65;color:#454545">${body}</div>`;

export function orderEmailHtml(o,{owner=false,test=false}={}){
 const s=JSON.parse(o.policy),c=JSON.parse(o.customer),items=JSON.parse(o.items);
 const title=test?'A preview of your order email.':owner?'A new order, paid.':'Thank you for your order.';
 const intro=test?'This is a sample confirmation. No payment has been taken and no garment has been purchased.':owner?'Payment has been verified. Review the order below before preparing it for dispatch.':`Hi ${c.name}, your payment has been received. Your selected pieces and delivery details are below.`;
 const rows=items.map(p=>`<tr><td style="padding:20px 0;border-bottom:1px solid #dedbd5;vertical-align:top"><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#666">${esc(p.brand)}</div><div style="margin:5px 0;font-size:16px;font-weight:bold">${esc(p.name)}</div><div style="font-size:13px;color:#555;line-height:1.6">Size ${esc(p.size)}<br>Condition: ${esc(p.condition)}${p.conditionNotes?'<br>'+lines(p.conditionNotes):''}</div></td><td style="padding:20px 0 20px 14px;border-bottom:1px solid #dedbd5;vertical-align:top;text-align:right;white-space:nowrap;font-size:15px">${money(p.cents)}</td></tr>`).join('');
 const total=(label,value,bold=false)=>`<tr><td style="padding:6px 0;${bold?'font-weight:bold;':''}">${label}</td><td style="padding:6px 0;text-align:right;${bold?'font-weight:bold;':''}">${money(value)}</td></tr>`;
 const policies=[['Delivery',s.deliveryText],['Returns',s.returnsText],['Purchase terms',s.termsText],['Privacy',s.privacyText]].filter(([,v])=>v).map(([label,v])=>section(label,lines(v))).join('');
 const contact=section('Questions about your order?',`Reply to this email or contact ${esc(s.email)}${s.phone?'<br>'+esc(s.phone):''}.`);
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="margin:0;padding:0;background:#f3f1ec;font-family:Arial,Helvetica,sans-serif;color:#111"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#fff"><tr><td style="padding:28px 24px;background:#111;color:#fff;font-size:24px;letter-spacing:-1px;font-weight:900">JAPANSTERDAM<span style="color:#d3222a;letter-spacing:1px"> ×××</span><div style="margin-top:7px;font-size:10px;font-weight:normal;letter-spacing:1.4px;color:#ccc">PRE-OWNED &amp; ARCHIVE PIECES</div></td></tr><tr><td style="padding:30px 24px">
 ${test?'<p style="margin:0 0 20px;color:#b91c1c;font-size:12px;font-weight:bold;letter-spacing:1px">TEST EMAIL — NO PURCHASE</p>':''}
 <h1 style="font-size:28px;line-height:1.15;letter-spacing:-.7px;margin:0 0 18px">${title}</h1><p style="font-size:15px;line-height:1.65;margin:0 0 20px">${esc(intro)}</p><p style="font-size:11px;color:#666;overflow-wrap:anywhere">${test?'SAMPLE ORDER':'ORDER'} JPN-${esc(o.id)}</p>
 <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;font-size:14px">${total('Subtotal',o.subtotal)}${total('Shipping',o.shipping)}${total(test?'Sample total':'Total paid',o.total,true)}</table>${s.taxNote?'<p style="font-size:12px;line-height:1.5;color:#666">'+lines(s.taxNote)+'</p>':''}
 ${section('Delivery address',[c.name,c.street,c.zip+' '+c.city,c.country].map(esc).join('<br>'))}
 ${owner?section('Customer',esc(c.email)+(c.note?'<br><br>Order note:<br>'+lines(c.note):'')):''}
 ${contact}${policies}${s.returnAddress?section('Return address',lines(s.returnAddress)+'<br><a style="color:#111" href="https://japansterdam.com/returns.html">Submit a withdrawal request</a>'):''}
 </td></tr><tr><td style="padding:24px;background:#111;color:#bbb;font-size:11px;line-height:1.8">${esc(s.company)}<br>${lines(s.address)}<br>KvK ${esc(s.kvk)}${s.vat?'<br>VAT ID '+esc(s.vat):''}<br><a href="https://japansterdam.com" style="color:#fff">japansterdam.com</a></td></tr></table></td></tr></table></body></html>`;
}

export function sampleEmailOrder(settings){
 return {id:'SAMPLE',policy:JSON.stringify(settings),customer:JSON.stringify({name:'Sample customer',email:'sample@example.invalid',street:'Example street 1',zip:'1000 AA',city:'Amsterdam',country:'NL',note:''}),items:JSON.stringify([{brand:'Japansterdam',name:'Sample archive garment',size:'M',condition:'Very good',conditionNotes:'Example condition description.',cents:10000}]),subtotal:10000,shipping:settings.shipping?.find(r=>r.country==='NL')?.cents??0,total:10000+(settings.shipping?.find(r=>r.country==='NL')?.cents??0)};
}
