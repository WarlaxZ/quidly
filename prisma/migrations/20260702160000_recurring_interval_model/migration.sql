-- Rebuild RecurringRule for the interval schedule model; backfill from the old `frequency` column.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_RecurringRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "vendorId" TEXT,
    "description" TEXT,
    "amountPence" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "intervalUnit" TEXT NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "monthOfYear" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "lastGeneratedDate" DATETIME,
    "externalRef" TEXT,
    CONSTRAINT "RecurringRule_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecurringRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecurringRule_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_RecurringRule" (
    "id", "propertyId", "categoryId", "vendorId", "description", "amountPence", "direction",
    "intervalUnit", "intervalCount", "dayOfWeek", "dayOfMonth", "monthOfYear", "active",
    "startDate", "endDate", "lastGeneratedDate", "externalRef"
)
SELECT
    "id", "propertyId", "categoryId", "vendorId", NULL, "amountPence", "direction",
    CASE "frequency" WHEN 'annual' THEN 'YEAR' ELSE 'MONTH' END,
    CASE "frequency" WHEN 'quarterly' THEN 3 ELSE 1 END,
    NULL,
    "dayOfMonth",
    NULL,
    true,
    "startDate", "endDate", "lastGeneratedDate", "externalRef"
FROM "RecurringRule";

DROP TABLE "RecurringRule";
ALTER TABLE "new_RecurringRule" RENAME TO "RecurringRule";
CREATE UNIQUE INDEX "RecurringRule_externalRef_key" ON "RecurringRule"("externalRef");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
