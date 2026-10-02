CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "snapToken" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentType" TEXT,
    "notificationHash" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentAttempt_providerOrderId_key" ON "PaymentAttempt"("providerOrderId");
CREATE UNIQUE INDEX "PaymentAttempt_notificationHash_key" ON "PaymentAttempt"("notificationHash");
CREATE INDEX "PaymentAttempt_orderId_createdAt_idx" ON "PaymentAttempt"("orderId", "createdAt");
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
