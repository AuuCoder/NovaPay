-- AlterTable: add Registry trust / license public-key columns to
-- PluginRegistrySource so NovaPay instances can verify Ed25519 bundle
-- signatures and license JWS issued by the remote plugin marketplace.
-- All columns are nullable so existing rows remain valid without backfill.
ALTER TABLE "PluginRegistrySource"
  ADD COLUMN "trustPublicKey" TEXT,
  ADD COLUMN "trustPublicKeyKeyId" TEXT,
  ADD COLUMN "trustPublicKeyExpiresAt" TIMESTAMP(3),
  ADD COLUMN "licensePublicKey" TEXT;
