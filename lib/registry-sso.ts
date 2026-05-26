import { createHmac, timingSafeEqual } from "node:crypto";

export interface RegistrySsoAdminIdentity {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface RegistrySsoTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  iat: number;
  exp: number;
}

const DEFAULT_SSO_TTL_SECONDS = 90;

function getRegistrySsoSecret() {
  return process.env.REGISTRY_SSO_SECRET?.trim() || "novapay-registry-dev-sso-secret";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getRegistrySsoSecret()).update(value).digest("base64url");
}

export function issueRegistrySsoToken(
  identity: RegistrySsoAdminIdentity,
  ttlSeconds = DEFAULT_SSO_TTL_SECONDS,
) {
  const now = Math.floor(Date.now() / 1000);
  const payload: RegistrySsoTokenPayload = {
    sub: identity.id,
    email: identity.email.trim().toLowerCase(),
    name: identity.name,
    role: identity.role,
    iat: now,
    exp: now + ttlSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyRegistrySsoToken(token: string): RegistrySsoAdminIdentity | null {
  const [encodedPayload, providedSignature] = token.split(".");

  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(providedSignature);

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as RegistrySsoTokenPayload;
    const now = Math.floor(Date.now() / 1000);

    if (!payload.sub || !payload.email || !payload.name || !payload.role) {
      return null;
    }

    if (!Number.isFinite(payload.exp) || payload.exp < now) {
      return null;
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}
