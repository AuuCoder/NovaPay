/**
 * Object storage abstraction for the Registry.
 *
 * Production uses an S3-compatible driver (works against AWS S3,
 * Cloudflare R2, MinIO, Aliyun OSS, etc). The in-memory driver is reserved
 * for unit tests.
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
  get?(key: string): Promise<{ body: Buffer; contentType: string; contentLength: number } | null>;
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
    async get(key: string) {
      sanitizeKey(key);
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: Buffer.from(object.body),
        contentType: object.contentType,
        contentLength: object.storedSizeBytes,
      };
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
 * S3-compatible driver. Tested against AWS S3, MinIO, Cloudflare R2 and
 * Aliyun OSS. The endpoint URL controls which target the driver speaks to:
 *
 * - AWS S3:           leave `endpoint` undefined (or set to your region URL)
 * - MinIO local:      `endpoint=http://minio:9000`, `forcePathStyle=true`
 * - Cloudflare R2:    `endpoint=https://<account>.r2.cloudflarestorage.com`
 * - Aliyun OSS:       `endpoint=https://oss-cn-hangzhou.aliyuncs.com`
 *
 * The presigned download URL hostname can be overridden via
 * `publicBaseUrl` so consumers download from a public CDN domain instead of
 * the internal endpoint. The path of the underlying URL is preserved.
 */
export function createS3CompatibleObjectStoreClient(
  config: ObjectStoreConfig,
): ObjectStoreClient {
  // Lazy-load the AWS SDK so projects that only use the in-memory driver
  // (e.g. unit tests) don't need to bundle the SDK.
  const sdkPromise = (async () => {
    const [{ S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand }, presigner] =
      await Promise.all([
        import("@aws-sdk/client-s3"),
        import("@aws-sdk/s3-request-presigner"),
      ]);

    const client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    return {
      client,
      PutObjectCommand,
      HeadObjectCommand,
      GetObjectCommand,
      getSignedUrl: presigner.getSignedUrl,
    };
  })();

  const defaultExpiry =
    config.defaultDownloadExpiresInSeconds ??
    DEFAULT_DOWNLOAD_PRESIGN_EXPIRES_IN_SECONDS;

  function rewriteUrl(url: string) {
    if (!config.publicBaseUrl) {
      return url;
    }

    try {
      const parsed = new URL(url);
      const base = new URL(config.publicBaseUrl);
      const rewritten = new URL(parsed.pathname + parsed.search, base);
      rewritten.protocol = base.protocol;
      rewritten.host = base.host;
      return rewritten.toString();
    } catch {
      return url;
    }
  }

  return {
    async put(input) {
      sanitizeKey(input.key);
      const body = toBuffer(input.body);

      if (body.length !== input.contentLength) {
        throw new Error(
          `Object store contentLength mismatch: declared ${input.contentLength}, actual ${body.length}.`,
        );
      }

      const sdk = await sdkPromise;

      // Idempotency check: if the object already exists with the same sha256
      // (encoded into the key), short-circuit. Otherwise overwrite.
      try {
        await sdk.client.send(
          new sdk.HeadObjectCommand({ Bucket: config.bucket, Key: input.key }),
        );
        return {
          key: input.key,
          alreadyExisted: true,
          storedSizeBytes: body.length,
        };
      } catch {
        // Not found — fall through to PUT.
      }

      await sdk.client.send(
        new sdk.PutObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Body: body,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
          Metadata: { sha256: input.sha256 },
        }),
      );

      return {
        key: input.key,
        alreadyExisted: false,
        storedSizeBytes: body.length,
      };
    },

    async exists(key) {
      sanitizeKey(key);
      const sdk = await sdkPromise;
      try {
        await sdk.client.send(
          new sdk.HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        return true;
      } catch {
        return false;
      }
    },

    async get(key) {
      sanitizeKey(key);
      const sdk = await sdkPromise;
      try {
        const response = await sdk.client.send(
          new sdk.GetObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        if (!response.Body) {
          return null;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks);
        return {
          body,
          contentType: response.ContentType ?? "application/octet-stream",
          contentLength: body.length,
        };
      } catch {
        return null;
      }
    },

    async presignDownload(input) {
      sanitizeKey(input.key);
      const expiresInSeconds = input.expiresInSeconds ?? defaultExpiry;
      if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
        throw new Error("expiresInSeconds must be a positive finite number.");
      }

      const sdk = await sdkPromise;
      const url = await sdk.getSignedUrl(
        sdk.client,
        new sdk.GetObjectCommand({ Bucket: config.bucket, Key: input.key }),
        { expiresIn: expiresInSeconds },
      );

      return {
        url: rewriteUrl(url),
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
        key: input.key,
      };
    },
  };
}

/**
 * Driver factory. Selection logic:
 *
 *   - `OBJECT_STORE_DRIVER=memory` → in-memory (test only)
 *   - otherwise                    → S3-compatible (requires S3_* env vars)
 */
export function createObjectStoreClient(
  config: ObjectStoreConfig,
): ObjectStoreClient {
  if (process.env.OBJECT_STORE_DRIVER === "memory") {
    return createInMemoryObjectStore({
      publicBaseUrl: config.publicBaseUrl,
      defaultDownloadExpiresInSeconds: config.defaultDownloadExpiresInSeconds,
    });
  }

  if (!config.bucket) {
    throw new Error(
      "Registry object store: S3_BUCKET (or config.bucket) is required.",
    );
  }
  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error(
      "Registry object store: S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required.",
    );
  }

  return createS3CompatibleObjectStoreClient(config);
}
