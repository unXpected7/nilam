-- Historical shared-token activity cannot be attributed to an identifiable staff
-- account. Preserve the records but mark them explicitly as unattributed.
UPDATE "AdminAuditLog"
SET "actor" = 'legacy-unattributed'
WHERE "actor" IN ('token-admin', 'legacy-token-admin');

UPDATE "InventoryMovement"
SET "actor" = 'legacy-unattributed'
WHERE "actor" IN ('token-admin', 'legacy-token-admin');
