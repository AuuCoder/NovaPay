import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secret-box";

export function generateMerchantApiCredential() {
  const keyId = `npk_${randomBytes(12).toString("base64url")}`;
  const secret = `nps_${randomBytes(24).toString("base64url")}`;

  return {
    keyId,
    secret,
    secretPreview: maskSecret(secret) ?? "********",
    secretCiphertext: encryptSecret(secret),
  };
}

export function revealMerchantCredentialSecret(secretCiphertext: string) {
  return decryptSecret(secretCiphertext);
}
