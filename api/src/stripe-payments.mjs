import Stripe from 'stripe';

export const STRIPE_API_VERSION = '2026-09-30.endive';
export const STRIPE_EVENTS = ['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded','charge.dispute.created','charge.dispute.updated','charge.dispute.closed'];
const prefix = mode => 'STRIPE_' + mode.toUpperCase();
export const stripeKey = (env, mode) => env[prefix(mode) + '_API_KEY'] || '';
export const stripeSigningSecret = (env, mode) => env[prefix(mode) + '_WEBHOOK_SECRET'] || '';
export const stripeAccountId = (env, mode) => env[prefix(mode) + '_ACCOUNT_ID'] || '';
export const stripeCredentials = (env, mode) => new RegExp('^[sr]k_' + mode + '_[A-Za-z0-9_]+$').test(stripeKey(env, mode));
function error(status, message) { const e = new Error(message); e.name = 'CheckoutError'; e.status = status; return e; }
export function stripeClient(env, mode) {
  if (!stripeCredentials(env, mode)) throw error(503, 'Add the matching Stripe restricted API key in Cloudflare Secrets.');
  return new Stripe(stripeKey(env, mode), {apiVersion:STRIPE_API_VERSION, httpClient:Stripe.createFetchHttpClient(), maxNetworkRetries:0, timeout:15000});
}
export async function verifyStripeAccount(env, mode) {
  const account = await stripeClient(env, mode).accounts.retrieve();
  if (!stripeAccountId(env, mode) || account.id !== stripeAccountId(env, mode)) throw error(503, 'Stripe account does not match the configured account ID.');
  return {id:account.id,country:account.country,chargesEnabled:account.charges_enabled===true,payoutsEnabled:account.payouts_enabled===true,detailsSubmitted:account.details_submitted===true};
}
export function stripeSessionPayload({id, time, items, shipping, customer, site}) {
  // Store this complete payload before the first request; retries use identical parameters.
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)), n=>String.fromCharCode(97+n%26)).join('');
  return {mode:'payment',ui_mode:'hosted',client_reference_id:id,metadata:{order_id:id},
    integration_identifier:'japansterdam_'+suffix,
    success_url:site+'/checkout.html#order='+id,cancel_url:site+'/checkout.html#order='+id,
    customer_email:customer.email,shipping_address_collection:{allowed_countries:[customer.country]},
    line_items:items.map(item=>({quantity:1,price_data:{currency:'eur',unit_amount:item.cents,product_data:{name:(item.brand+' '+item.name).slice(0,250),description:('Size '+item.size+' · '+item.condition).slice(0,250),metadata:{slug:item.slug}}}})),
    shipping_options:[{shipping_rate_data:{type:'fixed_amount',display_name:'Tracked shipping',fixed_amount:{amount:shipping,currency:'eur'}}}],
    payment_intent_data:{metadata:{order_id:id}},adaptive_pricing:{enabled:false},automatic_tax:{enabled:false},
    expires_at:Math.floor(time/1000)+3600};
}
export async function startStripePayment(env, order) {
  const account = await verifyStripeAccount(env, order.mode);
  if (order.mode==='live' && (!account.chargesEnabled || !account.payoutsEnabled || !account.detailsSubmitted)) throw error(503,'Complete Stripe account verification and payout setup before accepting real payments.');
  try {
    return await stripeClient(env, order.mode).checkout.sessions.create(JSON.parse(order.payment_request), {idempotencyKey:order.id});
  } catch (e) {
    // A transport/5xx/rate limit/idempotency conflict is uncertain, so keep stock reserved.
    e.definitive = e.type==='StripeInvalidRequestError' && e.statusCode===400 && e.code!=='idempotency_key_in_use';
    throw e;
  }
}
export async function readStripePayment(env, order) {
  const session = await stripeClient(env, order.mode).checkout.sessions.retrieve(order.payment_id, {expand:['payment_intent.latest_charge']});
  const intent = session.payment_intent;
  if(session.id!==order.payment_id || session.metadata?.order_id!==order.id || session.client_reference_id!==order.id || session.livemode!==(order.mode==='live') || session.currency!=='eur' || session.amount_total!==order.total || (intent && (typeof intent==='string' || intent.metadata?.order_id!==order.id || intent.currency!=='eur' || intent.amount!==order.total))) throw error(502,'Stripe payment verification failed.');
  let status='open';
  if(session.payment_status==='paid') {
    if(!intent || intent.status!=='succeeded' || intent.amount_received!==order.total) throw error(502,'Stripe settlement verification failed.');
    status='paid';
  } else if(session.status==='expired') status='expired';
  else if(session.status==='complete') status=intent?.status==='canceled'||intent?.status==='requires_payment_method'?'failed':'pending';
  else if(session.status!=='open') throw error(502,'Unrecognized Stripe Checkout status.');
  const charge=intent?.latest_charge;
  if(charge && (typeof charge==='string' || charge.currency!=='eur' || charge.amount!==order.total)) throw error(502,'Stripe charge verification failed.');
  const delivery=session.collected_information?.shipping_details;
  if(status==='paid' && (!delivery?.name || !delivery.address?.line1 || !delivery.address?.postal_code || !delivery.address?.city || delivery.address?.country!==JSON.parse(order.customer).country)) throw error(502,'Stripe shipping address verification failed.');
  return {id:session.id,status,mode:order.mode,metadata:{order_id:order.id},amount:{currency:'EUR',value:(order.total/100).toFixed(2)},
    amountRefunded:{currency:'EUR',value:((charge?.amount_refunded||0)/100).toFixed(2)},amountChargedBack:{currency:'EUR',value:(charge?.disputed?order.total/100:0).toFixed(2)},
    delivery:status==='paid'?{name:delivery.name,street:[delivery.address.line1,delivery.address.line2].filter(Boolean).join(', '),zip:delivery.address.postal_code,city:delivery.address.city,country:delivery.address.country}:null};
}
export async function stripeWebhookEvent(req, env) {
  const payload=await req.text();
  if(payload.length>1000000) throw error(413,'Webhook too large.');
  const signature=req.headers.get('stripe-signature');
  for(const mode of ['test','live']) {
    const secret=stripeSigningSecret(env,mode);
    if(!secret) continue;
    let event;
    try { event=await stripeClient(env,mode).webhooks.constructEventAsync(payload,signature,secret,300,Stripe.createSubtleCryptoProvider()); } catch { continue; }
    if(event.livemode!==(mode==='live') || event.account) throw error(400,'Stripe webhook account or mode mismatch.');
    return {event,mode};
  }
  throw error(400,'Invalid Stripe webhook signature.');
}
export async function webhookOrderId(env, mode, event) {
  if(!STRIPE_EVENTS.includes(event.type)) return null;
  const object=event.data.object;
  if(event.type.startsWith('checkout.session.')) return object.metadata?.order_id || null;
  let intent=object.payment_intent;
  if(!intent && object.charge) intent=(await stripeClient(env,mode).charges.retrieve(object.charge)).payment_intent;
  if(!intent) return null;
  const payment=await stripeClient(env,mode).paymentIntents.retrieve(typeof intent==='string'?intent:intent.id);
  return payment.metadata?.order_id || null;
}
