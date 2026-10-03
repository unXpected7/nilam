CREATE TYPE "InventoryImportStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'APPLIED', 'REJECTED', 'ROLLED_BACK');

CREATE TABLE "InventoryImport" (
    "id" TEXT NOT NULL,
    "status" "InventoryImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "sourceReference" TEXT NOT NULL,
    "checksum" TEXT,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryImport_sourceReference_idx" ON "InventoryImport"("sourceReference");

CREATE TABLE "InventoryImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER,
    "warehouse" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryImportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryImportRow_importId_rowNumber_key" ON "InventoryImportRow"("importId", "rowNumber");
ALTER TABLE "InventoryImportRow" ADD CONSTRAINT "InventoryImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "InventoryImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
