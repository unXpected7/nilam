CREATE TABLE "StaffInvitation" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");
CREATE INDEX "StaffInvitation_staffId_expiresAt_idx" ON "StaffInvitation"("staffId", "expiresAt");
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StaffPasswordReset" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffPasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffPasswordReset_tokenHash_key" ON "StaffPasswordReset"("tokenHash");
CREATE INDEX "StaffPasswordReset_staffId_expiresAt_idx" ON "StaffPasswordReset"("staffId", "expiresAt");
ALTER TABLE "StaffPasswordReset" ADD CONSTRAINT "StaffPasswordReset_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
