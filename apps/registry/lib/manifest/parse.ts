/**
 * Self-contained plugin.json manifest parser for the Registry side.
 *
 * Parity contract with NovaPay main repo's `lib/plugins/local-package-manifests.ts`
 * (`parsePluginPackageManifest`):
 *   - Required field set is identical: slug, kind, channelCode, providerKey,
 *     packageName, displayName, vendor, description, version, capabilities,
 *     category, summary, detail.
 *   - Whitelists are identical: ALLOWED_KINDS = {"PAYMENT_CHANNEL"},
 *     ALLOWED_PROVIDER_KEYS = {"alipay","wxpay","crypto"},
 *     ALLOWED_CAPABILITIES = same 10-entry set.
 *   - Bilingual fields (`category`, `summary`, `detail`) require non-empty `zh` + `en`.
 *   - `manifestVersion` defaults to 1 when missing or non-integer.
 *   - `supportsCallbackRoute` / `requiresMerchantProfileCompletion` default to false.
 *   - `runtimeEntrypoint` is optional.
 *   - Error messages use the same English phrases so logs stay grep-friendly across
 *     Registry and NovaPay.
 *
 * Allowed semantic difference (single, intentional):
 *   - The Registry side does NOT compute `runtimePath`. NovaPay resolves
 *     `runtimePath = path.resolve(path.dirname(manifestPath), runtimeEntrypoint)`
 *     against a local install directory; the Registry has no such on-disk concept,
 *     so the absolute path is irrelevant here. We only retain the raw
 *     `runtimeEntrypoint` string for round-trip preservation.
 *
 * No runtime imports from `@/lib/plugins/...` or any other NovaPay main-process
 * module. This file must be deployable as part of `apps/registry` standalone.
 */

export type PluginPackageSource = "REMOTE_SIGNED" | "LOCAL_PACKAGE";

export interface LocalizedText {
  zh: string;
  en: string;
}

export type ManifestProviderKey = "alipay" | "wxpay" | "crypto";

export type ManifestPaymentCapability =
  | "page_redirect"
  | "native_qr"
  | "notify_callback"
  | "return_url"
  | "quote_lock"
  | "rsa2_signature"
  | "order_query"
  | "order_close"
  | "refund"
  | "refund_query";

export interface PluginPackageManifest {
  slug: string;
  kind: "PAYMENT_CHANNEL";
  source: PluginPackageSource;
  channelCode: string;
  providerKey: ManifestProviderKey;
  packageName: string;
  displayName: string;
  vendor: string;
  description: string;
  version: string;
  capabilities: ManifestPaymentCapability[];
  category: LocalizedText;
  summary: LocalizedText;
  detail: LocalizedText;
  supportsCallbackRoute: boolean;
  requiresMerchantProfileCompletion: boolean;
  manifestVersion: number;
  runtimeEntrypoint: string | null;
  /**
   * Original plugin.json text (preserved verbatim, NOT used in equality checks).
   * The pretty-printer can read this when round-tripping; it is never re-emitted
   * as a top-level field of the rendered JSON. Round-trip parsers may also
   * surface this through `metadata.__rawManifest__` for audit traceability
   * (Req 24.3).
   */
  rawJson?: string;
}

const ALLOWED_KINDS: ReadonlySet<string> = new Set(["PAYMENT_CHANNEL"]);
const ALLOWED_PROVIDER_KEYS: ReadonlySet<string> = new Set([
  "alipay",
  "wxpay",
  "crypto",
]);
const ALLOWED_CAPABILITIES: ReadonlySet<ManifestPaymentCapability> = new Set<
  ManifestPaymentCapability
>([
  "page_redirect",
  "native_qr",
  "notify_callback",
  "return_url",
  "quote_lock",
  "rsa2_signature",
  "order_query",
  "order_close",
  "refund",
  "refund_query",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asLocalizedText(value: unknown, label: string): LocalizedText {
  if (!isRecord(value)) {
    throw new Error(`${label} must contain zh and en fields.`);
  }

  return {
    zh: asNonEmptyString(value.zh, `${label}.zh`),
    en: asNonEmptyString(value.en, `${label}.en`),
  };
}

function asCapabilities(value: unknown): ManifestPaymentCapability[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("capabilities must be a non-empty array.");
  }

  const capabilities = value.map((item) =>
    asNonEmptyString(item, "capability"),
  ) as ManifestPaymentCapability[];

  for (const capability of capabilities) {
    if (!ALLOWED_CAPABILITIES.has(capability)) {
      throw new Error(`Unsupported capability: ${capability}`);
    }
  }

  return capabilities;
}

export interface ParsePluginPackageManifestOptions {
  /**
   * Origin of the package. Defaults to `REMOTE_SIGNED` because Registry-issued
   * bundles are always remote and signed; NovaPay-side local-only callers can
   * pass `LOCAL_PACKAGE` explicitly for symmetry.
   */
  source?: PluginPackageSource;
  /**
   * Original plugin.json text. When provided, it is stored verbatim on the
   * returned manifest so the pretty-printer can write it back to
   * `metadata.__rawManifest__` for audit replay.
   */
  rawJson?: string;
}

export function parsePluginPackageManifest(
  raw: unknown,
  options: ParsePluginPackageManifestOptions = {},
): PluginPackageManifest {
  if (!isRecord(raw)) {
    throw new Error("Manifest root must be an object.");
  }

  const kind = asNonEmptyString(raw.kind, "kind");

  if (!ALLOWED_KINDS.has(kind)) {
    throw new Error(`Unsupported kind: ${kind}`);
  }

  const providerKey = asNonEmptyString(raw.providerKey, "providerKey");

  if (!ALLOWED_PROVIDER_KEYS.has(providerKey)) {
    throw new Error(`Unsupported providerKey: ${providerKey}`);
  }

  const manifestVersion =
    typeof raw.manifestVersion === "number" &&
    Number.isInteger(raw.manifestVersion)
      ? raw.manifestVersion
      : 1;

  const runtimeEntrypoint = asOptionalString(raw.runtimeEntrypoint);
  const source: PluginPackageSource = options.source ?? "REMOTE_SIGNED";

  const manifest: PluginPackageManifest = {
    slug: asNonEmptyString(raw.slug, "slug"),
    kind: "PAYMENT_CHANNEL",
    source,
    channelCode: asNonEmptyString(raw.channelCode, "channelCode"),
    providerKey: providerKey as ManifestProviderKey,
    packageName: asNonEmptyString(raw.packageName, "packageName"),
    displayName: asNonEmptyString(raw.displayName, "displayName"),
    vendor: asNonEmptyString(raw.vendor, "vendor"),
    description: asNonEmptyString(raw.description, "description"),
    version: asNonEmptyString(raw.version, "version"),
    capabilities: asCapabilities(raw.capabilities),
    category: asLocalizedText(raw.category, "category"),
    summary: asLocalizedText(raw.summary, "summary"),
    detail: asLocalizedText(raw.detail, "detail"),
    supportsCallbackRoute: asBoolean(raw.supportsCallbackRoute, false),
    requiresMerchantProfileCompletion: asBoolean(
      raw.requiresMerchantProfileCompletion,
      false,
    ),
    manifestVersion,
    runtimeEntrypoint,
  };

  if (typeof options.rawJson === "string") {
    manifest.rawJson = options.rawJson;
  }

  return manifest;
}
