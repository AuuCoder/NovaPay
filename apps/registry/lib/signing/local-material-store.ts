/**
 * Persistence for local Ed25519 signing key material.
 *
 * Private key bytes are sealed via secret-box (AES-GCM) before storing.
 * Production keeps the keys in `SigningKeyMaterial`; the schema mirrors
 * `SigningKey` so retrieving an active key always co-locates the public
 * record with its private material.
 */

import { createPrivateKey, type KeyObject } from "node:crypto";
import type { RotationKeyPair } from "./rotation";
import { migrateStoredSecret, revealStoredSecret } from "../security/secret-box";
import { getPrismaClient } from "../runtime/prisma-client";

export interface LocalSigningMaterialRecord {
  keyId: string;
  publicKey: string;
  kmsKeyArn: string | null;
  privateKey: KeyObject | null;
  createdAt: Date;
}

interface SigningKeyMaterialRow {
  keyId: string;
  publicKey: string;
  kmsKeyArn: string | null;
  privateKeySealed: string | null;
  createdAt: Date;
}

interface PrismaSigningMaterialLike {
  signingKeyMaterial: {
    upsert(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
  };
}

function toPrivateKeyPem(privateKey: KeyObject) {
  return privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string;
}

async function getPrismaMaterial(): Promise<PrismaSigningMaterialLike | null> {
  const prisma = (await getPrismaClient()) as unknown as PrismaSigningMaterialLike | null;
  if (!prisma || !prisma.signingKeyMaterial) return null;
  return prisma;
}

export async function persistLocalSigningKeyPair(pair: RotationKeyPair) {
  const prisma = await getPrismaMaterial();
  if (!prisma) {
    throw new Error("Registry database is not available; cannot persist signing key material.");
  }

  const sealedPrivateKey = pair.privateKey
    ? migrateStoredSecret(toPrivateKeyPem(pair.privateKey))
    : null;

  await prisma.signingKeyMaterial.upsert({
    where: { keyId: pair.keyId },
    create: {
      keyId: pair.keyId,
      publicKey: pair.publicKey,
      kmsKeyArn: pair.kmsKeyArn,
      privateKeySealed: sealedPrivateKey,
    },
    update: {
      publicKey: pair.publicKey,
      kmsKeyArn: pair.kmsKeyArn,
      privateKeySealed: sealedPrivateKey,
    },
  });
}

export async function loadLocalSigningMaterialByKeyId(
  keyId: string,
): Promise<LocalSigningMaterialRecord | null> {
  const prisma = await getPrismaMaterial();
  if (!prisma) return null;

  const row = (await prisma.signingKeyMaterial.findUnique({
    where: { keyId },
  })) as SigningKeyMaterialRow | null;

  if (!row) return null;

  const privateKeyPem = revealStoredSecret(row.privateKeySealed);
  return {
    keyId: row.keyId,
    publicKey: row.publicKey,
    kmsKeyArn: row.kmsKeyArn,
    privateKey: privateKeyPem ? createPrivateKey(privateKeyPem) : null,
    createdAt: row.createdAt,
  };
}
