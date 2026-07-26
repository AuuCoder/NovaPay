ALTER TYPE "CtfBillCaptureStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';

ALTER TABLE "CtfBillCaptureEvent"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "failureMessage" TEXT;

CREATE INDEX "CtfBillCaptureEvent_status_nextAttemptAt_createdAt_idx"
  ON "CtfBillCaptureEvent"("status", "nextAttemptAt", "createdAt");
