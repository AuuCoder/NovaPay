/**
 * Bundle extraction utilities.
 *
 * Handles tar.gz and zip archives uploaded by developers. Extracts to a
 * temporary directory, validates path safety (no traversal), and returns the
 * list of extracted file paths relative to the extraction root.
 *
 * Phase 1 note: actual tar/zip extraction requires `tar` or `zlib` + streaming
 * logic. This module provides the interface and a minimal implementation that
 * works with the in-memory bundle format (JSON with `files[]` array) used by
 * the mock registry and phase 1 conformance tests. A real streaming extractor
 * will be wired in when the upload endpoint accepts multipart form data.
 */

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
}

/**
 * Extracts a JSON-encoded bundle (the format currently used by mock registry
 * package responses and phase 1 upload tests).
 *
 * Expected shape:
 * ```json
 * {
 *   "manifest": { ... },
 *   "files": [{ "path": "runtime.js", "content": "...", "encoding": "utf8"|"base64" }]
 * }
 * ```
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

  // Always include plugin.json from the manifest field.
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
