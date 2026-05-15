import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  buildPackageObjectKey,
  createInMemoryObjectStore,
  createObjectStoreClient,
  DEFAULT_DOWNLOAD_PRESIGN_EXPIRES_IN_SECONDS,
} from "../../lib/storage/object-store";

function sha256Hex(payload: Buffer | Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

describe("buildPackageObjectKey", () => {
  it("emits packages/<sha256>.<ext> for tar.gz and zip", () => {
    const sha = "a".repeat(64);
    assert.equal(
      buildPackageObjectKey(sha, "tar.gz"),
      `packages/${sha}.tar.gz`,
    );
    assert.equal(buildPackageObjectKey(sha, "zip"), `packages/${sha}.zip`);
  });

  it("rejects invalid sha256 inputs", () => {
    assert.throws(
      () => buildPackageObjectKey("not-a-sha", "tar.gz"),
      /sha256 must be a 64-char lowercase hex string/,
    );
    assert.throws(
      () => buildPackageObjectKey("A".repeat(64), "zip"),
      /sha256 must be a 64-char lowercase hex string/,
    );
  });
});

describe("createInMemoryObjectStore", () => {
  it("put is idempotent for identical sha256 and rejects content drift", async () => {
    const store = createInMemoryObjectStore();
    const body = Buffer.from("hello-world", "utf8");
    const sha = sha256Hex(body);
    const key = buildPackageObjectKey(sha, "tar.gz");

    const first = await store.put({
      key,
      body,
      contentType: "application/gzip",
      contentLength: body.length,
      sha256: sha,
    });
    assert.equal(first.alreadyExisted, false);
    assert.equal(first.storedSizeBytes, body.length);

    const second = await store.put({
      key,
      body,
      contentType: "application/gzip",
      contentLength: body.length,
      sha256: sha,
    });
    assert.equal(second.alreadyExisted, true);

    const drift = Buffer.from("different-bytes", "utf8");
    await assert.rejects(
      () =>
        store.put({
          key,
          body: drift,
          contentType: "application/gzip",
          contentLength: drift.length,
          sha256: sha256Hex(drift),
        }),
      /Object store conflict: key already exists with different content/,
    );
  });

  it("exists toggles after put", async () => {
    const store = createInMemoryObjectStore();
    const body = Buffer.from("payload", "utf8");
    const sha = sha256Hex(body);
    const key = buildPackageObjectKey(sha, "tar.gz");

    assert.equal(await store.exists(key), false);
    await store.put({
      key,
      body,
      contentType: "application/gzip",
      contentLength: body.length,
      sha256: sha,
    });
    assert.equal(await store.exists(key), true);
  });

  it("presignDownload defaults to 5 minutes (Req 17.4)", async () => {
    const store = createInMemoryObjectStore();
    const body = Buffer.from("payload", "utf8");
    const sha = sha256Hex(body);
    const key = buildPackageObjectKey(sha, "tar.gz");
    await store.put({
      key,
      body,
      contentType: "application/gzip",
      contentLength: body.length,
      sha256: sha,
    });

    const before = Date.now();
    const presigned = await store.presignDownload({ key });
    const drift = Math.abs(
      presigned.expiresAt.getTime() -
        (before + DEFAULT_DOWNLOAD_PRESIGN_EXPIRES_IN_SECONDS * 1000),
    );

    assert.ok(
      drift <= 1000,
      `Expected presign expiry within 1s of default 300s; drift=${drift}`,
    );
    assert.match(presigned.url, /\?expires=\d+$/);
    assert.equal(presigned.key, key);
  });

  it("presignDownload validates expiresInSeconds", async () => {
    const store = createInMemoryObjectStore();
    await assert.rejects(
      () => store.presignDownload({ key: "packages/x.tar.gz", expiresInSeconds: 0 }),
      /expiresInSeconds must be a positive finite number/,
    );
  });

  it("rejects keys with leading slash or path traversal", async () => {
    const store = createInMemoryObjectStore();
    await assert.rejects(
      () =>
        store.put({
          key: "/packages/x.tar.gz",
          body: Buffer.from("a"),
          contentType: "application/gzip",
          contentLength: 1,
          sha256: sha256Hex(Buffer.from("a")),
        }),
      /must not start with "\/"/,
    );
    await assert.rejects(
      () =>
        store.put({
          key: "packages/../etc/passwd",
          body: Buffer.from("a"),
          contentType: "application/gzip",
          contentLength: 1,
          sha256: sha256Hex(Buffer.from("a")),
        }),
      /path traversal/,
    );
  });
});

describe("createObjectStoreClient driver dispatch", () => {
  it("returns the in-memory driver when OBJECT_STORE_DRIVER=memory", async () => {
    const previous = process.env.OBJECT_STORE_DRIVER;
    process.env.OBJECT_STORE_DRIVER = "memory";
    try {
      const client = createObjectStoreClient({
        bucket: "novapay-registry-packages",
        region: "us-east-1",
        accessKeyId: "test",
        secretAccessKey: "test",
      });
      const result = await client.presignDownload({
        key: "packages/aaaaa.tar.gz",
      });
      assert.match(result.url, /^http:\/\/memory-object-store\.local\//);
    } finally {
      if (previous === undefined) {
        delete process.env.OBJECT_STORE_DRIVER;
      } else {
        process.env.OBJECT_STORE_DRIVER = previous;
      }
    }
  });

  it("falls back to the placeholder S3 driver, which throws until installed", () => {
    const previous = process.env.OBJECT_STORE_DRIVER;
    delete process.env.OBJECT_STORE_DRIVER;
    try {
      assert.throws(
        () =>
          createObjectStoreClient({
            bucket: "novapay-registry-packages",
            region: "us-east-1",
            accessKeyId: "test",
            secretAccessKey: "test",
          }),
        /S3-compatible object store driver will be provided after task 1\.4/,
      );
    } finally {
      if (previous !== undefined) {
        process.env.OBJECT_STORE_DRIVER = previous;
      }
    }
  });
});
