// Public purchase form. A disabled or unavailable payment configuration never offers an email-order route.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function checkoutFormHTML(paymentConfig, {email='',returnCosts=''}={}) {
  if (!paymentConfig?.enabled) return `<h2 id="form-h">Online checkout</h2><p role="status">Online checkout is not available yet. Please check back soon.</p><p class="form__help">Questions about a piece? <a class="u" href="mailto:${esc(email)}">${esc(email)}</a></p>${returnCosts?`<p class="form__help">${esc(returnCosts)} <a class="u" href="shipping-returns.html">Read our return policy</a></p>`:''}`;
  return `    <h2 id="form-h">Your details</h2>
    <form class="form" id="order-form" novalidate>
      <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" autocomplete="name" required></div>
      <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="f-street">Street and number</label><input id="f-street" name="street" autocomplete="address-line1" required></div>
      <div class="row">
        <div class="field"><label for="f-zip">Postal code</label><input id="f-zip" name="zip" autocomplete="postal-code" required></div>
        <div class="field"><label for="f-city">City</label><input id="f-city" name="city" autocomplete="address-level2" required></div>
      </div>
      <div class="field"><label for="f-country">Country</label><select id="f-country" name="country" autocomplete="country" required><option value="">Select country</option>${paymentConfig.shipping.map(r=>`<option value="${esc(r.country)}">${esc(new Intl.DisplayNames(['en'],{type:'region'}).of(r.country))}</option>`).join('')}</select></div>
      <div class="field"><label for="f-note">Note (optional)</label><textarea id="f-note" name="note"></textarea></div>
      <p class="form__help">${esc(paymentConfig.deliveryText)}</p><label class="co-consent"><input type="checkbox" name="accepted" required> <span>I agree to the purchase terms and understand this order requires payment.</span></label>${legalDetails(paymentConfig)}<p class="form__help">Secure payment via ${paymentConfig.provider === 'stripe' ? 'Stripe' : 'Mollie'}. Your piece is reserved when payment begins.</p>
      ${returnCosts ? `<p class="form__help" id="return-costs-notice">${esc(returnCosts)} <a class="u" href="shipping-returns.html">Read our return policy</a></p>` : ''}
      <p class="form__err" id="form-err" role="alert"></p>
      <button class="btn btn--primary btn--block" type="submit">Order and pay</button>
    </form>`;
}
function legalDetails(s){return `<div class="co-legal">${[['Purchase terms',s.termsText],['Returns and withdrawal',s.returnsText+'\nReturn address: '+s.returnAddress],['Privacy',s.privacyText]].map(([title,text])=>`<details><summary>${esc(title)}</summary><p>${esc(text).replace(/\n/g,'<br>')}</p></details>`).join('')}<a href="returns.html">Withdraw from an order</a></div>`;}
