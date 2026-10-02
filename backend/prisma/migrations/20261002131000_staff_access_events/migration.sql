CREATE TABLE "StaffAccessEvent" (
    "id" TEXT NOT NULL,
    "staffId" TEXT,
    "event" TEXT NOT NULL,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffAccessEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StaffAccessEvent_staffId_createdAt_idx" ON "StaffAccessEvent"("staffId", "createdAt");
CREATE INDEX "StaffAccessEvent_event_createdAt_idx" ON "StaffAccessEvent"("event", "createdAt");
ALTER TABLE "StaffAccessEvent" ADD CONSTRAINT "StaffAccessEvent_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
