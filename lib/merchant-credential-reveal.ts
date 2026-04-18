import { cookies } from "next/headers";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

const MERCHANT_CREDENTIAL_REVEAL_COOKIE = "novapay_merchant_credential_reveal";
const MERCHANT_CREDENTIAL_REVEAL_MAX_AGE_SECONDS = 60 * 10;

interface MerchantCredentialRevealPayload {
  credentialId?: string;
  keyId: string;
  secret: string;
  label: string;
  source: "bootstrap" | "manual" | "reauth";
}

function getCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/merchant",
    maxAge,
  };
}

export async function stashMerchantCredentialReveal(payload: MerchantCredentialRevealPayload) {
  const cookieStore = await cookies();
  cookieStore.set(
    MERCHANT_CREDENTIAL_REVEAL_COOKIE,
    encryptSecret(JSON.stringify(payload)),
    getCookieOptions(MERCHANT_CREDENTIAL_REVEAL_MAX_AGE_SECONDS),
  );
}

export async function readMerchantCredentialReveal() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(MERCHANT_CREDENTIAL_REVEAL_COOKIE)?.value;

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(decryptSecret(raw)) as Partial<MerchantCredentialRevealPayload>;

    if (
      typeof parsed.keyId !== "string" ||
      typeof parsed.secret !== "string" ||
      typeof parsed.label !== "string" ||
      (parsed.source !== "bootstrap" &&
        parsed.source !== "manual" &&
        parsed.source !== "reauth")
    ) {
      return null;
    }

    return parsed as MerchantCredentialRevealPayload;
  } catch {
    return null;
  }
}

export async function clearMerchantCredentialReveal() {
  const cookieStore = await cookies();
  cookieStore.set(MERCHANT_CREDENTIAL_REVEAL_COOKIE, "", getCookieOptions(0));
}
