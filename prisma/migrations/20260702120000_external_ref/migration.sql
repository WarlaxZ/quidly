ALTER TABLE "Vendor" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "Vendor_externalRef_key" ON "Vendor"("externalRef");

ALTER TABLE "Transaction" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "Transaction_externalRef_key" ON "Transaction"("externalRef");
