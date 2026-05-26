import type { MarketplacePluginSource } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { revealStoredSecret } from "@/lib/secret-box";

export class RegistryTrustKeyMismatchError extends Error {
  readonly sourceId: string;
  readonly expectedKeyId: string | null;
  readonly actualKeyId: string | null;

  constructor(sourceId: string, expectedKeyId: string | null, actualKeyId: string | null) {
    super(
      `REGISTRY_TRUST_KEY_MISMATCH: configured trustPublicKeyKeyId=${expectedKeyId ?? "(none)"} ` +
      `does not match registry currentKey.keyId=${actualKeyId ?? "(none)"} for source ${sourceId}.`,
    );
    this.name = "RegistryTrustKeyMismatchError";
    this.sourceId = sourceId;
    this.expectedKeyId = expectedKeyId;
    this.actualKeyId = actualKeyId;
  }
}

export interface RemoteRegistryPluginRecord {
  remotePluginId: string;
  slug: string;
  kind: "PAYMENT_CHANNEL";
  source: MarketplacePluginSource;
  channelCode: string;
  providerKey: string;
  packageName: string;
  displayName: string;
  vendor: string;
  description: string;
  version: string;
  latestVersion: string;
  runtimeMode: "MANIFEST_ONLY" | "RUNNABLE";
  pricingMode: "FREE" | "PAID";
  pricingPlanKind?: string | null;
  priceAmountCents?: number | null;
  priceCurrency?: string | null;
  priceLabel?: string | null;
  purchaseUrl?: string | null;
  downloadUrl: string;
  checksum?: string | null;
  signature?: string | null;
  capabilities: string[];
  metadata?: Record<string, unknown>;
}

export interface RemoteRegistrySnapshot {
  sourceId: string;
  sourceName: string;
  sourceBaseUrl: string;
  plugins: RemoteRegistryPluginRecord[];
}

export interface PluginRegistrySyncRuntimeStatus {
  sourceId: string;
  sourceName: string | null;
  sourceBaseUrl: string | null;
  attemptedAt: Date;
  success: boolean;
  pluginCount: number | null;
  errorMessage: string | null;
}

const syncRuntimeStatusBySourceId = new Map<string, PluginRegistrySyncRuntimeStatus>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asOptionalInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function asStringArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((item, index) => asNonEmptyString(item, `${label}[${index}]`));
}

function parseRemotePluginRecord(
  raw: unknown,
  index: number,
): RemoteRegistryPluginRecord {
  if (!isRecord(raw)) {
    throw new Error(`plugins[${index}] must be an object.`);
  }

  const runtimeModeRaw = asNonEmptyString(raw.runtimeMode, `plugins[${index}].runtimeMode`);
  const runtimeMode =
    runtimeModeRaw === "MANIFEST_ONLY" || runtimeModeRaw === "RUNNABLE"
      ? runtimeModeRaw
      : (() => {
          throw new Error(
            `plugins[${index}].runtimeMode must be MANIFEST_ONLY or RUNNABLE.`,
          );
        })();

  const pricingModeRaw = asNonEmptyString(raw.pricingMode, `plugins[${index}].pricingMode`);
  const pricingMode =
    pricingModeRaw === "FREE" || pricingModeRaw === "PAID"
      ? pricingModeRaw
      : (() => {
          throw new Error(
            `plugins[${index}].pricingMode must be FREE or PAID.`,
          );
        })();

  return {
    remotePluginId: asNonEmptyString(raw.remotePluginId, `plugins[${index}].remotePluginId`),
    slug: asNonEmptyString(raw.slug, `plugins[${index}].slug`),
    kind: "PAYMENT_CHANNEL",
    source: "REMOTE_SIGNED",
    channelCode: asNonEmptyString(raw.channelCode, `plugins[${index}].channelCode`),
    providerKey: asNonEmptyString(raw.providerKey, `plugins[${index}].providerKey`),
    packageName: asNonEmptyString(raw.packageName, `plugins[${index}].packageName`),
    displayName: asNonEmptyString(raw.displayName, `plugins[${index}].displayName`),
    vendor: asNonEmptyString(raw.vendor, `plugins[${index}].vendor`),
    description: asNonEmptyString(raw.description, `plugins[${index}].description`),
    version: asNonEmptyString(raw.version, `plugins[${index}].version`),
    latestVersion: asNonEmptyString(raw.latestVersion, `plugins[${index}].latestVersion`),
    runtimeMode,
    pricingMode,
    pricingPlanKind: asOptionalString(raw.pricingPlanKind),
    priceAmountCents: asOptionalInteger(raw.priceAmountCents),
    priceCurrency: asOptionalString(raw.priceCurrency),
    priceLabel: asOptionalString(raw.priceLabel),
    purchaseUrl: asOptionalString(raw.purchaseUrl),
    downloadUrl: asNonEmptyString(raw.downloadUrl, `plugins[${index}].downloadUrl`),
    checksum: asOptionalString(raw.checksum),
    signature: asOptionalString(raw.signature),
    capabilities: asStringArray(raw.capabilities, `plugins[${index}].capabilities`),
    metadata: isRecord(raw.metadata) ? raw.metadata : undefined,
  };
}

function buildRegistryPluginsUrl(baseUrl: string) {
  return new URL("/api/registry/plugins", baseUrl).toString();
}

function recordRegistrySyncRuntimeStatus(
  status: PluginRegistrySyncRuntimeStatus,
) {
  syncRuntimeStatusBySourceId.set(status.sourceId, status);
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function getPluginRegistrySyncRuntimeStatuses() {
  return new Map(
    [...syncRuntimeStatusBySourceId.entries()].map(([sourceId, status]) => [
      sourceId,
      {
        ...status,
        attemptedAt: new Date(status.attemptedAt),
      },
    ]),
  );
}

export async function fetchRemoteRegistrySnapshot(sourceId: string) {
  const source = await getPrismaClient().pluginRegistrySource.findUnique({
    where: {
      id: sourceId,
    },
  });

  if (!source || !source.enabled) {
    return null;
  }

  const headers: Record<string, string> = {};

  if (source.appId) {
    headers["x-novapay-registry-app-id"] = source.appId;
  }

  const appKey = revealStoredSecret(source.appKeyCiphertext);

  if (appKey) {
    headers["x-novapay-registry-app-key"] = appKey;
  }

  const response = await fetch(buildRegistryPluginsUrl(source.baseUrl), {
    method: "GET",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Registry request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;

  if (!isRecord(payload) || !Array.isArray(payload.plugins)) {
    throw new Error("Registry response must contain a plugins array.");
  }

  // Req 10.4: When the source has a configured trustPublicKey, verify that
  // the registry's current signing key matches. This prevents silent MITM
  // or misconfiguration from going unnoticed during sync.
  if (source.trustPublicKey) {
    await verifyRegistryTrustKey(source);
  }

  const snapshot = {
    sourceId: source.id,
    sourceName: source.name,
    sourceBaseUrl: source.baseUrl,
    plugins: payload.plugins.map((item, index) => parseRemotePluginRecord(item, index)),
  } satisfies RemoteRegistrySnapshot;

  recordRegistrySyncRuntimeStatus({
    sourceId: source.id,
    sourceName: source.name,
    sourceBaseUrl: source.baseUrl,
    attemptedAt: new Date(),
    success: true,
    pluginCount: snapshot.plugins.length,
    errorMessage: null,
  });

  return snapshot;
}

export async function listPluginRegistrySources() {
  return getPrismaClient().pluginRegistrySource.findMany({
    orderBy: [{ createdAt: "asc" }],
  });
}

export async function fetchRemoteRegistrySnapshots(): Promise<RemoteRegistrySnapshot[]> {
  const sources = await listPluginRegistrySources();
  const enabledSources = sources.filter((source) => source.enabled);
  const snapshots = await Promise.allSettled(
    enabledSources.map((source) => fetchRemoteRegistrySnapshot(source.id)),
  );

  return snapshots.flatMap((snapshot, index) => {
    if (snapshot.status === "fulfilled") {
      return snapshot.value ? [snapshot.value] : [];
    }

    const source = enabledSources[index];
    if (source) {
      recordRegistrySyncRuntimeStatus({
        sourceId: source.id,
        sourceName: source.name,
        sourceBaseUrl: source.baseUrl,
        attemptedAt: new Date(),
        success: false,
        pluginCount: null,
        errorMessage: toErrorMessage(snapshot.reason),
      });
    }
    console.error("[plugin-registry] failed to sync source:", snapshot.reason);
    return [];
  });
}

interface TrustJsonResponse {
  currentKey?: {
    keyId?: string;
    publicKey?: string;
  } | null;
}

function buildTrustJsonUrl(baseUrl: string) {
  return new URL("/api/.well-known/trust.json", baseUrl).toString();
}

/**
 * Fetches `/.well-known/trust.json` from the registry and compares the
 * `currentKey.publicKey` against the locally configured `trustPublicKey`.
 * Throws `RegistryTrustKeyMismatchError` on mismatch (Req 10.4).
 *
 * This check is intentionally non-blocking for sources that have NOT
 * configured a trust key (Req 10.5: only rejects the current sync, does not
 * block other operations).
 */
async function verifyRegistryTrustKey(source: {
  id: string;
  baseUrl: string;
  trustPublicKey: string | null;
  trustPublicKeyKeyId?: string | null;
}) {
  if (!source.trustPublicKey) {
    return;
  }

  let trustJson: TrustJsonResponse;
  try {
    const response = await fetch(buildTrustJsonUrl(source.baseUrl), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(`trust.json request failed with status ${response.status}.`);
    }
    trustJson = (await response.json()) as TrustJsonResponse;
  } catch (error) {
    // If trust.json is unreachable, we cannot verify — fail closed.
    throw new RegistryTrustKeyMismatchError(
      source.id,
      source.trustPublicKeyKeyId ?? null,
      null,
    );
  }

  const remotePublicKey = trustJson.currentKey?.publicKey ?? null;
  const remoteKeyId = trustJson.currentKey?.keyId ?? null;

  if (remotePublicKey !== source.trustPublicKey) {
    throw new RegistryTrustKeyMismatchError(
      source.id,
      source.trustPublicKeyKeyId ?? null,
      remoteKeyId,
    );
  }
}
