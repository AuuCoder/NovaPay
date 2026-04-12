export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getOptionalUrl(value?: string | null) {
  if (!value) {
    return undefined;
  }

  return value.replace(/\/$/, "");
}

export function formatAmount(input: string | number) {
  const numeric = typeof input === "number" ? input : Number(input);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("amount must be a positive number.");
  }

  return numeric.toFixed(2);
}

export function formatTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function wrapPem(body: string, label: string) {
  const compact = body.replace(/\s+/g, "");
  const lines = compact.match(/.{1,64}/g) ?? [compact];

  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

export function normalizePem(multilineKey: string, type?: "private" | "public") {
  const normalized = multilineKey.replace(/\\n/g, "\n").trim();

  if (normalized.includes("-----BEGIN")) {
    return normalized;
  }

  if (!type || !/^[A-Za-z0-9+/=\s]+$/.test(normalized)) {
    return normalized;
  }

  return wrapPem(normalized, type === "private" ? "PRIVATE KEY" : "PUBLIC KEY");
}

export function buildSortedParamString(params: Record<string, string>) {
  return Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}
