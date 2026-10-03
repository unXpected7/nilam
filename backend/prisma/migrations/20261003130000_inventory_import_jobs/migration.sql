CREATE TYPE "InventoryImportJobOperation" AS ENUM ('APPLY', 'ROLLBACK');
CREATE TYPE "InventoryImportJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "InventoryImportJob" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "operation" "InventoryImportJobOperation" NOT NULL,
    "status" "InventoryImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "actor" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryImportJob_status_createdAt_idx" ON "InventoryImportJob"("status", "createdAt");
CREATE INDEX "InventoryImportJob_importId_createdAt_idx" ON "InventoryImportJob"("importId", "createdAt");
CREATE UNIQUE INDEX "InventoryImportJob_one_active_job_per_import" ON "InventoryImportJob"("importId") WHERE "status" IN ('QUEUED', 'PROCESSING');
ALTER TABLE "InventoryImportJob" ADD CONSTRAINT "InventoryImportJob_importId_fkey" FOREIGN KEY ("importId") REFERENCES "InventoryImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
