CREATE TABLE "OrderInternalNote" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderInternalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderInternalNote_orderId_createdAt_idx" ON "OrderInternalNote"("orderId", "createdAt");
ALTER TABLE "OrderInternalNote" ADD CONSTRAINT "OrderInternalNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
