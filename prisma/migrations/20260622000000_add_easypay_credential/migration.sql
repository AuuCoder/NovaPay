-- CreateTable
CREATE TABLE "EasyPayCredential" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "pid" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyCiphertext" TEXT NOT NULL,
    "keyPreview" TEXT NOT NULL,
    "typeMapping" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EasyPayCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EasyPayCredential_pid_key" ON "EasyPayCredential"("pid");

-- CreateIndex
CREATE INDEX "EasyPayCredential_merchantId_enabled_idx" ON "EasyPayCredential"("merchantId", "enabled");

-- CreateIndex
CREATE INDEX "EasyPayCredential_merchantId_createdAt_idx" ON "EasyPayCredential"("merchantId", "createdAt");

-- AddForeignKey
ALTER TABLE "EasyPayCredential" ADD CONSTRAINT "EasyPayCredential_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
