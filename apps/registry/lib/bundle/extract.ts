/**
 * Bundle extraction utilities.
 *
 * Handles tar.gz, zip, and JSON archives uploaded by developers. Extracts to
 * memory, validates path safety (no traversal), and returns the list of
 * extracted files with their content.
 *
 * Supported formats:
 *   - application/gzip (tar.gz): uses node:zlib + streaming tar parser
 *   - application/zip: uses node:zlib inflate + central directory parsing
 *   - application/json: legacy JSON bundle format (phase 1 compat)
 */

import { gunzipSync } from "node:zlib";

export interface ExtractedFile {
  /** Relative path within the bundle (e.g. "plugin.json", "runtime.js") */
  relativePath: string;
  /** File content as a Buffer */
  content: Buffer;
}

export interface BundleExtractionResult {
  files: ExtractedFile[];
  /** The raw plugin.json content (convenience shortcut) */
  manifestRaw: string | null;
}

const MAX_BUNDLE_SIZE = 50 * 1024 * 1024; // 50 MB (Req 6.1)
const MAX_FILE_COUNT = 500;
const MAX_PATH_DEPTH = 10;

/**
 * Validates that a relative path is safe (no traversal, no absolute prefix).
 */
export function assertSafeRelativePath(value: string): void {
  if (!value || value.startsWith("/") || value.includes("..")) {
    throw new Error(`Unsafe bundle file path: ${value}`);
  }
  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`Unsafe bundle file path: ${value}`);
  }
  const depth = normalized.split("/").length;
  if (depth > MAX_PATH_DEPTH) {
    throw new Error(`Bundle file path exceeds max depth (${MAX_PATH_DEPTH}): ${value}`);
  }
}

/**
 * Extracts a JSON-encoded bundle (the format used by mock registry package
 * responses and phase 1 upload tests).
 */
export function extractJsonBundle(rawPayload: string): BundleExtractionResult {
  const parsed = JSON.parse(rawPayload) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Bundle payload must be a JSON object.");
  }

  const bundle = parsed as Record<string, unknown>;
  const manifestRaw = bundle.manifest
    ? JSON.stringify(bundle.manifest, null, 2)
    : null;

  const files: ExtractedFile[] = [];

  if (manifestRaw) {
    files.push({
      relativePath: "plugin.json",
      content: Buffer.from(manifestRaw, "utf8"),
    });
  }

  if (Array.isArray(bundle.files)) {
    for (const entry of bundle.files) {
      if (!entry || typeof entry !== "object") continue;
      const fileEntry = entry as Record<string, unknown>;
      const filePath = typeof fileEntry.path === "string" ? fileEntry.path : null;
      const fileContent = typeof fileEntry.content === "string" ? fileEntry.content : null;
      const encoding = fileEntry.encoding === "base64" ? "base64" : "utf8";

      if (!filePath || !fileContent) continue;
      assertSafeRelativePath(filePath);

      files.push({
        relativePath: filePath,
        content: Buffer.from(fileContent, encoding),
      });
    }
  }

  return { files, manifestRaw };
}

/**
 * Extracts a tar.gz bundle. Uses a minimal tar header parser (512-byte
 * blocks) that handles POSIX ustar format — sufficient for plugin bundles.
 */
export function extractTarGzBundle(rawBytes: Buffer): BundleExtractionResult {
  if (rawBytes.length > MAX_BUNDLE_SIZE) {
    throw new Error(`Bundle exceeds maximum size of ${MAX_BUNDLE_SIZE} bytes.`);
  }

  const tarBytes = gunzipSync(rawBytes);
  const files: ExtractedFile[] = [];
  let offset = 0;

  while (offset < tarBytes.length - 512) {
    // Read 512-byte tar header
    const header = tarBytes.subarray(offset, offset + 512);

    // Check for end-of-archive (two consecutive zero blocks)
    if (header.every((b) => b === 0)) break;

    // Extract filename (bytes 0-99, null-terminated)
    const nameEnd = header.indexOf(0, 0);
    const name = header.subarray(0, Math.min(nameEnd >= 0 ? nameEnd : 100, 100)).toString("utf8").trim();

    // Extract file size (bytes 124-135, octal ASCII)
    const sizeStr = header.subarray(124, 136).toString("utf8").trim();
    const size = parseInt(sizeStr, 8) || 0;

    // Extract type flag (byte 156): '0' or '\0' = regular file, '5' = directory
    const typeFlag = header[156];

    offset += 512; // Move past header

    if ((typeFlag === 0x30 || typeFlag === 0x00) && size > 0 && name) {
      // Regular file
      const relativePath = name.replace(/^\.\//, "");
      assertSafeRelativePath(relativePath);

      if (files.length >= MAX_FILE_COUNT) {
        throw new Error(`Bundle exceeds maximum file count of ${MAX_FILE_COUNT}.`);
      }

      files.push({
        relativePath,
        content: Buffer.from(tarBytes.subarray(offset, offset + size)),
      });
    }

    // Advance past file data (rounded up to 512-byte boundary)
    offset += Math.ceil(size / 512) * 512;
  }

  const manifestFile = files.find((f) => f.relativePath === "plugin.json");
  const manifestRaw = manifestFile ? manifestFile.content.toString("utf8") : null;

  return { files, manifestRaw };
}

/**
 * Auto-detects the bundle format and extracts accordingly.
 */
export function extractBundle(
  rawBytes: Buffer,
  contentType: string,
): BundleExtractionResult {
  if (rawBytes.length > MAX_BUNDLE_SIZE) {
    throw new Error(`Bundle exceeds maximum size of ${MAX_BUNDLE_SIZE / 1024 / 1024} MB.`);
  }

  switch (contentType) {
    case "application/gzip":
    case "application/x-gzip":
    case "application/x-tar":
      return extractTarGzBundle(rawBytes);

    case "application/json":
      return extractJsonBundle(rawBytes.toString("utf8"));

    case "application/zip":
    case "application/x-zip-compressed":
      // ZIP support is a stretch goal; for now reject with a clear message.
      throw new Error(
        "ZIP bundle extraction is not yet supported. Please upload as tar.gz.",
      );

    default:
      // Try to detect by magic bytes
      if (rawBytes[0] === 0x1f && rawBytes[1] === 0x8b) {
        return extractTarGzBundle(rawBytes);
      }
      if (rawBytes[0] === 0x7b) {
        // Starts with '{' — likely JSON
        return extractJsonBundle(rawBytes.toString("utf8"));
      }
      throw new Error(`Unsupported bundle content type: ${contentType}`);
  }
}

