# Phase 4 operating policy

**Approved default policy — 2026-10-03 (Asia/Jakarta)**

This records the user-approved proposed defaults for the current Nilam ERP rollout. It governs Phase 4 until a later approved change is recorded here and implemented through a reviewed migration or configuration change.

## Accountability and access

- The initial accountable ERP operator is the Super Admin account. `admin@admin.com` is the initial development bootstrap account only; production access is invitation-only.
- Super Admin approves staff invitations, role changes, stock-import rollback, and MFA recovery. Catalogue, Inventory, Customer Service, Fulfilment, Finance, and Auditor retain the least-privilege bundles defined in `backend/src/lib/staffPermissions.ts`.
- Privileged staff complete a quarterly access review. Inactive accounts are deactivated and their sessions revoked.
- MFA recovery requires two authorised operators: out-of-band identity verification, an auditable 10–500-character reason, and an enrolled Super Admin. The recovery API removes the old factor and revokes every target session.

## Stock and imports

- `MAIN` is the sole approved warehouse.
- CSV imports are absolute on-hand quantities, never deltas. Negative stock is prohibited.
- Inventory is matched only by immutable SKU. Unknown, archived, malformed, duplicate, formula-injected, and non-`MAIN` rows are rejected.
- An import rollback is available only to Super Admin within 24 hours. It creates compensating movements and fails if a later stock change would make reversal unsafe.
- Batch/lot, expiry, multi-warehouse inventory, exports, and a separate reservation model are not approved or enabled.

## Fulfilment and customer communication

- ERP fulfilment is allowed only for provider-reconciled paid orders: `UNFULFILLED → PROCESSING → SHIPPED → DELIVERED`. Delivery sets the aggregate order status to `FULFILLED`.
- The approved carriers are JNE and J&T. Carrier service and tracking number must be present before shipment. The selected customer quote/provider service is the source of truth; ERP staff must not invent a service or rate.
- Cancellation, returns, refunds, split shipments, shipment-label purchasing, automated customer notifications, and order export remain disabled. They require later policy, privacy, provider, and template approval.

## Production release gates

- A distinct `PROD_ERP_MFA_ENCRYPTION_KEY`, provider credentials, and verified Brevo sender must be stored only in vm01’s ignored mode-600 environment file.
- Before broad production access: enroll MFA for every privileged staff member, validate invitation/recovery delivery, run a supervised import dry run plus apply/rollback rehearsal, verify backup restoration ownership, and complete the human accessibility review.

