export interface NovaPayAdminIdentity {
  id: string;
  email: string;
  name: string;
  role: string;
}

export function getNovaPayMainAppUrl() {
  return process.env.NOVAPAY_MAIN_APP_URL?.trim() || "http://localhost:3000";
}

export function buildNovaPayAdminSsoStartUrl() {
  return new URL("/api/internal/registry-sso/start", getNovaPayMainAppUrl()).toString();
}

export async function exchangeNovaPayAdminSsoToken(
  token: string,
): Promise<NovaPayAdminIdentity | null> {
  const response = await fetch(
    `${getNovaPayMainAppUrl()}/api/internal/registry-sso/admin-session?token=${encodeURIComponent(token)}`,
    {
      method: "GET",
      cache: "no-store",
    },
  ).catch(() => null);

  if (!response || !response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    authenticated?: boolean;
    adminUser?: NovaPayAdminIdentity;
  };

  if (!payload.authenticated || !payload.adminUser) {
    return null;
  }

  return payload.adminUser;
}
