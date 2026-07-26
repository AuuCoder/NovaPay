-- CreateEnum
CREATE TYPE "CtfBillCaptureStatus" AS ENUM ('RECEIVED', 'MATCHED', 'IGNORED');

-- CreateTable
CREATE TABLE "CtfBillCaptureEvent" (
    "id" TEXT NOT NULL,
    "merchantChannelAccountId" TEXT,
    "matchedPaymentOrderId" TEXT,
    "channelCode" TEXT NOT NULL,
    "captureSource" TEXT,
    "externalBillId" TEXT,
    "payerAccount" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'CNY',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "remark" TEXT,
    "rawPayload" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" "CtfBillCaptureStatus" NOT NULL DEFAULT 'RECEIVED',
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CtfBillCaptureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CtfBillCaptureEvent_fingerprint_key" ON "CtfBillCaptureEvent"("fingerprint");

-- CreateIndex
CREATE INDEX "CtfBillCaptureEvent_merchantChannelAccountId_status_paidAt_idx" ON "CtfBillCaptureEvent"("merchantChannelAccountId", "status", "paidAt");

-- CreateIndex
CREATE INDEX "CtfBillCaptureEvent_matchedPaymentOrderId_idx" ON "CtfBillCaptureEvent"("matchedPaymentOrderId");

-- CreateIndex
CREATE INDEX "CtfBillCaptureEvent_channelCode_amount_paidAt_idx" ON "CtfBillCaptureEvent"("channelCode", "amount", "paidAt");

-- AddForeignKey
ALTER TABLE "CtfBillCaptureEvent" ADD CONSTRAINT "CtfBillCaptureEvent_merchantChannelAccountId_fkey" FOREIGN KEY ("merchantChannelAccountId") REFERENCES "MerchantChannelAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CtfBillCaptureEvent" ADD CONSTRAINT "CtfBillCaptureEvent_matchedPaymentOrderId_fkey" FOREIGN KEY ("matchedPaymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
