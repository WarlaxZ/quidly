CREATE TABLE "DeductionDismissal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taxYear" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DeductionDismissal_taxYear_itemKey_key" ON "DeductionDismissal"("taxYear", "itemKey");
