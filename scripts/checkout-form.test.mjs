import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutFormHTML } from '../js/checkout-form.js';
const options={email:'hello@japansterdam.com',returnCosts:'Return shipping is paid by the customer; necessary returns for faulty items are paid by Japansterdam.'};
const live={enabled:true,provider:'stripe',shipping:[{country:'NL',cents:795}],deliveryText:'Tracked delivery.',termsText:'Purchase terms.',returnsText:'14-day withdrawal.',returnAddress:'Amsterdam',privacyText:'Privacy information.'};
test('disabled or unavailable checkout cannot collect an order or offer an email purchase',()=>{
 for(const config of [null,undefined,{enabled:false}]){
  const html=checkoutFormHTML(config,options);
  assert.match(html,/Online checkout is not available yet/);
  assert.doesNotMatch(html,/<form|<input|type="submit"|Send order request|subject=|body=/);
  assert.match(html,/href="mailto:hello@japansterdam.com"/);
 }
});
test('enabled Stripe purchase keeps shipping selection, explicit consent and return costs before the payment button',()=>{
 const html=checkoutFormHTML(live,options);
 for(const value of ['id="order-form"','value="NL"','name="accepted" required','Secure payment via Stripe','Order and pay','14-day withdrawal.'])assert.ok(html.includes(value),value);
 assert.ok(html.indexOf(options.returnCosts)<html.indexOf('type="submit"'));
 assert.doesNotMatch(html,/order request|payment link by email|email app/i);
});
test('editable checkout policies are escaped instead of becoming active markup',()=>{
 const html=checkoutFormHTML({...live,termsText:'<script>alert(1)</script>'},{...options,returnCosts:'<img src=x onerror=alert(1)>'});
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img'));
 assert.doesNotMatch(html,/<script|<img/);
});
