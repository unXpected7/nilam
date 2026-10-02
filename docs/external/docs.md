# Nilam external integrations — current state

**Updated: 2026-10-03 (Asia/Jakarta)**

This document tracks configuration and implementation state. Real credentials live only in ignored `backend/.env`; never paste a key into this document, source code, browser storage, logs, or Git.

## Credential status

| Service | Environment | Local configuration | Server integration |
| --- | --- | --- | --- |
| Midtrans | Sandbox | Configured | Snap creation and notification-signature verification primitives implemented; checkout/order endpoint not exposed yet |
| Biteship | Test | Configured | Rate lookup, shipment creation, and webhook shared-secret primitives implemented; no public quote/shipment endpoint yet |
| Brevo | Sandbox/drop mode | API key configured | Transactional email client implemented; requires verified `BREVO_SENDER_EMAIL` before sends work |

## Required local variables

```dotenv
# Checkout policy
CHECKOUT_TAX_RATE_BASIS_POINTS=1100

# Midtrans sandbox
MIDTRANS_ENVIRONMENT=sandbox
MIDTRANS_MERCHANT_ID=[configured locally]
MIDTRANS_CLIENT_KEY=[configured locally]
MIDTRANS_SERVER_KEY=[configured locally]
MIDTRANS_SNAP_API_URL=https://app.sandbox.midtrans.com/snap/v1
MIDTRANS_API_BASE_URL=https://api.sandbox.midtrans.com

# Biteship test
BITESHIP_ENVIRONMENT=test
BITESHIP_API_TOKEN=[configured locally]
BITESHIP_API_BASE_URL=https://api.biteship.com
BITESHIP_ALLOWED_COURIERS=jne,jnt
BITESHIP_ORIGIN_CONTACT_NAME=Nilam Store
BITESHIP_ORIGIN_CONTACT_EMAIL=nilam-store-dev@fluxorastudio.id
BITESHIP_ORIGIN_ADDRESS=Jl Raya Jalingkos, Area Sawah, Kendalserut, Kec. Slawi, Kabupaten Tegal, Jawa Tengah 52412, Indonesia
BITESHIP_ORIGIN_POSTAL_CODE=52412

# Brevo
BREVO_API_KEY=[configured locally]
BREVO_API_BASE_URL=https://api.brevo.com/v3
BREVO_SANDBOX=true
BREVO_SENDER_EMAIL=nilam-store-dev@fluxorastudio.id
BREVO_SENDER_NAME=Nilam Store
SUPPORT_CONTACT_EMAIL=nilam-store-dev@fluxorastudio.id

# Voucher defaults
VOUCHER_DEFAULT_PERCENTAGE=20
VOUCHER_DEFAULT_MINIMUM_SUBTOTAL=200000
VOUCHER_DEFAULT_MAXIMUM_DISCOUNT=30000
VOUCHER_DEFAULT_DURATION_DAYS=7
VOUCHER_CODE_LENGTH_MIN=4
VOUCHER_CODE_LENGTH_MAX=6

# Operations policy
CANCELLATION_REVIEW_DAYS=3
REFUND_REVIEW_DAYS=3
```

## Approved business rules

- Online-only store; no offline-store fulfilment scope.
- Indonesia-only delivery from the single Slawi, Tegal origin above.
- Checkout tax is shown/configured as 11%.
- Biteship presents only live JNE/J&T rate options; never hard-code rates.
- Intended Midtrans methods: QRIS, GoPay, ShopeePay, and bank virtual accounts.
- Vouchers are admin-managed, 4–6 character alphanumeric codes, one use per authenticated customer, default 20% off, Rp200.000 minimum spend, Rp30.000 maximum discount, and seven-day expiry. Values must remain editable by authorised ERP staff.
- Cancellations/refunds are manually reviewed in ERP with a configurable three-day target.

## Integration flow and status

1. **Checkout quote — pending implementation.** Server rehydrates cart, validates Indonesia address, requests Biteship rates using origin `52412`, filters to JNE/J&T, calculates discount/tax/delivery/total, and expires the quote.
2. **Order creation — pending implementation.** In one transaction, recheck stock, apply eligible voucher, snapshot customer/address/items/rate, create order and payment attempt, and prevent duplicate submit.
3. **Midtrans Snap — primitive complete; checkout use pending.** Server creates Snap transaction with authoritative order total; browser receives only Snap token/client key.
4. **Midtrans webhook — verification primitive complete; endpoint pending.** Verify signature, deduplicate notifications, confirm provider status, then transition Nilam payment/order status.
5. **Biteship shipment — primitive complete; order workflow pending.** After approved payment/fulfilment trigger, create idempotent shipment with selected rate; persist waybill/tracking/status.
6. **Biteship webhook — verification primitive complete; endpoint pending.** Verify configured signature header/secret, deduplicate event, update shipment/order timeline.
7. **Brevo emails — client complete; workflow pending.** Send receipts, payment/shipment notices, and recovery messages only after a durable state transition. Keep sandbox/drop mode until templates/sender verification are approved.

## Before production

- Switch each provider to production credentials only after sandbox/test rehearsals.
- Verify Brevo sender/domain and set `BREVO_SANDBOX=false` only after approval.
- Configure HTTPS webhook URLs and their provider-side signing settings.
- Complete order/payment/shipment/voucher migrations, idempotency, automated tests, reconciliation, support runbooks, and legal/payment approval.
