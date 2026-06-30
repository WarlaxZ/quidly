CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "accountingYearEndDay" INTEGER NOT NULL,
    "accountingYearEndMonth" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "Property" ADD COLUMN "companyId" TEXT;
CREATE INDEX "Property_companyId_idx" ON "Property"("companyId");
