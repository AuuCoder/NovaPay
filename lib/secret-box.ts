import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getDataEncryptionKey } from "@/lib/env";

const STORED_SECRET_PREFIX = "sealed:";

function getEncryptionKey() {
  return createHash("sha256").update(getDataEncryptionKey()).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(".");

  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Secret payload format is invalid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function isStoredSecretSealed(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(STORED_SECRET_PREFIX);
}

export function sealStoredSecret(value: string) {
  return `${STORED_SECRET_PREFIX}${encryptSecret(value)}`;
}

export function revealStoredSecret(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (!isStoredSecretSealed(value)) {
    return value;
  }

  return decryptSecret(value.slice(STORED_SECRET_PREFIX.length));
}

export function migrateStoredSecret(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return isStoredSecretSealed(value) ? value : sealStoredSecret(value);
}

export function maskSecret(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return "********";
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export function maskStoredSecret(value: string | null | undefined) {
  return maskSecret(revealStoredSecret(value));
}
