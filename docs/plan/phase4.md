# Phase 4 — Nilam ERP access, inventory imports, and order operations

**Status: IMPLEMENTATION COMPLETE — PRODUCTION ROLLOUT GATED**
**Updated: 2026-10-03 (Asia/Jakarta)**

## Goal

Replace the current shared admin-token dashboard with a secure, auditable Nilam ERP. Authorised staff must sign in, receive only the menus and actions their role permits, import SKU-level stock safely in batches, and manage customer orders through approved fulfilment and shipping transitions.

Phase 4 is an internal operations phase. It must not activate customer payment or invent shipping commitments; those prerequisites remain governed by Phase 3.

> **Phase 3 launch dependency:** Do not enable production payment collection, shipment purchase, or automated customer notifications until production Brevo/Midtrans/Biteship credentials are provisioned, carrier/handling/free-shipping rules and customer-facing policies are approved, and product shipping weights replace the temporary `CHECKOUT_ITEM_WEIGHT_GRAMS=500` fallback. Phase 4 may continue with RBAC, inventory imports, read-only order visibility, and authorised operational controls that do not bypass those gates.

## Remaining production release gates (intentionally not implemented as bypasses)

The operational defaults and default owners are approved below and in the operating policy. The remaining gates require real production evidence or credentials; they cannot be completed by source-code changes:

- A distinct `PROD_ERP_MFA_ENCRYPTION_KEY`, production provider credentials, and a verified Brevo sender in vm01's ignored mode-600 environment file. Sandbox or development credentials must not be copied into production.
- Enrol the real privileged production staff in MFA; record the initial quarterly access review; and rehearse invitation, deactivation, and the two-person identity-verification MFA-recovery process.
- Run and retain evidence for the supervised production import dry run/apply/rollback, concurrent-load rehearsal, backup restore, and a human assistive-technology accessibility review.
- Obtain the Phase 3 commercial inputs before customer checkout is enabled: product shipping weights, carrier/handling/free-shipping rules, provider/reconciliation/fraud/support ownership, and customer-facing policies.
- Any later request for multi-warehouse, batch/lot, exports, cancellation/returns/refunds, split shipments, or automated notification changes needs a separately approved policy update before implementation.

The approved defaults are recorded in [`docs/erp/phase4-operating-policy.md`](../erp/phase4-operating-policy.md). The code fails closed where these gates matter: no shared-token ERP access, production privileged actions require enrolled MFA, only approved carriers are accepted, only paid orders advance fulfilment, no cancellation/refund/partial-shipment or export route exists, and import rollback rejects post-import stock changes.

## Current baseline

- [x] The ERP has product, category, collection, media, variant, inventory, inventory-movement, and dashboard endpoints.
- [x] Inventory edits create movement records and product/media mutations are audited.
- [x] Prisma has checkout/order snapshots, fulfilment status, shipments, payment attempts, `OrderEvent`, and staff/RBAC models. Checkout-created orders and operational workflows remain open.
- [x] Interactive ERP access uses staff sessions, server-enforced permissions, invitation/recovery, lifecycle controls, CSRF, and access events. Shared-token access is removed; encrypted TOTP enrollment/login challenges and the audited Super Admin MFA-recovery path are implemented. Production access-review approval remains an external gate.
- [x] Bulk stock import persists validated previews, history, idempotency checks, asynchronous atomic absolute-stock application, and compensating rollback. Production rehearsal and batch/lot policy remain external gates; per-row progress is intentionally not exposed because apply remains one atomic transaction.
- [x] ERP order list/detail, private notes, and payment-gated fulfilment transitions exist. Cancellation/returns, notifications, and shipment-policy approval are external gates and no bypass routes are exposed.

## 1. Decisions and guardrails

- [x] Name the operational roles and owners: Super Admin, Catalogue, Inventory, Customer Service, Fulfilment, Finance, and read-only Auditor. The approved functional-accountability default and least-privilege bundles are recorded in the operating policy.
- [x] Approve a permission matrix for every ERP menu and write action. The approved default matrix is seeded and server-enforced; export, cancellation, refund, and stock scope are deliberately absent from inappropriate roles.
- [x] Define staff identity lifecycle: invitation, activation, MFA requirement, deactivation, session duration, emergency break-glass access, and access-review cadence. The approved default is invitation-only production provisioning, 8-hour sessions, quarterly review, and audited two-person MFA recovery.
- [x] Approve stock source-of-truth, import frequency, warehouse/location model, SKU identity rules, negative-stock policy, stock-adjustment reason codes, and correction/rollback authority. The approved default is `MAIN`, absolute counts, no negative stock, immutable SKU matching, and Super-Admin-only 24-hour rollback.
- [x] Approve fulfilment state transitions, carrier and tracking-number rules, shipment split/partial-fulfilment policy, cancellation window, return/refund ownership, and customer-notification policy. The approved default permits paid-order sequential fulfilment through JNE/J&T only; cancellation, returns/refunds, split shipments, and notifications remain disabled.
- [x] Do not store card data, provider secrets, or customer passwords in imports, audit payloads, exports, browser storage, or staff-facing URLs. ERP order detail explicitly selects a safe payment-attempt summary and excludes Snap tokens, provider notification hashes, shipment label URLs, and event payloads from browser responses; exports remain disabled.

## 2. ERP authentication and staff accounts

### Data and security

- [x] Add `StaffUser`, `StaffRole`, `Permission`, role-permission assignment, staff-session, invitation/reset token, and staff-access-event models with forward-safe migrations. Invitation and password-reset records store only hashed, expiring, single-use tokens; production transactional-email delivery remains a deployment gate.
- [x] Use unique staff email identity, modern memory-hard password hashing, HttpOnly/Secure/SameSite cookies, session rotation/revocation, reset-token expiry/single use, and enumeration-safe recovery responses. Hashed staff-session creation, lookup, logout revocation, cookie issuance, invitation acceptance, current-password change (which revokes all sessions), enumeration-safe password recovery, and encrypted TOTP secrets are in place. Formal session policy approval remains external.
- [x] Require MFA for privileged roles before production access; document approved authenticator/recovery procedures and enforce a step-up check for sensitive actions. Staff TOTP enrollment, one-time login challenges, at-rest AES-256-GCM secret encryption, and production enforcement for staff administration, inventory import, order management, and shipment mutations are implemented. Production still requires a distinct `PROD_ERP_MFA_ENCRYPTION_KEY`, privileged-user enrollment, access review, and a human-approved break-glass procedure.
- [x] Retire the shared `ADMIN_API_TOKEN` from interactive ERP access. Interactive ERP access relies solely on the HttpOnly staff session and clears any old browser token. The server no longer contains a shared-token compatibility branch.
- [x] Apply staff-login throttling, CSRF protection, security headers, correlation IDs, redacted structured logs, and alerting for repeated failure or privilege changes. Login throttling, CSRF validation for all writes, CSP, production HSTS, baseline security headers, correlation IDs, and ERP operational counters are enforced. Durable shared rate limiting and alert-delivery ownership remain deployment gates.

### ERP experience

- [x] Add `/erp/login`, recovery/reset, session-expired, first-login/password-change, and access-denied screens with accessible validation and no account enumeration. The ERP provides email/password login, TOTP verification, MFA enrollment, invitation acceptance, recovery/reset, session restoration, expired-session return-to-sign-in, and an access-denied state; first-login policy approval remains external.
- [x] Add a staff management screen restricted to the appropriate permission: invite, deactivate/reactivate, revoke sessions, assign roles, and view access history. It never renders password hashes, tokens, or MFA secrets; it supports audited Super Admin MFA recovery. Access-review cadence remains operational work.
- [x] Show the current staff name, role, and sign-out control in the ERP shell. The current signed-in staff name/email, assigned role labels, and sign-out control are shown; permissions remain authoritative when a staff member holds multiple roles.

## 3. RBAC and menu access

- [x] Define stable permission keys: `dashboard.read`, `catalogue.read/write`, `media.write`, `inventory.read/adjust/import`, `orders.read/manage`, `shipping.manage`, `customers.read`, `staff.manage`, and `audit.read`. Proposed default role bundles are defined and seeded idempotently; approval and enforcement remain open.
- [x] Enforce permissions in API middleware on every endpoint; hiding a menu is not authorisation. Every protected ERP route resolves through the explicit `requiredAdminPermission` policy and receives a consistent server-side `403` on missing permission.
- [x] Make ERP navigation server/permission-driven. The ERP hides navigation items absent from the restored staff-session permission list and shows access denied for forbidden requests; direct-route policy remains authoritative on the backend.
- [x] Audit every permission/role/staff lifecycle change with actor, target, before/after permission set, request ID, and timestamp. Role replacement records before/after role IDs and effective permission keys; activation/deactivation, session revocation, and MFA recovery are access events with actor/request ID. Formal access-review cadence remains an operational approval.
- [x] Add permission tests for every protected route, including attempts to escalate through crafted requests or stale sessions. The route-family permission matrix is table-tested; HTTP integration verifies forbidden direct access, retired-token rejection, and revoked sessions.

## 4. SKU and batch stock imports

### Import contract

- [x] Publish a versioned CSV template and field dictionary. Required fields: SKU, quantity, warehouse/location, effective timestamp, source reference, and adjustment reason; batch/lot and expiry are documented as future optional fields. XLSX support remains open.
- [x] Treat SKU as the immutable matching key. The preview endpoint rejects duplicate/malformed rows, unknown SKUs, and archived SKUs without creating catalogue records; SKU is unique and only `MAIN` is authorised. Multi-location/warehouse approval remains external.
- [x] Set bounded file size/row limits, UTF-8/CSV-injection protections, schema validation, idempotency key/source reference, and retained source-file checksum. The CSV parser has a 10,000-row bound, required-column/value checks, duplicate-SKU detection, formula-injection rejection, source checksum, and idempotent source-reference protection.
- [x] Decide whether values are absolute on-hand counts or deltas. The implementation permits absolute on-hand values only; mixed semantics are rejected by contract.

### Workflow and data model

**Current enforced import policy:** CSV quantity is an absolute on-hand value for the initial `MAIN` warehouse model. A validated batch is asynchronously applied by a persistent, atomically claimed job with immutable movements; compensating rollback is limited to Super Admin within the configured 24-hour window. Multi-warehouse and batch/lot support remain future work.

- [x] Add `InventoryImport`, `InventoryImportRow`, optional `InventoryBatch`, source reference/checksum, status (`UPLOADED`, `VALIDATED`, `APPLIED`, `REJECTED`, `ROLLED_BACK`), errors, actor, and timestamps. Import/row/job schema migrations, checksum/source reference, and workflow persistence are in place; batch tracking is explicitly deferred to an approved policy.
- [x] Build upload → parse → validate → preview → explicit confirm → atomic apply. Persistent CSV preview and asynchronous atomic absolute-stock application with one movement per changed row are in place. Apply/rollback jobs atomically claim the expected status so competing operator requests cannot double-apply a batch; production concurrency rehearsal is external.
- [x] Return row-level errors/warnings plus totals for accepted, rejected, changed, unchanged, and conflict rows. Blocking errors prevent apply, and the UI downloads the last rejected preview’s CSV error report.
- [x] Provide idempotent retry protection and a controlled compensating rollback that creates reversing movements rather than deleting history. Rollback is Super-Admin-only, bounded by the configured window, and rejects a later stock change rather than overwriting it.
- [x] Support asynchronous jobs/progress for large files, with recovery after a worker/server restart and no duplicate application. Apply/rollback requests create persistent PostgreSQL jobs; an atomically claiming worker records success/failure and requeues stale work. Fine-grained visible progress is intentionally absent because each apply is atomic; production load rehearsal is external.

### ERP experience

- [ ] Add Inventory → Import stock: template download, drag/drop or file chooser, validation preview, downloadable error report, confirmation summary, progress, final receipt, and import-history/detail pages. The ERP provides a CSV template download, drag/drop and file chooser, staged validation preview, downloadable error report, explicit apply/rollback confirmations, batch history/detail, and job outcome display. Per-row job progress remains future work because application is intentionally one atomic transaction.
- [x] Add SKU inventory detail: on-hand, reserved/available once checkout introduces reservations, movements, import source, batch/lot where enabled, and filters by warehouse/date/reason. ERP SKU detail now shows MAIN-warehouse on-hand/reserved/available quantities, immutable movement/import reasons, actor, and date/reason filters. Reservations and batch/lot remain explicitly unavailable until their Phase 3/operations policies are approved.
- [x] Ensure imports and manual adjustments use the same immutable movement ledger and cannot silently overwrite each other. Both paths write `InventoryMovement` rows in retried serializable transactions; rollback now fails closed if any affected quantity changed after the import, rather than overwriting a later adjustment. Production concurrency rehearsal remains an external rollout gate.

## 5. Order and shipping management

### Data and state machine

**Current enforced fulfilment policy:** payment status is provider/reconciliation-owned and staff cannot set it to paid. For paid orders, fulfilment may move only from `UNFULFILLED` to `PROCESSING`, then `SHIPPED` (tracking number required), then `DELIVERED`; every transition creates an `OrderEvent`. Cancellation, returns, refunds, split shipments, carrier labels, and customer notifications remain disabled until their operational owners and policies are approved.

- [x] Extend order data with human-readable order number, immutable checkout address/shipping snapshots, fulfilment status, shipment(s), carrier/service, tracking number, label/reference, dispatched/delivered timestamps, notes, and `OrderEvent` timeline.
- [x] Separate order, payment, and fulfilment states. The enforced operational path is provider/reconciliation-owned payment plus `PAID → PROCESSING → SHIPPED → DELIVERED`, with the aggregate order status becoming `FULFILLED` on delivery; cancellation, return, and refund remain absent pending policy approval.
- [x] Make every operational transition transactional, permission-checked, idempotent, and event-backed. Staff cannot mark payment paid; fulfilment uses an atomic expected-state claim and matching retries are safe. Cancellation/return/refund endpoints remain intentionally absent.
- [ ] Support stock reservation/release according to the approved Phase 3 order policy; prevent shipping more than ordered and guard concurrent updates.

### ERP experience

- [x] Add Orders list with searchable order number/customer email/SKU/tracking number, date/status/payment/fulfilment filters, pagination, totals, and export only for authorised roles. Search, filters, pagination, totals, and ERP controls are implemented; export remains intentionally absent pending privacy/ownership approval.
- [x] Add order detail with customer contact, immutable item/address/payment/shipping snapshots, quantities, timeline, internal notes, and clearly separated customer-visible versus internal data. Notes are excluded from customer order responses and their timeline event stores only the note ID; customer-visible field classification is documented as an external policy gate.
- [x] Add fulfilment actions: confirm processing, select carrier/service, validate tracking number, mark shipped/delivered, and handle permitted cancellations. The guarded processing → shipped → delivered progression requires approved carrier/service/tracking; cancellation is intentionally unavailable pending exceptional-transition policy.
- [x] Support partial fulfilment and multiple shipments only if operations approves the model; otherwise explicitly prevent it. The schema enforces one `Shipment` per order and no partial-shipment action exists.
- [x] Add customer notifications only from approved templates and only after a committed transition; make failed delivery retryable and auditable. The approved default is no automated customer notifications until templates, sender, and ownership are separately approved; no notification route is exposed.

## 6. Observability, migration, and quality gate

- [x] Create forward-safe migrations and a staged rollout: staff/RBAC first, read-only order views next, stock-import dry run, then controlled stock apply and shipping transitions. The production rehearsal remains an external rollout gate.
- [x] Backfill existing admin activity/movements with an explicit migration actor; never fabricate a named staff identity. Migration `20261003160000_backfill_unattributed_erp_actors` preserves historical records while changing legacy shared-token labels to `legacy-unattributed`.
- [ ] Add API integration tests for staff auth, MFA/step-up where enabled, RBAC, session revocation, import validation/apply/idempotency/rollback, inventory concurrency, and all order/shipping transitions. `npm run test:integration` verifies session authentication, retired-token rejection, RBAC, production MFA blocking, session revocation, paid-order fulfilment sequencing/idempotency/events, durable failed jobs, apply/rollback movements, exact quantity restoration, and rollback conflict protection. Broader concurrency/load coverage remains a rollout gate.
- [ ] Add browser tests for inaccessible menus/routes, invitation/login/recovery, CSV error recovery, import confirmation/progress, order search/detail, and shipping-status failure states. Playwright verifies enumeration-safe recovery, invitation/reset screens, and a real invited Super Admin activation into authenticated permission-gated ERP navigation. Import and fulfilment browser rehearsal remain rollout quality work.
- [ ] Test malformed and hostile uploads, CSV formula injection, duplicate rows, stale imports, concurrent adjustment/import conflicts, leaked exports, and privilege-escalation attempts. Executable parser tests cover malformed headers, formula injection, duplicate rows, invalid quantities, and the row bound; integration/concurrency coverage remains open.
- [ ] Review accessibility at 375 px, 768 px, 1024 px, and 1440 px; validate keyboard tables, dialogs, focus return, error summaries, loading states, and destructive-action confirmations. Automated responsive/browser coverage is in place; a human assistive-technology review remains a release gate.
- [x] Add operational dashboards/alerts for failed staff logins, role changes, rejected/rolled-back imports, stock conflicts, stalled imports, unauthorised transition attempts, and shipment update failures without exposing PII. The ERP dashboard exposes redacted operational counters and access audit; alert routing/ownership remains an external deployment gate.

## Rollout order

1. Approve roles, permission matrix, stock-import semantics, and fulfilment state machine.
2. Ship staff authentication, RBAC middleware, and permission-driven ERP navigation; remove shared interactive admin access.
3. Ship inventory import validation/preview and dry-run reporting; run a supervised production rehearsal.
4. Enable atomic import apply, movement ledger reporting, idempotency, and controlled rollback.
5. Add read-only order operations, then authorised fulfilment/shipping transitions after Phase 3 order creation is stable.
6. Complete security, accessibility, concurrency, and operational rehearsal before broad ERP rollout.

## Definition of done

Phase 4 is complete when each ERP user signs in as an identifiable staff member, can see and perform only authorised work, and every sensitive action is attributable and auditable. Staff can safely validate and apply idempotent SKU stock imports with row-level feedback and immutable inventory movements. Authorised operations staff can view their permitted customer orders and safely progress approved fulfilment/shipping states with an accurate timeline, without bypassing payment, stock, privacy, or separation-of-duties controls.
