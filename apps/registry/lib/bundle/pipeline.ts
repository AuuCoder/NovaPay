/**
 * Bundle Pipeline — orchestrates the upload flow for a plugin package.
 *
 * Steps (design.md "Bundle Pipeline 详细流程"):
 *   1. Extract bundle → parse manifest
 *   2. Compute sha256 of raw bundle bytes
 *   3. Check object store for dedup (same sha256 = reuse PluginAsset)
 *   4. Write to object store if new
 *   5. Sign raw bundle bytes with current signing key
 *   6. Return pipeline result (sha256, signature, keyId, parsed manifest)
 *
 * This module is intentionally decoupled from Prisma — it operates on pure
 * interfaces (ObjectStoreClient, Ed25519Signer, SigningKeyStore) so it can be
 * tested without a database. The caller (upload route handler) is responsible
 * for persisting PluginVersion / PluginAsset records.
 */

import { createHash } from "node:crypto";
import { parsePluginPackageManifest, type PluginPackageManifest } from "../manifest/parse";
import { type ObjectStoreClient, buildPackageObjectKey } from "../storage/object-store";
import type { Ed25519Signer } from "../signing/signer";
import type { SigningKeyStore } from "../signing/key-store";

export interface BundlePipelineInput {
  /** Raw bundle bytes (tar.gz or zip content, or JSON-encoded bundle for phase 1) */
  rawBytes: Buffer;
  /** Content type of the uploaded file */
  contentType: "application/gzip" | "application/zip" | "application/json";
}

export interface BundlePipelineResult {
  manifest: PluginPackageManifest;
  manifestRaw: string;
  sha256: string;
  storageKey: string;
  sizeBytes: number;
  alreadyExisted: boolean;
  signature: string;
  signatureKeyId: string;
}

export interface BundlePipelineDeps {
  objectStore: ObjectStoreClient;
  signer: Ed25519Signer;
  keyStore: SigningKeyStore;
}

function computeSha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function getExtensionFromContentType(
  contentType: BundlePipelineInput["contentType"],
): "tar.gz" | "zip" {
  switch (contentType) {
    case "application/gzip":
    case "application/json": // phase 1 JSON bundles stored as .tar.gz by convention
      return "tar.gz";
    case "application/zip":
      return "zip";
  }
}

/**
 * Runs the bundle pipeline. Does NOT persist to the database — returns all
 * data needed for the caller to create PluginAsset + PluginVersion records.
 */
export async function runBundlePipeline(
  input: BundlePipelineInput,
  deps: BundlePipelineDeps,
): Promise<BundlePipelineResult> {
  const { rawBytes, contentType } = input;
  const { objectStore, signer, keyStore } = deps;

  // 1. Parse manifest from the raw bytes. For phase 1 JSON bundles we parse
  //    the manifest field directly; for real tar.gz/zip we'd extract first.
  const manifestRaw = extractManifestRaw(rawBytes, contentType);
  const manifestParsed = JSON.parse(manifestRaw) as unknown;
  const manifest = parsePluginPackageManifest(manifestParsed, {
    source: "REMOTE_SIGNED",
    rawJson: manifestRaw,
  });

  // 2. sha256 of the entire raw bundle
  const sha256 = computeSha256(rawBytes);

  // 3 + 4. Object store write (idempotent by sha256)
  const extension = getExtensionFromContentType(contentType);
  const storageKey = buildPackageObjectKey(sha256, extension);
  const putResult = await objectStore.put({
    key: storageKey,
    body: rawBytes,
    contentType,
    contentLength: rawBytes.length,
    sha256,
  });

  // 5. Sign the raw bundle bytes
  const activeKey = await keyStore.getActive();
  const signResult = await signer.sign({
    rawBytes,
    keyId: activeKey.keyId,
  });

  return {
    manifest,
    manifestRaw,
    sha256,
    storageKey,
    sizeBytes: rawBytes.length,
    alreadyExisted: putResult.alreadyExisted,
    signature: `ed25519:${signResult.signature}`,
    signatureKeyId: signResult.keyId,
  };
}

/**
 * Extracts the raw plugin.json text from the bundle bytes.
 * Phase 1: JSON bundles have a top-level `manifest` field.
 * Future: tar.gz/zip extraction will read `plugin.json` from the archive.
 */
function extractManifestRaw(
  rawBytes: Buffer,
  contentType: BundlePipelineInput["contentType"],
): string {
  if (contentType === "application/json") {
    const parsed = JSON.parse(rawBytes.toString("utf8")) as Record<string, unknown>;
    if (!parsed.manifest || typeof parsed.manifest !== "object") {
      throw new Error("JSON bundle must contain a top-level 'manifest' field.");
    }
    return JSON.stringify(parsed.manifest, null, 2);
  }

  // For tar.gz / zip: placeholder that will be replaced with real extraction.
  // In phase 1 all uploads go through the JSON path.
  throw new Error(
    `Binary bundle extraction (${contentType}) is not yet implemented. ` +
    "Use application/json format for phase 1 uploads.",
  );
}
