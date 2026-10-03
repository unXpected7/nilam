# Nilam external integrations — Midtrans payments and Biteship shipping

**Status: IN PROGRESS — sandbox credentials configured; checkout endpoints pending**  
**Updated: 2026-10-03 (Asia/Jakarta)**

This guide is the implementation contract for Phase 3 checkout and Phase 4 order operations. Integrations must be server-side: browser code receives only a Midtrans Snap token and approved delivery choices, never provider secrets.

## Sandbox configuration status

Midtrans sandbox credentials supplied in `docs/external/midtrans.md` have been configured in the ignored local `backend/.env` only. They are not duplicated in tracked plan files or frontend code. The integration must use `MIDTRANS_ENVIRONMENT=sandbox` until the launch checklist is approved.

Biteship test credentials supplied in `docs/external/biteship.md` are likewise configured only in ignored local `backend/.env`; the credential source file is Git-ignored. Server-only Biteship rate and order-creation primitives are available, but no checkout/shipment endpoint is exposed until the order/shipping data model is complete.

The backend now has server-only Snap-transaction creation and notification-signature verification primitives. They are intentionally not exposed through a public checkout endpoint until authoritative quote/order/payment-attempt records are implemented.

## 1. Information Nilam must provide

### Midtrans

- A Midtrans merchant account with Sandbox enabled first, then Production activation.
- Sandbox and Production **Server Key** and **Client Key** from the Midtrans dashboard.
- Approved payment methods: for example GoPay, QRIS, bank transfer/VA, cards, and convenience store. Do not enable methods before Finance approves fees, reconciliation, and support handling.
- Public HTTPS notification URL and return URLs for finish, pending, and error states.
- Legal business/entity data, settlement bank account, tax treatment, refund/cancellation policy, and finance owner for reconciliation.

### Biteship

- Biteship account, separate test and live API tokens, and Order API production activation. Biteship documents that a production order API requires an activation request, while testing mode supports order testing. [Biteship authentication](https://biteship.com/en/docs/api/authentication)
- Shipping origin(s): legal entity/organisation, contact name, phone/email, full address, postal code, and coordinates for instant couriers.
- Serviceable regions, allowed couriers/services, pickup/drop-off policy, handling cut-off, parcel dimensions/weight source, free-shipping/insurance/COD policy, and operations owner.

Nilam currently permits only JNE and J&T services returned by the Biteship Rates API. Do not hard-code a service type or price: persist the selected current rate quote and re-quote when address/cart changes.
- Public HTTPS webhook URL and a configured signature-header key/secret. [Biteship webhook guide](https://help.biteship.com/hc/en-us/articles/58382055713689-Complete-Guide-to-Understanding-Biteship-Webhooks)

## 2. Required environment variables

Add values only to deployment secrets and local uncommitted `.env`; do not place real credentials in `.env.example`, browser code, logs, database audit payloads, or ticket comments.

```dotenv
# Common
APP_PUBLIC_URL=https://www.nilam.id

# Midtrans: use sandbox until production rehearsal is approved
MIDTRANS_ENVIRONMENT=sandbox
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxx
MIDTRANS_SNAP_API_URL=https://app.sandbox.midtrans.com/snap/v1
MIDTRANS_API_BASE_URL=https://api.sandbox.midtrans.com
MIDTRANS_FINISH_URL=https://www.nilam.id/checkout/payment/finish
MIDTRANS_PENDING_URL=https://www.nilam.id/checkout/payment/pending
MIDTRANS_ERROR_URL=https://www.nilam.id/checkout/payment/error
MIDTRANS_NOTIFICATION_URL=https://api.nilam.id/api/payments/midtrans/webhook

# Biteship: test token first; live token only after Order API activation
BITESHIP_ENVIRONMENT=test
BITESHIP_API_TOKEN=biteship_test.xxxxxxxxx
BITESHIP_API_BASE_URL=https://api.biteship.com
BITESHIP_WEBHOOK_URL=https://api.nilam.id/api/shipping/biteship/webhook
BITESHIP_WEBHOOK_SIGNATURE_HEADER=X-Nilam-Biteship-Signature
BITESHIP_WEBHOOK_SIGNATURE_SECRET=replace-with-long-random-secret
BITESHIP_ORIGIN_NAME=Nilam Warehouse
BITESHIP_ORIGIN_CONTACT_NAME=Operations Team
BITESHIP_ORIGIN_CONTACT_PHONE=+628xxxxxxxxxx
BITESHIP_ORIGIN_CONTACT_EMAIL=operations@nilam.id
BITESHIP_ORIGIN_ADDRESS=Full verified pickup address
BITESHIP_ORIGIN_POSTAL_CODE=12345
BITESHIP_ORIGIN_LATITUDE=-6.xxxxxx
BITESHIP_ORIGIN_LONGITUDE=106.xxxxxx
```

For production, switch Midtrans URLs/keys to production values and Biteship to a `biteship_live.` token only after tests, reconciliation, and sign-off. Midtrans access keys are documented in its [access-key guide](https://docs.midtrans.com/docs/access-keys); Biteship tokens are shown once, so store them in a secret manager. [Biteship authentication](https://biteship.com/en/docs/api/authentication)

## 3. Midtrans implementation plan

1. Create a checkout quote from the server-owned cart. Lock its price, expiry, delivery option, and stock validation; use IDR integer amounts only.
2. Create the Nilam order and payment attempt idempotently in one database transaction. Generate an internal order number; use it as the unique Midtrans `order_id` with a retry-safe suffix strategy if required.
3. Server creates the Snap transaction/token using `MIDTRANS_SERVER_KEY`; browser opens Snap using the returned token and `MIDTRANS_CLIENT_KEY` only.
4. Treat the Midtrans HTTPS notification as payment authority. Verify its `signature_key` from `order_id + status_code + gross_amount + ServerKey`, then obtain/confirm transaction status server-to-server before changing payment/order state. [Midtrans HTTPS notifications](https://docs.midtrans.com/docs/https-notification-webhooks)
5. Store provider transaction ID, payment type, fraud/payment status, raw event hash, verified timestamp, and a dedupe key. Never trust a redirect alone.
6. Make webhook processing idempotent: persist event receipt first, reject/ignore duplicate provider event IDs or hashes, apply only allowed state transitions, and return a fast successful response after durable processing.
7. Payment return pages query Nilam’s order status; they never set payment status themselves. Support pending, failed, expired, cancelled, paid, refunded, and challenged/fraud-review paths.
8. Reconcile daily: compare Nilam paid/refunded records against Midtrans settlement/reporting and alert Finance on mismatch.

## 4. Biteship implementation plan

1. At checkout address entry, server requests courier rates using the approved origin, destination postal code/area/coordinates, parcel items, weight, dimensions, and value. The Rates API supports postal-code, area-ID, and coordinate inputs. [Biteship Rates overview](https://biteship.com/en/docs/api/rates/overview)
2. Persist only the selected, short-lived quote: courier company/type, fee, ETA/service label, quote expiry, and quote response reference. Requote on address/cart change.
3. Create a Biteship shipment only after the approved business trigger—normally paid order, unless an explicit COD policy says otherwise. Use Nilam order number as unique `reference_id` and make shipment creation idempotent.
4. Send complete origin/destination contacts and address data, selected courier company/type, delivery type, item name/SKU/category/value/quantity/dimensions/weight, insurance where approved, and metadata with Nilam order ID. Biteship order creation requires origin/destination information, courier company/type, delivery type, and items. [Create a Biteship order](https://biteship.com/en/docs/api/orders/create)
5. Save Biteship order ID, tracking/waybill ID, courier service, fee, shipment status, pickup/delivery timestamps, and provider response. Do not overwrite the original checkout shipping quote.
6. Verify Biteship webhooks using the configured signature header/key/secret, persist a dedupe hash, and translate provider statuses only through the approved Nilam fulfilment state machine. Biteship recommends signature/token verification for webhook origin. [Biteship webhook setup](https://help.biteship.com/hc/en-us/articles/39554334539545-How-to-Set-Up-Webhooks-for-Shipping-Notifications)
7. Show tracking only after a persisted shipment/waybill exists. Allow ERP staff to view provider state and retry only safe/idempotent operations.

## 5. Database/API work required before enabling either provider

- Add shipping-rate/quote, delivery-method, checkout-address snapshot, payment-attempt, shipment, and order-event models.
- Add `POST /api/checkout/quote`, idempotent `POST /api/checkout/orders`, `POST /api/payments/midtrans/webhook`, and `POST /api/shipping/biteship/webhook` endpoints.
- Store secrets server-side; raw webhook body handling must preserve the exact signed payload when verification requires it.
- Add request IDs, provider-event idempotency, retry/dead-letter handling, audit events, and redacted logs.
- Add test fixtures for successful, pending, failed, duplicate, delayed, out-of-order, and forged notifications.

## 6. Launch checklist

- [ ] Sandbox: create quote → Snap payment → verified Midtrans notification → paid Nilam order.
- [ ] Sandbox: pending/expiry/failure/duplicate notification and duplicate browser submit are safe.
- [ ] Biteship test: rates, selected service, shipment create, waybill, tracking webhook, duplicate webhook.
- [ ] Confirm stock reservation/release and no oversell under concurrent checkout.
- [ ] Finance approves fees, settlement/reconciliation, refund process, and payment methods.
- [ ] Operations approves couriers, pickup rules, weight/dimension data, exceptions, and customer-support playbook.
- [ ] Security review confirms no secrets/PII in client payloads, logs, analytics, or error pages.
- [ ] Production rehearsal uses no real customer charge until written launch approval.
