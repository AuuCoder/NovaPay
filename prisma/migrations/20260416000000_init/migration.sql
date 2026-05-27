-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentRefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "CallbackDeliveryStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "CallbackAttemptStatus" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "MerchantUserRole" AS ENUM ('OWNER', 'OPS', 'DEVELOPER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MerchantLedgerEntryType" AS ENUM ('PAYMENT_CAPTURE', 'PAYMENT_FEE', 'REFUND', 'SETTLEMENT_PAYOUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "MerchantLedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "MerchantSettlementStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED_FINAL', 'FAILED_RETRYABLE');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "MerchantStatus" NOT NULL DEFAULT 'PENDING',
    "legalName" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "website" TEXT,
    "companyRegistrationId" TEXT,
    "onboardingNote" TEXT,
    "reviewNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "callbackBase" TEXT,
    "notifySecret" TEXT,
    "apiIpWhitelist" TEXT,
    "callbackEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAccount" (
    "id" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "channelCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL,
    "limits" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantChannelAccount" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "channelCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "callbackToken" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "remark" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantChannelAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantChannelBinding" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "channelCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "providerAccountId" TEXT,
    "merchantChannelAccountId" TEXT,
    "minAmount" DECIMAL(18,2),
    "maxAmount" DECIMAL(18,2),
    "feeRate" DECIMAL(8,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantChannelBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'general',
    "label" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantApiCredential" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "secretPreview" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantUser" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "MerchantUserRole" NOT NULL DEFAULT 'OWNER',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantSession" (
    "id" TEXT NOT NULL,
    "merchantUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "channelCode" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "providerAccountId" TEXT,
    "merchantChannelAccountId" TEXT,
    "apiCredentialId" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "feeRateSnapshot" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "feeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'CNY',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayOrderId" TEXT,
    "providerStatus" TEXT,
    "checkoutUrl" TEXT,
    "callbackUrl" TEXT,
    "returnUrl" TEXT,
    "metadata" JSONB,
    "channelPayload" JSONB,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "callbackStatus" "CallbackDeliveryStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "callbackAttemptsCount" INTEGER NOT NULL DEFAULT 0,
    "callbackDeliveredAt" TIMESTAMP(3),
    "lastCallbackAt" TIMESTAMP(3),
    "nextCallbackAt" TIMESTAMP(3),
    "expireAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "paymentOrderId" TEXT NOT NULL,
    "providerAccountId" TEXT,
    "merchantChannelAccountId" TEXT,
    "apiCredentialId" TEXT,
    "externalRefundId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "feeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netAmountImpact" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'CNY',
    "status" "PaymentRefundStatus" NOT NULL DEFAULT 'PENDING',
    "providerRefundId" TEXT,
    "providerStatus" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantLedgerEntry" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "paymentOrderId" TEXT,
    "paymentRefundId" TEXT,
    "settlementId" TEXT,
    "type" "MerchantLedgerEntryType" NOT NULL,
    "direction" "MerchantLedgerDirection" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'CNY',
    "description" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantSettlement" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "settlementDate" TIMESTAMP(3) NOT NULL,
    "eligibleAt" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'CNY',
    "grossAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "feeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "adjustmentAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "MerchantSettlementStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'CNY',
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "closingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDebit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantRequestNonce" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "apiCredentialId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantRequestNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantIdempotencyRecord" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "apiCredentialId" TEXT,
    "scope" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "requestSummary" JSONB,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "httpStatus" INTEGER,
    "responseBody" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "replayCount" INTEGER NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCallbackAttempt" (
    "id" TEXT NOT NULL,
    "paymentOrderId" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "status" "CallbackAttemptStatus" NOT NULL,
    "httpStatus" INTEGER,
    "requestHeaders" JSONB,
    "requestBody" JSONB,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentCallbackAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_code_key" ON "Merchant"("code");

-- CreateIndex
CREATE INDEX "Merchant_status_createdAt_idx" ON "Merchant"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Merchant_contactEmail_idx" ON "Merchant"("contactEmail");

-- CreateIndex
CREATE INDEX "ProviderAccount_providerKey_enabled_idx" ON "ProviderAccount"("providerKey", "enabled");

-- CreateIndex
CREATE INDEX "ProviderAccount_channelCode_enabled_priority_idx" ON "ProviderAccount"("channelCode", "enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantChannelAccount_callbackToken_key" ON "MerchantChannelAccount"("callbackToken");

-- CreateIndex
CREATE INDEX "MerchantChannelAccount_merchantId_channelCode_enabled_idx" ON "MerchantChannelAccount"("merchantId", "channelCode", "enabled");

-- CreateIndex
CREATE INDEX "MerchantChannelAccount_merchantId_createdAt_idx" ON "MerchantChannelAccount"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "MerchantChannelBinding_channelCode_enabled_idx" ON "MerchantChannelBinding"("channelCode", "enabled");

-- CreateIndex
CREATE INDEX "MerchantChannelBinding_merchantChannelAccountId_idx" ON "MerchantChannelBinding"("merchantChannelAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantChannelBinding_merchantId_channelCode_key" ON "MerchantChannelBinding"("merchantId", "channelCode");

-- CreateIndex
CREATE INDEX "SystemConfig_group_idx" ON "SystemConfig"("group");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_resourceType_createdAt_idx" ON "AdminAuditLog"("resourceType", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_role_enabled_idx" ON "AdminUser"("role", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_adminUserId_expiresAt_idx" ON "AdminSession"("adminUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantApiCredential_keyId_key" ON "MerchantApiCredential"("keyId");

-- CreateIndex
CREATE INDEX "MerchantApiCredential_merchantId_enabled_idx" ON "MerchantApiCredential"("merchantId", "enabled");

-- CreateIndex
CREATE INDEX "MerchantApiCredential_merchantId_createdAt_idx" ON "MerchantApiCredential"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantUser_email_key" ON "MerchantUser"("email");

-- CreateIndex
CREATE INDEX "MerchantUser_merchantId_enabled_idx" ON "MerchantUser"("merchantId", "enabled");

-- CreateIndex
CREATE INDEX "MerchantUser_merchantId_role_enabled_idx" ON "MerchantUser"("merchantId", "role", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantSession_tokenHash_key" ON "MerchantSession"("tokenHash");

-- CreateIndex
CREATE INDEX "MerchantSession_merchantUserId_expiresAt_idx" ON "MerchantSession"("merchantUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "MerchantSession_expiresAt_idx" ON "MerchantSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_gatewayOrderId_key" ON "PaymentOrder"("gatewayOrderId");

-- CreateIndex
CREATE INDEX "PaymentOrder_status_createdAt_idx" ON "PaymentOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentOrder_channelCode_createdAt_idx" ON "PaymentOrder"("channelCode", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentOrder_providerAccountId_createdAt_idx" ON "PaymentOrder"("providerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentOrder_merchantChannelAccountId_createdAt_idx" ON "PaymentOrder"("merchantChannelAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentOrder_apiCredentialId_createdAt_idx" ON "PaymentOrder"("apiCredentialId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentOrder_callbackStatus_nextCallbackAt_idx" ON "PaymentOrder"("callbackStatus", "nextCallbackAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_merchantId_externalOrderId_key" ON "PaymentOrder"("merchantId", "externalOrderId");

-- CreateIndex
CREATE INDEX "PaymentRefund_paymentOrderId_createdAt_idx" ON "PaymentRefund"("paymentOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentRefund_status_createdAt_idx" ON "PaymentRefund"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentRefund_providerAccountId_createdAt_idx" ON "PaymentRefund"("providerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentRefund_merchantChannelAccountId_createdAt_idx" ON "PaymentRefund"("merchantChannelAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentRefund_apiCredentialId_createdAt_idx" ON "PaymentRefund"("apiCredentialId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRefund_merchantId_externalRefundId_key" ON "PaymentRefund"("merchantId", "externalRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantLedgerEntry_externalKey_key" ON "MerchantLedgerEntry"("externalKey");

-- CreateIndex
CREATE INDEX "MerchantLedgerEntry_merchantId_occurredAt_idx" ON "MerchantLedgerEntry"("merchantId", "occurredAt");

-- CreateIndex
CREATE INDEX "MerchantLedgerEntry_type_occurredAt_idx" ON "MerchantLedgerEntry"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "MerchantLedgerEntry_paymentOrderId_occurredAt_idx" ON "MerchantLedgerEntry"("paymentOrderId", "occurredAt");

-- CreateIndex
CREATE INDEX "MerchantLedgerEntry_paymentRefundId_occurredAt_idx" ON "MerchantLedgerEntry"("paymentRefundId", "occurredAt");

-- CreateIndex
CREATE INDEX "MerchantLedgerEntry_settlementId_occurredAt_idx" ON "MerchantLedgerEntry"("settlementId", "occurredAt");

-- CreateIndex
CREATE INDEX "MerchantSettlement_merchantId_settlementDate_idx" ON "MerchantSettlement"("merchantId", "settlementDate");

-- CreateIndex
CREATE INDEX "MerchantSettlement_status_eligibleAt_idx" ON "MerchantSettlement"("status", "eligibleAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantSettlement_merchantId_settlementDate_currency_key" ON "MerchantSettlement"("merchantId", "settlementDate", "currency");

-- CreateIndex
CREATE INDEX "MerchantBalanceSnapshot_merchantId_snapshotDate_idx" ON "MerchantBalanceSnapshot"("merchantId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantBalanceSnapshot_merchantId_snapshotDate_currency_key" ON "MerchantBalanceSnapshot"("merchantId", "snapshotDate", "currency");

-- CreateIndex
CREATE INDEX "MerchantRequestNonce_apiCredentialId_expiresAt_idx" ON "MerchantRequestNonce"("apiCredentialId", "expiresAt");

-- CreateIndex
CREATE INDEX "MerchantRequestNonce_expiresAt_idx" ON "MerchantRequestNonce"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantRequestNonce_merchantId_nonce_key" ON "MerchantRequestNonce"("merchantId", "nonce");

-- CreateIndex
CREATE INDEX "MerchantIdempotencyRecord_status_leaseExpiresAt_idx" ON "MerchantIdempotencyRecord"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "MerchantIdempotencyRecord_merchantId_createdAt_idx" ON "MerchantIdempotencyRecord"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "MerchantIdempotencyRecord_expiresAt_idx" ON "MerchantIdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantIdempotencyRecord_merchantId_scope_idempotencyKey_key" ON "MerchantIdempotencyRecord"("merchantId", "scope", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentCallbackAttempt_paymentOrderId_createdAt_idx" ON "PaymentCallbackAttempt"("paymentOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "MerchantChannelAccount" ADD CONSTRAINT "MerchantChannelAccount_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantChannelBinding" ADD CONSTRAINT "MerchantChannelBinding_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantChannelBinding" ADD CONSTRAINT "MerchantChannelBinding_providerAccountId_fkey" FOREIGN KEY ("providerAccountId") REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantChannelBinding" ADD CONSTRAINT "MerchantChannelBinding_merchantChannelAccountId_fkey" FOREIGN KEY ("merchantChannelAccountId") REFERENCES "MerchantChannelAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantApiCredential" ADD CONSTRAINT "MerchantApiCredential_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantUser" ADD CONSTRAINT "MerchantUser_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSession" ADD CONSTRAINT "MerchantSession_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "MerchantUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_providerAccountId_fkey" FOREIGN KEY ("providerAccountId") REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_merchantChannelAccountId_fkey" FOREIGN KEY ("merchantChannelAccountId") REFERENCES "MerchantChannelAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_apiCredentialId_fkey" FOREIGN KEY ("apiCredentialId") REFERENCES "MerchantApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_providerAccountId_fkey" FOREIGN KEY ("providerAccountId") REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_merchantChannelAccountId_fkey" FOREIGN KEY ("merchantChannelAccountId") REFERENCES "MerchantChannelAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_apiCredentialId_fkey" FOREIGN KEY ("apiCredentialId") REFERENCES "MerchantApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantLedgerEntry" ADD CONSTRAINT "MerchantLedgerEntry_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantLedgerEntry" ADD CONSTRAINT "MerchantLedgerEntry_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantLedgerEntry" ADD CONSTRAINT "MerchantLedgerEntry_paymentRefundId_fkey" FOREIGN KEY ("paymentRefundId") REFERENCES "PaymentRefund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantLedgerEntry" ADD CONSTRAINT "MerchantLedgerEntry_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "MerchantSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlement" ADD CONSTRAINT "MerchantSettlement_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantBalanceSnapshot" ADD CONSTRAINT "MerchantBalanceSnapshot_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRequestNonce" ADD CONSTRAINT "MerchantRequestNonce_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRequestNonce" ADD CONSTRAINT "MerchantRequestNonce_apiCredentialId_fkey" FOREIGN KEY ("apiCredentialId") REFERENCES "MerchantApiCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantIdempotencyRecord" ADD CONSTRAINT "MerchantIdempotencyRecord_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantIdempotencyRecord" ADD CONSTRAINT "MerchantIdempotencyRecord_apiCredentialId_fkey" FOREIGN KEY ("apiCredentialId") REFERENCES "MerchantApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCallbackAttempt" ADD CONSTRAINT "PaymentCallbackAttempt_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
