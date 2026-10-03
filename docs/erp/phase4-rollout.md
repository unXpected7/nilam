# Phase 4 rollout runbook

The approved operational defaults are in [Phase 4 operating policy](./phase4-operating-policy.md). Do not enable a workflow that the policy explicitly keeps disabled.

## Preconditions

- Production provider credentials, Brevo verified sender/domain for staff invitations and recovery, payment/shipping policies, MFA policy, and notification ownership are approved. Set a distinct, mode-600 `PROD_ERP_MFA_ENCRYPTION_KEY` before enabling the app; retain `ERP_REQUIRE_MFA_FOR_PRIVILEGED=true` so privileged ERP mutations require each staff member to enroll and verify TOTP MFA.
- Production database backup and restoration owner are recorded.
- `npm run lint`, API integration tests, and browser/accessibility checks pass on the release commit.

## Stages

1. Deploy staff/RBAC migrations and verify a Super Admin session can access only its assigned permissions.
2. Deploy read-only order and staff access-event APIs; verify no fulfilment mutation is exposed to unauthorised roles.
3. Run stock-import preview against production-like CSV data. Confirm `MAIN` warehouse, absolute-stock quantities, errors, and checksum idempotency.
4. Apply one supervised import, confirm the persistent import job reaches `SUCCEEDED`, reconcile every movement, and verify the compensating rollback job inside the configured window.
5. Enable fulfilment transitions only after Phase 3 creates paid orders through the provider-authoritative payment workflow.
6. Verify shared-token access is rejected, test staff invitation and recovery delivery using the production ERP URL, enroll TOTP MFA for every privileged staff account, and confirm every active ERP user has a staff account. Retain the encrypted-key backup and use the approved recovery process before rotating it; rotating the key without recovery requires MFA re-enrollment.

## MFA recovery and break-glass procedure

There is no shared-token or secret-key bypass. A lost-authenticator recovery requires two authorised operators: a Super Admin with enrolled MFA verifies the request through the approved out-of-band identity process, records a 10–500-character reason, and invokes the audited `POST /api/admin/staff/:id/reset-mfa` operation. That operation removes the target’s TOTP material, revokes every target session, records both a staff access event and admin audit entry, and requires the target to enroll a new factor before production privileged work resumes. Never rotate `ERP_MFA_ENCRYPTION_KEY` as a recovery shortcut; it makes every existing TOTP secret unrecoverable.

## Rollback

- Application rollback: redeploy the prior verified image; do not run destructive Prisma reset or `db push`.
- Import rollback: use the audited compensating rollback endpoint only within its configured window.
- Schema rollback: use a reviewed forward corrective migration; never delete production transaction history.
