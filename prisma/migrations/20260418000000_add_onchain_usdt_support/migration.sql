-- CreateEnum
CREATE TYPE "OnchainDepositStatus" AS ENUM ('DETECTED', 'CONFIRMED', 'MATCHED', 'IGNORED');

-- AlterTable
ALTER TABLE "PaymentOrder"
ADD COLUMN "payableAmount" DECIMAL(24,6),
ADD COLUMN "payableCurrency" VARCHAR(8),
ADD COLUMN "quoteRate" DECIMAL(18,6),
ADD COLUMN "quoteSource" TEXT,
ADD COLUMN "quoteSpreadBps" INTEGER,
ADD COLUMN "quoteExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OnchainDeposit" (
    "id" TEXT NOT NULL,
    "chainCode" TEXT NOT NULL,
    "tokenCode" TEXT NOT NULL DEFAULT 'USDT',
    "merchantChannelAccountId" TEXT,
    "paymentOrderId" TEXT,
    "recipientAddress" TEXT NOT NULL,
    "amount" DECIMAL(24,6) NOT NULL,
    "txHash" TEXT NOT NULL,
    "txIndex" TEXT NOT NULL DEFAULT '0',
    "blockNumber" BIGINT,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "requiredConfirmations" INTEGER NOT NULL DEFAULT 0,
    "status" "OnchainDepositStatus" NOT NULL DEFAULT 'DETECTED',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnchainDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentOrder_quoteExpiresAt_createdAt_idx" ON "PaymentOrder"("quoteExpiresAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OnchainDeposit_chainCode_txHash_txIndex_key" ON "OnchainDeposit"("chainCode", "txHash", "txIndex");

-- CreateIndex
CREATE INDEX "OnchainDeposit_merchantChannelAccountId_status_observedAt_idx" ON "OnchainDeposit"("merchantChannelAccountId", "status", "observedAt");

-- CreateIndex
CREATE INDEX "OnchainDeposit_paymentOrderId_status_observedAt_idx" ON "OnchainDeposit"("paymentOrderId", "status", "observedAt");

-- CreateIndex
CREATE INDEX "OnchainDeposit_status_chainCode_observedAt_idx" ON "OnchainDeposit"("status", "chainCode", "observedAt");

-- AddForeignKey
ALTER TABLE "OnchainDeposit" ADD CONSTRAINT "OnchainDeposit_merchantChannelAccountId_fkey" FOREIGN KEY ("merchantChannelAccountId") REFERENCES "MerchantChannelAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnchainDeposit" ADD CONSTRAINT "OnchainDeposit_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
