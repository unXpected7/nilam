CREATE TYPE "FulfillmentStatus" AS ENUM ('UNFULFILLED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

ALTER TABLE "Order"
    ADD COLUMN "orderNumber" TEXT,
    ADD COLUMN "discount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "tax" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "shippingAddress" JSONB,
    ADD COLUMN "shippingMethod" JSONB,
    ADD COLUMN "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'UNFULFILLED';

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

CREATE TABLE "CheckoutQuote" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "shippingMethod" JSONB NOT NULL,
    "voucherCode" TEXT,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "shipping" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckoutQuote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CheckoutQuote_cartId_expiresAt_idx" ON "CheckoutQuote"("cartId", "expiresAt");
CREATE INDEX "CheckoutQuote_userId_expiresAt_idx" ON "CheckoutQuote"("userId", "expiresAt");

CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT,
    "service" TEXT,
    "trackingNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "labelUrl" TEXT,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");
CREATE UNIQUE INDEX "Shipment_trackingNumber_key" ON "Shipment"("trackingNumber");
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actor" TEXT,
    "requestId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
