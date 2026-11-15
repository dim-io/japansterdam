# Stripe Checkout for Japansterdam

The integration uses Stripe-hosted Checkout Sessions (SDK 23.0.0, API 2026-09-30.endive), not Payment Links, Connect or subscriptions. Existing Mollie orders retain their provider through their saved policy. New orders use the saved provider selection. Website prices and the configured country shipping charge are authoritative. Dynamic payment methods are controlled in Stripe; Adaptive Pricing and automatic tax are disabled so the reviewed EUR total stays fixed.

## Configuration

1. Complete business verification and the KNAB payout bank setup in Stripe. Development uses a separate sandbox. Keep production checkout disabled during setup.
2. In Cloudflare, open **japansterdam-api** (the backend Worker, not japansterdam-web or the Radar). Add the following as encrypted secrets for the matching environment:
   - `STRIPE_TEST_API_KEY`: preferably a sandbox restricted API key.
   - `STRIPE_TEST_WEBHOOK_SECRET`: signing secret of the sandbox endpoint below.
   - `STRIPE_TEST_ACCOUNT_ID`: the matching sandbox account ID (`acct_…`).
   - `STRIPE_LIVE_API_KEY`, `STRIPE_LIVE_WEBHOOK_SECRET`, `STRIPE_LIVE_ACCOUNT_ID`: separate production values before launch.
   - Existing confirmation email: `RESEND_API_KEY` and `ORDER_EMAIL_FROM` for the verified sender.
   Never put keys in Git, this document, chat, page text or browser storage. A Stripe MCP connection does not install application credentials in Cloudflare.
3. The restricted API key needs read access to its own account, write/read Checkout Sessions and the inline product/price/shipping resources Stripe requires, and read access to PaymentIntents and Charges. No refund-write, payout-write, bank-account-write or Connect permissions are needed. Test permissions in the sandbox; add a missing permission only when a verified 403 requires it.
4. Create a Stripe webhook/event destination at:
   `https://japansterdam-api.sam-jesse.workers.dev/checkout/stripe-webhook`
   Use snapshot events, API version **2026-09-30.endive**, and these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`
   Create separate test and live destinations and store their respective signing secrets. The server verifies raw-body signatures with a five-minute tolerance and verifies actual session, amount, currency, account mode and order metadata before fulfilling.
5. Backend → Checkout settings: select **Stripe**, select **Test mode**, fill complete company/return addresses and contact details, and save with checkout disabled. Use **Check Stripe connection**. It verifies the key belongs to the expected account. Live payment creation also verifies Stripe has enabled charges and payouts and completed business details.

## Tax: deliberately unresolved

VAT registration, KOR or second-hand margin treatment is a business/tax decision and is not inferred from selling used clothing. **Tax treatment stays pending** until the owner confirms the actual treatment and enters appropriate price/tax wording. The integration currently supports a confirmed treatment handled in the merchant's own prices/bookkeeping; it does not calculate or report tax with Stripe Tax. Do not select this merely to bypass a warning.

For automatic Stripe Tax, first confirm applicability to this inventory and the actual registration scheme with the owner's tax advisor. Verify active registrations, head-office settings, product tax codes and inclusive pricing, then implement and test the calculation/rounding/receipt flow. Do not enable automatic_tax without that review. No registrations or tax codes are created by this integration.

## Required tests before launch

- Start a private sandbox order from the backend. Complete payment, verify its order status, and confirm that no real stock is marked sold and no buyer emails are sent.
- Test failed payment, abandonment/expiry, delayed success/failure, duplicate webhooks, wrong signatures and incorrect amounts.
- A cancelled return to the shop does not release inventory: only a verified terminal provider status does. Sessions expire after an hour. Ambiguous creation retains reservations and retries the identical stored payload/idempotency key; old ambiguous orders need manual review.
- Test full/partial refunds and disputes in Stripe. Refunds never automatically relist stock. Admin shipping is blocked while refunded/disputed or withdrawn.
- Verify confirmation email delivery with the backend test button. The sender domain must be verified separately; mocks do not prove email delivery.
- The automated tests use real SDK serialization/signature verification against mocked Stripe HTTP and SQLite transactions; they do not constitute a completed hosted sandbox payment.

Only after these checks, complete business/tax/provider review, configure live credentials and webhook, select Live mode, and enable checkout. Confirm a real low-value payment and refund through the owner's normal Stripe interface. A production financial transaction is performed by the owner.

## Order confirmation email

Paid live orders enqueue two separate messages: the customer's confirmation and the owner's fulfillment notification. Both contain a self-contained HTML layout plus a plain-text fallback. They use the immutable order snapshot (items, condition, prices, shipping, address and purchase policies). Customer replies go to the saved shop contact email; replies from the owner notification go to the customer. Only the owner notification includes the customer's order note.

The existing resend queue and idempotency keys remain unchanged. Sandbox payments never enqueue buyer messages. The admin email-test button sends a clearly marked sample using the same layout to the saved shop contact address; it creates no order and changes no stock.

To finish activation:

1. Sign in to the owner's Resend account. Verify an owned sending domain using the exact DNS records shown by Resend. Keep existing mailbox MX/SPF records intact; do not replace the root mailbox configuration with sending-only records.
2. Store a sending-only Resend API key as `RESEND_API_KEY` in the owner's `japansterdam-api` Worker. Restrict it to the verified sending domain. Store `ORDER_EMAIL_FROM` as `Japansterdam <orders@VERIFIED-DOMAIN>` using that actual domain. Do not commit credentials or paste them into chat.
3. In `/admin/` → Checkout settings, verify the contact email and use **Send test email to my saved contact address**. Provider acceptance alone does not prove inbox delivery: confirm the email actually arrived and test Reply.
4. Keep live checkout disabled until the remaining payment and tax launch checks above are complete.
