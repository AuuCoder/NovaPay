-- CreateEnum
CREATE TYPE "OrderState" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LicenseState" AS ENUM ('ISSUED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PricingPlanKind" AS ENUM ('FREE', 'PER_INSTANCE_ONE_TIME', 'PER_MERCHANT_SUBSCRIPTION', 'PER_USAGE');

-- CreateEnum
CREATE TYPE "PayoutState" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutAccountStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DeveloperAccountStatus" AS ENUM ('EMAIL_UNVERIFIED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PluginPricingMode" AS ENUM ('FREE', 'PAID');

-- CreateEnum
CREATE TYPE "ReviewState" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'DEPRECATED', 'TAKEN_DOWN');

-- CreateEnum
CREATE TYPE "SigningKeyStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateTable
CREATE TABLE "Developer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "contact" JSONB NOT NULL,
    "status" "DeveloperAccountStatus" NOT NULL DEFAULT 'EMAIL_UNVERIFIED',
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "novapayInstanceId" TEXT,
    "novapayMerchantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Developer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "token" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "RegistrySession" (
    "id" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "developerId" TEXT,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperToken" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPreview" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeveloperToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginOwnership" (
    "slug" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginOwnership_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "SigningKeyMaterial" (
    "keyId" TEXT NOT NULL,
    "privateKeySealed" TEXT,
    "publicKey" TEXT NOT NULL,
    "kmsKeyArn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigningKeyMaterial_pkey" PRIMARY KEY ("keyId")
);

-- CreateTable
CREATE TABLE "PluginRecord" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "remotePluginId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channelCode" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pricingMode" "PluginPricingMode" NOT NULL,
    "pricingPlanKind" "PricingPlanKind",
    "priceAmountCents" INTEGER,
    "priceCurrency" TEXT,
    "priceLabel" TEXT,
    "publishedVersion" TEXT,
    "latestVersion" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "takenDown" BOOLEAN NOT NULL DEFAULT false,
    "takenDownReason" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginVersion" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "manifestJson" JSONB NOT NULL,
    "manifestRaw" TEXT NOT NULL,
    "reviewState" "ReviewState" NOT NULL DEFAULT 'DRAFT',
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "rejectReason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "capabilities" JSONB NOT NULL,
    "pricingMode" "PluginPricingMode" NOT NULL DEFAULT 'FREE',
    "pricingPlanKind" "PricingPlanKind",
    "priceAmountCents" INTEGER,
    "priceCurrency" TEXT,
    "priceLabel" TEXT,
    "purchaseUrl" TEXT,
    "scanResult" JSONB,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginVersionTestSession" (
    "id" TEXT NOT NULL,
    "pluginVersionId" TEXT NOT NULL,
    "pluginSlug" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "verificationProfile" JSONB NOT NULL,
    "submittedConfig" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "resultSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginVersionTestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginVersionTestStep" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "resultSnapshot" JSONB,

    CONSTRAINT "PluginVersionTestStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginAsset" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "signatureKeyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningKey" (
    "keyId" TEXT NOT NULL,
    "alg" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "kmsKeyArn" TEXT,
    "status" "SigningKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "notBefore" TIMESTAMP(3) NOT NULL,
    "notAfter" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigningKey_pkey" PRIMARY KEY ("keyId")
);

-- CreateTable
CREATE TABLE "ReviewWorkflow" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "claimedById" TEXT,
    "decision" TEXT,
    "decisionNote" TEXT,
    "findings" JSONB NOT NULL,
    "appealNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetKind" TEXT,
    "targetId" TEXT,
    "payload" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistryConsumer" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "appKeyHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 600,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryConsumer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrySetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrySetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RegistryLedgerEntry" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "reason" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistryLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAccount" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "accountNumber" TEXT,
    "routingNumber" TEXT,
    "bankName" TEXT,
    "paypalEmail" TEXT,
    "status" "PayoutAccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "id" TEXT NOT NULL,
    "payoutAccountId" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "state" "PayoutState" NOT NULL DEFAULT 'PENDING_REVIEW',
    "adminNote" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "pluginSlug" TEXT NOT NULL,
    "pluginRecordId" TEXT,
    "developerId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "buyerInstanceId" TEXT,
    "buyerMerchantId" TEXT,
    "pricingPlanKind" "PricingPlanKind" NOT NULL,
    "priceAmountCents" INTEGER NOT NULL,
    "priceCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "state" "OrderState" NOT NULL DEFAULT 'PENDING',
    "novapayOrderId" TEXT,
    "checkoutUrl" TEXT,
    "licenseId" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT,
    "licenseKeyHash" TEXT NOT NULL,
    "orderId" TEXT,
    "pluginId" TEXT NOT NULL,
    "pluginSlug" TEXT NOT NULL,
    "pluginRecordId" TEXT,
    "developerId" TEXT,
    "version" TEXT NOT NULL,
    "pricingPlanKind" "PricingPlanKind" NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "state" "LicenseState" NOT NULL DEFAULT 'ISSUED',
    "jwsCompact" TEXT NOT NULL,
    "instanceId" TEXT,
    "merchantId" TEXT,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseRevocation" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "revokedById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "LicenseRevocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginPricingHistory" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "pricingMode" "PluginPricingMode" NOT NULL,
    "pricingPlanKind" "PricingPlanKind",
    "priceAmountCents" INTEGER,
    "priceCurrency" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beforeState" JSONB,
    "afterState" JSONB,

    CONSTRAINT "PluginPricingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Developer_email_key" ON "Developer"("email");

-- CreateIndex
CREATE INDEX "Developer_status_createdAt_idx" ON "Developer"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_developerId_idx" ON "EmailVerificationToken"("developerId");

-- CreateIndex
CREATE INDEX "RegistrySession_expiresAt_idx" ON "RegistrySession"("expiresAt");

-- CreateIndex
CREATE INDEX "RegistrySession_actorId_expiresAt_idx" ON "RegistrySession"("actorId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperToken_tokenHash_key" ON "DeveloperToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DeveloperToken_developerId_status_idx" ON "DeveloperToken"("developerId", "status");

-- CreateIndex
CREATE INDEX "PluginOwnership_developerId_idx" ON "PluginOwnership"("developerId");

-- CreateIndex
CREATE INDEX "SigningKeyMaterial_createdAt_idx" ON "SigningKeyMaterial"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PluginRecord_slug_key" ON "PluginRecord"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PluginRecord_remotePluginId_key" ON "PluginRecord"("remotePluginId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginRecord_channelCode_key" ON "PluginRecord"("channelCode");

-- CreateIndex
CREATE INDEX "PluginRecord_developerId_createdAt_idx" ON "PluginRecord"("developerId", "createdAt");

-- CreateIndex
CREATE INDEX "PluginRecord_visible_takenDown_featured_idx" ON "PluginRecord"("visible", "takenDown", "featured");

-- CreateIndex
CREATE INDEX "PluginRecord_pricingMode_pricingPlanKind_idx" ON "PluginRecord"("pricingMode", "pricingPlanKind");

-- CreateIndex
CREATE UNIQUE INDEX "PluginVersion_assetId_key" ON "PluginVersion"("assetId");

-- CreateIndex
CREATE INDEX "PluginVersion_reviewState_createdAt_idx" ON "PluginVersion"("reviewState", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PluginVersion_pluginId_version_key" ON "PluginVersion"("pluginId", "version");

-- CreateIndex
CREATE INDEX "PluginVersionTestSession_pluginSlug_version_status_idx" ON "PluginVersionTestSession"("pluginSlug", "version", "status");

-- CreateIndex
CREATE INDEX "PluginVersionTestSession_status_expiresAt_idx" ON "PluginVersionTestSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "PluginVersionTestStep_sessionId_idx" ON "PluginVersionTestStep"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginAsset_sha256_key" ON "PluginAsset"("sha256");

-- CreateIndex
CREATE INDEX "SigningKey_status_notAfter_idx" ON "SigningKey"("status", "notAfter");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewWorkflow_versionId_key" ON "ReviewWorkflow"("versionId");

-- CreateIndex
CREATE INDEX "ReviewWorkflow_claimedById_updatedAt_idx" ON "ReviewWorkflow"("claimedById", "updatedAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorType_actorId_createdAt_idx" ON "AuditLog"("actorType", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetKind_targetId_createdAt_idx" ON "AuditLog"("targetKind", "targetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegistryConsumer_instanceId_key" ON "RegistryConsumer"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistryConsumer_appId_key" ON "RegistryConsumer"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistryLedgerEntry_externalRef_key" ON "RegistryLedgerEntry"("externalRef");

-- CreateIndex
CREATE INDEX "RegistryLedgerEntry_developerId_occurredAt_idx" ON "RegistryLedgerEntry"("developerId", "occurredAt");

-- CreateIndex
CREATE INDEX "RegistryLedgerEntry_developerId_currency_occurredAt_idx" ON "RegistryLedgerEntry"("developerId", "currency", "occurredAt");

-- CreateIndex
CREATE INDEX "PayoutAccount_developerId_status_idx" ON "PayoutAccount"("developerId", "status");

-- CreateIndex
CREATE INDEX "PayoutRequest_developerId_state_idx" ON "PayoutRequest"("developerId", "state");

-- CreateIndex
CREATE INDEX "PayoutRequest_state_createdAt_idx" ON "PayoutRequest"("state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_pluginRecordId_state_idx" ON "Order"("pluginRecordId", "state");

-- CreateIndex
CREATE INDEX "Order_pluginSlug_state_idx" ON "Order"("pluginSlug", "state");

-- CreateIndex
CREATE INDEX "Order_developerId_state_idx" ON "Order"("developerId", "state");

-- CreateIndex
CREATE INDEX "Order_buyerInstanceId_state_idx" ON "Order"("buyerInstanceId", "state");

-- CreateIndex
CREATE INDEX "Order_buyerMerchantId_state_idx" ON "Order"("buyerMerchantId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseKey_key" ON "License"("licenseKey");

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseKeyHash_key" ON "License"("licenseKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "License_orderId_key" ON "License"("orderId");

-- CreateIndex
CREATE INDEX "License_pluginRecordId_state_idx" ON "License"("pluginRecordId", "state");

-- CreateIndex
CREATE INDEX "License_pluginSlug_state_idx" ON "License"("pluginSlug", "state");

-- CreateIndex
CREATE INDEX "License_developerId_state_idx" ON "License"("developerId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseRevocation_licenseId_key" ON "LicenseRevocation"("licenseId");

-- CreateIndex
CREATE INDEX "LicenseRevocation_revokedById_revokedAt_idx" ON "LicenseRevocation"("revokedById", "revokedAt");

-- CreateIndex
CREATE INDEX "PluginPricingHistory_pluginId_changedAt_idx" ON "PluginPricingHistory"("pluginId", "changedAt");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrySession" ADD CONSTRAINT "RegistrySession_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperToken" ADD CONSTRAINT "DeveloperToken_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginOwnership" ADD CONSTRAINT "PluginOwnership_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginRecord" ADD CONSTRAINT "PluginRecord_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginVersion" ADD CONSTRAINT "PluginVersion_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "PluginRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginVersion" ADD CONSTRAINT "PluginVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "PluginAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginVersionTestSession" ADD CONSTRAINT "PluginVersionTestSession_pluginVersionId_fkey" FOREIGN KEY ("pluginVersionId") REFERENCES "PluginVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginVersionTestStep" ADD CONSTRAINT "PluginVersionTestStep_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PluginVersionTestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginAsset" ADD CONSTRAINT "PluginAsset_signatureKeyId_fkey" FOREIGN KEY ("signatureKeyId") REFERENCES "SigningKey"("keyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewWorkflow" ADD CONSTRAINT "ReviewWorkflow_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "PluginRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewWorkflow" ADD CONSTRAINT "ReviewWorkflow_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PluginVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "audit_log_actor_developer_fkey" FOREIGN KEY ("actorId") REFERENCES "Developer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryLedgerEntry" ADD CONSTRAINT "RegistryLedgerEntry_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "PayoutAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pluginRecordId_fkey" FOREIGN KEY ("pluginRecordId") REFERENCES "PluginRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_pluginRecordId_fkey" FOREIGN KEY ("pluginRecordId") REFERENCES "PluginRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseRevocation" ADD CONSTRAINT "LicenseRevocation_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginPricingHistory" ADD CONSTRAINT "PluginPricingHistory_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "PluginRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
