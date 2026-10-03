ALTER TABLE "StaffUser" ADD COLUMN "mfaSecretEncrypted" TEXT;
ALTER TABLE "StaffUser" ADD COLUMN "mfaPendingSecretEncrypted" TEXT;
ALTER TABLE "StaffUser" ADD COLUMN "mfaEnabledAt" TIMESTAMP(3);

CREATE TABLE "StaffMfaChallenge" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffMfaChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffMfaChallenge_tokenHash_key" ON "StaffMfaChallenge"("tokenHash");
CREATE INDEX "StaffMfaChallenge_staffId_expiresAt_idx" ON "StaffMfaChallenge"("staffId", "expiresAt");
ALTER TABLE "StaffMfaChallenge" ADD CONSTRAINT "StaffMfaChallenge_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
