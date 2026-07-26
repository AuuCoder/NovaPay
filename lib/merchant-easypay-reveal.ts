import { cookies } from "next/headers";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

const EASYPAY_REVEAL_COOKIE = "novapay_merchant_easypay_reveal";
const EASYPAY_REVEAL_MAX_AGE_SECONDS = 60 * 10;

interface EasyPayCredentialRevealPayload {
  credentialId: string;
  pid: string;
  key: string;
  label: string;
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

export async function stashEasyPayCredentialReveal(payload: EasyPayCredentialRevealPayload) {
  const cookieStore = await cookies();
  cookieStore.set(
    EASYPAY_REVEAL_COOKIE,
    encryptSecret(JSON.stringify(payload)),
    getCookieOptions(EASYPAY_REVEAL_MAX_AGE_SECONDS),
  );
}

export async function readEasyPayCredentialReveal() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(EASYPAY_REVEAL_COOKIE)?.value;

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(decryptSecret(raw)) as Partial<EasyPayCredentialRevealPayload>;

    if (
      typeof parsed.credentialId !== "string" ||
      typeof parsed.pid !== "string" ||
      typeof parsed.key !== "string" ||
      typeof parsed.label !== "string"
    ) {
      return null;
    }

    return parsed as EasyPayCredentialRevealPayload;
  } catch {
    return null;
  }
}

export async function clearEasyPayCredentialReveal() {
  const cookieStore = await cookies();
  cookieStore.set(EASYPAY_REVEAL_COOKIE, "", getCookieOptions(0));
}
