ALTER TABLE "Address" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Address_userId_default_key" ON "Address" ("userId") WHERE "isDefault";
