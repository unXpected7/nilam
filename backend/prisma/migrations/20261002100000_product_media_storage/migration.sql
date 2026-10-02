ALTER TABLE "ProductMedia"
ADD COLUMN "objectKey" TEXT,
ADD COLUMN "contentType" TEXT,
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER,
ADD COLUMN "bytes" INTEGER,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "ProductMedia_objectKey_key" ON "ProductMedia"("objectKey");
