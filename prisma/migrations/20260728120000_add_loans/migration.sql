CREATE TABLE "Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "openingBalancePence" INTEGER NOT NULL,
    "annualRateBps" INTEGER NOT NULL,
    "scheduledPaymentPence" INTEGER NOT NULL,
    "intervalUnit" TEXT NOT NULL DEFAULT 'MONTH',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "monthOfYear" INTEGER,
    "startDate" DATETIME NOT NULL,
    "termEndDate" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Loan_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Loan_propertyId_idx" ON "Loan"("propertyId");

CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "openingBalancePence" INTEGER NOT NULL,
    "computedInterestPence" INTEGER NOT NULL,
    "actualInterestPence" INTEGER,
    "paidPence" INTEGER NOT NULL,
    "closingBalancePence" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LoanPayment_loanId_date_key" ON "LoanPayment"("loanId", "date");

ALTER TABLE "Transaction" ADD COLUMN "loanPaymentId" TEXT CONSTRAINT "Transaction_loanPaymentId_fkey" REFERENCES "LoanPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Transaction_loanPaymentId_idx" ON "Transaction"("loanPaymentId");
