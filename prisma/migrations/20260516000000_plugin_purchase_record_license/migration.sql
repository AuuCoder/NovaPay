-- AlterTable: add license tracking columns to PluginPurchaseRecord so the
-- NovaPay license-client can persist verified license metadata returned by
-- POST /licenses/verify, replacing the manual purchasedAt-only flow.
-- All columns are nullable for backward compatibility.
ALTER TABLE "PluginPurchaseRecord"
  ADD COLUMN "licenseKeyHash" TEXT,
  ADD COLUMN "licenseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PluginPurchaseRecord_licenseKeyHash_idx"
  ON "PluginPurchaseRecord"("licenseKeyHash");
