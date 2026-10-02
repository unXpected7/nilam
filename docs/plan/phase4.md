# Phase 4 — Nilam ERP access, inventory imports, and order operations

**Status: PLANNED**  
**Updated: 2026-10-02 (Asia/Jakarta)**

## Goal

Replace the current shared admin-token dashboard with a secure, auditable Nilam ERP. Authorised staff must sign in, receive only the menus and actions their role permits, import SKU-level stock safely in batches, and manage customer orders through approved fulfilment and shipping transitions.

Phase 4 is an internal operations phase. It must not activate customer payment or invent shipping commitments; those prerequisites remain governed by Phase 3.

## Current baseline

- [x] The ERP has product, category, collection, media, variant, inventory, inventory-movement, and dashboard endpoints.
- [x] Inventory edits create movement records and product/media mutations are audited.
- [x] Prisma has `Order`, `OrderItem`, order status, and payment status fields, but no checkout-created orders, shipping fields, operational order events, or staff accounts.
- [ ] ERP access uses one `ADMIN_API_TOKEN` header. It has no named staff identity, session lifecycle, role, menu permission, or per-action audit attribution.
- [ ] There is no bulk SKU stock-import workflow, staging/validation report, import history, or safe rollback mechanism.
- [ ] There is no ERP order list/detail or controlled shipping-status management.

## 1. Decisions and guardrails

- [ ] Name the operational roles and owners: Super Admin, Catalogue, Inventory, Customer Service, Fulfilment, Finance, and read-only Auditor. Keep roles minimal; prefer permissions over bespoke roles.
- [ ] Approve a permission matrix for every ERP menu and write action. “Can view” must not imply “can export, edit, cancel, refund, or change stock.”
- [ ] Define staff identity lifecycle: invitation, activation, MFA requirement, deactivation, session duration, emergency break-glass access, and access-review cadence. A development-only, environment-configured bootstrap Super Admin seed exists; invitation-only production provisioning remains required.
- [ ] Approve stock source-of-truth, import frequency, warehouse/location model, SKU identity rules, negative-stock policy, stock-adjustment reason codes, and correction/rollback authority.
- [ ] Approve fulfilment state transitions, carrier and tracking-number rules, shipment split/partial-fulfilment policy, cancellation window, return/refund ownership, and customer-notification policy.
- [ ] Do not store card data, provider secrets, or customer passwords in imports, audit payloads, exports, browser storage, or staff-facing URLs.

## 2. ERP authentication and staff accounts

### Data and security

- [ ] Add `StaffUser`, `StaffRole`, `Permission`, role-permission assignment, staff-session, invitation/reset token, and staff-access-event models with reversible migrations. The staff identity, role, permission, assignment, hashed-session, and access-event schema/migration foundation is in place; invitation/reset records and event production remain open.
- [ ] Use unique staff email identity, modern memory-hard password hashing, HttpOnly/Secure/SameSite cookies, session rotation/revocation, reset-token expiry/single use, and enumeration-safe recovery responses. Hashed staff-session creation, lookup, logout revocation, and secure-cookie primitives are in place; login, cookie issuance flow, rotation, and recovery remain open.
- [ ] Require MFA for privileged roles before production access; document approved authenticator/recovery procedures and enforce a step-up check for sensitive actions.
- [ ] Retire the shared `ADMIN_API_TOKEN` from interactive ERP access. Existing ERP APIs now accept a valid staff session while the legacy token remains a temporary migration fallback; permission migration and token retirement remain open.
- [ ] Apply staff-login throttling, CSRF protection, security headers, correlation IDs, redacted structured logs, and alerting for repeated failure or privilege changes.

### ERP experience

- [ ] Add `/erp/login`, recovery/reset, session-expired, first-login/password-change, and access-denied screens with accessible validation and no account enumeration. The ERP now has email/password login, session restoration, expired-session return-to-sign-in, and an access-denied state; recovery and first-login flows remain open.
- [ ] Add a staff management screen restricted to the appropriate permission: invite, deactivate/reactivate, revoke sessions, assign roles, and view access history. Never show password hashes, tokens, or MFA secrets.
- [ ] Show the current staff name, role, and sign-out control in the ERP shell.

## 3. RBAC and menu access

- [x] Define stable permission keys: `dashboard.read`, `catalogue.read/write`, `media.write`, `inventory.read/adjust/import`, `orders.read/manage`, `shipping.manage`, `customers.read`, `staff.manage`, and `audit.read`. Proposed default role bundles are defined and seeded idempotently; approval and enforcement remain open.
- [ ] Enforce permissions in API middleware on every endpoint; hiding a menu is not authorisation. Staff-session ERP requests now receive central dashboard/catalogue/media/inventory permission checks with consistent `403` responses; explicit per-route policy and new order/staff APIs remain open.
- [ ] Make ERP navigation server/permission-driven. The ERP now hides navigation items absent from the restored staff-session permission list and shows access denied for forbidden requests; direct-route policy is enforced by the backend guard, with server-rendered navigation still open.
- [ ] Audit every permission/role/staff lifecycle change with actor, target, before/after permission set, request ID, and timestamp.
- [ ] Add permission tests for every protected route, including attempts to escalate through crafted requests or stale sessions.

## 4. SKU and batch stock imports

### Import contract

- [x] Publish a versioned CSV template and field dictionary. Required fields: SKU, quantity, warehouse/location, effective timestamp, source reference, and adjustment reason; batch/lot and expiry are documented as future optional fields. XLSX support remains open.
- [ ] Treat SKU as the immutable matching key. The preview endpoint rejects duplicate/malformed rows and flags unknown SKUs without creating catalogue records; archived, ambiguous, and authorised-location checks remain open.
- [ ] Set bounded file size/row limits, UTF-8/CSV-injection protections, schema validation, idempotency key/source reference, and retained source-file checksum. The initial CSV parser has a 10,000-row bound, required-column/value checks, duplicate-SKU detection, and formula-injection rejection; upload transport, source checksum, and idempotency remain open.
- [ ] Decide whether values are absolute on-hand counts or deltas. Do not permit mixed semantics in one import.

### Workflow and data model

- [ ] Add `InventoryImport`, `InventoryImportRow`, optional `InventoryBatch`, source reference/checksum, status (`UPLOADED`, `VALIDATED`, `APPLIED`, `REJECTED`, `ROLLED_BACK`), errors, actor, and timestamps. Import and row schema models are defined; migration, batch tracking, and workflow persistence remain open.
- [ ] Build upload → parse → validate → preview → explicit confirm → atomic apply. Validation must not alter inventory; apply must lock/recheck affected SKU inventory and create one movement per applied row.
- [ ] Return row-level errors/warnings plus totals for accepted, rejected, changed, unchanged, and conflict rows. Block apply when blocking errors exist.
- [ ] Provide idempotent retry protection and a controlled compensating rollback that creates reversing movements rather than deleting history. Restrict rollback to approved permissions and a stated time window.
- [ ] Support asynchronous jobs/progress for large files, with recovery after a worker/server restart and no duplicate application.

### ERP experience

- [ ] Add Inventory → Import stock: template download, drag/drop or file chooser, validation preview, downloadable error report, confirmation summary, progress, final receipt, and import-history/detail pages.
- [ ] Add SKU inventory detail: on-hand, reserved/available once checkout introduces reservations, movements, import source, batch/lot where enabled, and filters by warehouse/date/reason.
- [ ] Ensure imports and manual adjustments use the same immutable movement ledger and cannot silently overwrite each other.

## 5. Order and shipping management

### Data and state machine

- [ ] Extend order data with human-readable order number, immutable checkout address/shipping snapshots, fulfilment status, shipment(s), carrier/service, tracking number, label/reference, dispatched/delivered timestamps, notes, and `OrderEvent` timeline.
- [ ] Separate order, payment, and fulfilment states. Document allowed transitions and guards, including `PENDING_PAYMENT → PAID`, `PAID → PROCESSING → SHIPPED → DELIVERED`, cancellation, return, and refund paths.
- [ ] Make every operational transition transactional, permission-checked, idempotent, and event-backed. Never let staff mark payment paid without approved payment reconciliation authority.
- [ ] Support stock reservation/release according to the approved Phase 3 order policy; prevent shipping more than ordered and guard concurrent updates.

### ERP experience

- [ ] Add Orders list with searchable order number/customer email/SKU/tracking number, date/status/payment/fulfilment filters, pagination, totals, and export only for authorised roles.
- [ ] Add order detail with customer contact, immutable item/address/payment/shipping snapshots, quantities, timeline, internal notes, and clearly separated customer-visible versus internal data.
- [ ] Add fulfilment actions: confirm processing, select carrier/service, validate tracking number, mark shipped/delivered, and handle permitted cancellations. Require a reason for exceptional transitions.
- [ ] Support partial fulfilment and multiple shipments only if operations approves the model; otherwise explicitly prevent it.
- [ ] Add customer notifications only from approved templates and only after a committed transition; make failed delivery retryable and auditable.

## 6. Observability, migration, and quality gate

- [ ] Create reversible migrations and a staged rollout: staff/RBAC first, read-only order views next, stock-import dry run, then controlled stock apply and shipping transitions.
- [ ] Backfill existing admin activity/movements with an explicit migration actor; never fabricate a named staff identity.
- [ ] Add API integration tests for staff auth, MFA/step-up where enabled, RBAC, session revocation, import validation/apply/idempotency/rollback, inventory concurrency, and all order/shipping transitions.
- [ ] Add browser tests for inaccessible menus/routes, invitation/login/recovery, CSV error recovery, import confirmation/progress, order search/detail, and shipping-status failure states.
- [ ] Test malformed and hostile uploads, CSV formula injection, duplicate rows, stale imports, concurrent adjustment/import conflicts, leaked exports, and privilege-escalation attempts.
- [ ] Review accessibility at 375 px, 768 px, 1024 px, and 1440 px; validate keyboard tables, dialogs, focus return, error summaries, loading states, and destructive-action confirmations.
- [ ] Add operational dashboards/alerts for failed staff logins, role changes, rejected/rolled-back imports, stock conflicts, stalled imports, unauthorised transition attempts, and shipment update failures without exposing PII.

## Rollout order

1. Approve roles, permission matrix, stock-import semantics, and fulfilment state machine.
2. Ship staff authentication, RBAC middleware, and permission-driven ERP navigation; remove shared interactive admin access.
3. Ship inventory import validation/preview and dry-run reporting; run a supervised production rehearsal.
4. Enable atomic import apply, movement ledger reporting, idempotency, and controlled rollback.
5. Add read-only order operations, then authorised fulfilment/shipping transitions after Phase 3 order creation is stable.
6. Complete security, accessibility, concurrency, and operational rehearsal before broad ERP rollout.

## Definition of done

Phase 4 is complete when each ERP user signs in as an identifiable staff member, can see and perform only authorised work, and every sensitive action is attributable and auditable. Staff can safely validate and apply idempotent SKU stock imports with row-level feedback and immutable inventory movements. Authorised operations staff can view their permitted customer orders and safely progress approved fulfilment/shipping states with an accurate timeline, without bypassing payment, stock, privacy, or separation-of-duties controls.
