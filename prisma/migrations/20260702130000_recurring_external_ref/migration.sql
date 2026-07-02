ALTER TABLE "RecurringRule" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "RecurringRule_externalRef_key" ON "RecurringRule"("externalRef");
