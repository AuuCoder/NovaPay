/**
 * Object storage abstraction for the Registry.
 *
 * Phase 1 ships an in-memory stub driver suitable for local dev and unit
 * tests. A real S3-compatible driver (MinIO / AWS S3 / Cloudflare R2) will be
 * added in a follow-up task once the AWS SDK becomes a project dependency.
 *
 * Design choices:
 *   - Object keys are content-addressed by sha256 (`packages/<sha256>.tar.gz`)
 *     so identical bundles deduplicate naturally and become immutable
 *     (Req 6.5, 6.6).
 *   - `presignDownload` returns a signed URL valid for at most 5 minutes by
 *     default (Req 17.4).
 *   - `put` is idempotent: re-uploading the same key with the same sha256
 *     yields `alreadyExisted: true`; mismatching sha256 throws to surface
 *     content drift loudly.
 */

export interface ObjectStorePutInput {
  /** Object key, e.g. `packages/<sha256>.tar.gz`. Must not start with `/`. */
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  /** Length of `body`. Used to validate caller-side accounting. */
  contentLength: number;
  /** Hex-encoded sha256 of `body` (no `sha256:` prefix). */
  sha256: string;
}

export interface ObjectStorePutResult {
  key: string;
  alreadyExisted: boolean;
  storedSizeBytes: number;
}

export interface ObjectStorePresignDownloadInput {
  key: string;
  /** Expiry seconds for the presigned URL. Defaults to 300 (5 minutes). */
  expiresInSeconds?: number;
}

export interface ObjectStorePresignDownloadResult {
  url: string;
  expiresAt: Date;
  key: string;
}

export interface ObjectStoreClient {
  put(input: ObjectStorePutInput): Promise<ObjectStorePutResult>;
  exists(key: string): Promise<boolean>;
  presignDownload(
    input: ObjectStorePresignDownloadInput,
  ): Promise<ObjectStorePresignDownloadResult>;
}

export interface ObjectStoreConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Public download base URL exposed to NovaPay consumers. When set, presigned
   * URLs are rooted here instead of the internal endpoint.
   */
  publicBaseUrl?: string;
  /** Default download expiry. Defaults to 300 seconds (Req 17.4). */
  defaultDownloadExpiresInSeconds?: number;
}

export const DEFAULT_DOWNLOAD_PRESIGN_EXPIRES_IN_SECONDS = 300;

const PACKAGE_KEY_PREFIX = "packages/";

function sanitizeKey(key: string): void {
  if (typeof key !== "string" || !key) {
    throw new Error("Object store key must be a non-empty string.");
  }
  if (key.startsWith("/")) {
    throw new Error('Object store key must not start with "/".');
  }
  if (key.includes("..")) {
    throw new Error("Object store key must not contain path traversal segments.");
  }
}

function toBuffer(body: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(body)
    ? body
    : Buffer.from(body.buffer, body.byteOffset, body.byteLength);
}

/** Builds the canonical key `packages/<sha256>.<extension>`. */
export function buildPackageObjectKey(
  sha256: string,
  extension: "tar.gz" | "zip",
): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("sha256 must be a 64-char lowercase hex string.");
  }
  return `${PACKAGE_KEY_PREFIX}${sha256}.${extension}`;
}

interface InMemoryObject {
  body: Buffer;
  contentType: string;
  sha256: string;
  storedSizeBytes: number;
  createdAt: Date;
}

interface InMemoryStoreOptions {
  publicBaseUrl?: string;
  defaultDownloadExpiresInSeconds?: number;
}

export function createInMemoryObjectStore(
  options: InMemoryStoreOptions = {},
): ObjectStoreClient {
  const objects = new Map<string, InMemoryObject>();
  const baseUrl = options.publicBaseUrl ?? "http://memory-object-store.local";
  const defaultExpiry =
    options.defaultDownloadExpiresInSeconds ??
    DEFAULT_DOWNLOAD_PRESIGN_EXPIRES_IN_SECONDS;

  return {
    async put(input: ObjectStorePutInput): Promise<ObjectStorePutResult> {
      sanitizeKey(input.key);
      const body = toBuffer(input.body);

      if (body.length !== input.contentLength) {
        throw new Error(
          `Object store contentLength mismatch: declared ${input.contentLength}, actual ${body.length}.`,
        );
      }

      const existing = objects.get(input.key);
      if (existing) {
        if (existing.sha256 !== input.sha256) {
          throw new Error(
            `Object store conflict: key already exists with different content (${input.key}).`,
          );
        }
        return {
          key: input.key,
          alreadyExisted: true,
          storedSizeBytes: existing.storedSizeBytes,
        };
      }

      objects.set(input.key, {
        body,
        contentType: input.contentType,
        sha256: input.sha256,
        storedSizeBytes: body.length,
        createdAt: new Date(),
      });

      return {
        key: input.key,
        alreadyExisted: false,
        storedSizeBytes: body.length,
      };
    },

    async exists(key: string): Promise<boolean> {
      sanitizeKey(key);
      return objects.has(key);
    },

    async presignDownload(
      input: ObjectStorePresignDownloadInput,
    ): Promise<ObjectStorePresignDownloadResult> {
      sanitizeKey(input.key);
      const expiresInSeconds = input.expiresInSeconds ?? defaultExpiry;
      if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
        throw new Error("expiresInSeconds must be a positive finite number.");
      }
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
      const expiresUnix = Math.floor(expiresAt.getTime() / 1000);
      const url = `${baseUrl.replace(/\/$/, "")}/${input.key}?expires=${expiresUnix}`;
      return {
        url,
        expiresAt,
        key: input.key,
      };
    },
  };
}

/**
 * Placeholder for a real S3-compatible driver. Activated when the AWS SDK
 * dependency is added in a future task. Until then, callers must opt into the
 * in-memory driver via `OBJECT_STORE_DRIVER=memory`.
 */
export function createS3CompatibleObjectStoreClient(
  _config: ObjectStoreConfig,
): ObjectStoreClient {
  throw new Error(
    "S3-compatible object store driver will be provided after task 1.4 once @aws-sdk/client-s3 (or equivalent) is installed.",
  );
}

export function createObjectStoreClient(
  config: ObjectStoreConfig,
): ObjectStoreClient {
  if (process.env.OBJECT_STORE_DRIVER === "memory") {
    return createInMemoryObjectStore({
      publicBaseUrl: config.publicBaseUrl,
      defaultDownloadExpiresInSeconds: config.defaultDownloadExpiresInSeconds,
    });
  }
  return createS3CompatibleObjectStoreClient(config);
}
