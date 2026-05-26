import { createPrivateKey, type KeyObject } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RotationKeyPair } from "./rotation";
import { migrateStoredSecret, revealStoredSecret } from "../security/secret-box";

interface PersistedSigningMaterialRecord {
  keyId: string;
  publicKey: string;
  kmsKeyArn: string | null;
  privateKeyCiphertext: string | null;
  createdAt: string;
}

export interface LocalSigningMaterialRecord {
  keyId: string;
  publicKey: string;
  kmsKeyArn: string | null;
  privateKey: KeyObject | null;
  createdAt: Date;
}

const REGISTRY_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const SIGNING_MATERIAL_FILE = path.join(
  REGISTRY_PROJECT_ROOT,
  ".tmp",
  "registry-signing-materials.json",
);

function toPrivateKeyPem(privateKey: KeyObject) {
  return privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string;
}

function toPersisted(pair: RotationKeyPair): PersistedSigningMaterialRecord {
  return {
    keyId: pair.keyId,
    publicKey: pair.publicKey,
    kmsKeyArn: pair.kmsKeyArn,
    privateKeyCiphertext: pair.privateKey
      ? migrateStoredSecret(toPrivateKeyPem(pair.privateKey))
      : null,
    createdAt: new Date().toISOString(),
  };
}

function fromPersisted(record: PersistedSigningMaterialRecord): LocalSigningMaterialRecord {
  const privateKeyPem = revealStoredSecret(record.privateKeyCiphertext);
  return {
    keyId: record.keyId,
    publicKey: record.publicKey,
    kmsKeyArn: record.kmsKeyArn,
    privateKey: privateKeyPem ? createPrivateKey(privateKeyPem) : null,
    createdAt: new Date(record.createdAt),
  };
}

function loadRecords() {
  if (!existsSync(SIGNING_MATERIAL_FILE)) {
    return [] as PersistedSigningMaterialRecord[];
  }

  try {
    return JSON.parse(
      readFileSync(SIGNING_MATERIAL_FILE, "utf8"),
    ) as PersistedSigningMaterialRecord[];
  } catch {
    return [] as PersistedSigningMaterialRecord[];
  }
}

function saveRecords(records: PersistedSigningMaterialRecord[]) {
  mkdirSync(path.dirname(SIGNING_MATERIAL_FILE), { recursive: true });
  writeFileSync(SIGNING_MATERIAL_FILE, JSON.stringify(records, null, 2), "utf8");
}

export function persistLocalSigningKeyPair(pair: RotationKeyPair) {
  const records = loadRecords();
  const next = records.filter((item) => item.keyId !== pair.keyId);
  next.push(toPersisted(pair));
  saveRecords(next);
}

export function loadLocalSigningMaterialByKeyId(keyId: string) {
  const record = loadRecords().find((item) => item.keyId === keyId);
  return record ? fromPersisted(record) : null;
}
