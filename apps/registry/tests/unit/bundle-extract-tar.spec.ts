import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";

import { extractTarGzBundle, extractBundle, assertSafeRelativePath } from "../../lib/bundle/extract";

/**
 * Builds a minimal POSIX tar archive in memory (uncompressed).
 * Each entry is a 512-byte header + file content padded to 512-byte boundary.
 */
function buildTar(files: Array<{ name: string; content: string }>): Buffer {
  const blocks: Buffer[] = [];

  for (const file of files) {
    const contentBuf = Buffer.from(file.content, "utf8");
    const header = Buffer.alloc(512, 0);

    // Name (bytes 0-99)
    header.write(file.name, 0, Math.min(file.name.length, 100), "utf8");

    // Mode (bytes 100-107)
    header.write("0000644\0", 100, 8, "utf8");

    // Size in octal (bytes 124-135)
    const sizeOctal = contentBuf.length.toString(8).padStart(11, "0");
    header.write(sizeOctal + "\0", 124, 12, "utf8");

    // Type flag (byte 156): '0' = regular file
    header[156] = 0x30;

    // Magic (bytes 257-262): "ustar\0"
    header.write("ustar\0", 257, 6, "utf8");

    // Compute checksum (bytes 148-155): sum of all header bytes treating
    // the checksum field itself as spaces (0x20).
    for (let i = 148; i < 156; i++) header[i] = 0x20;
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i]!;
    const checksumStr = checksum.toString(8).padStart(6, "0") + "\0 ";
    header.write(checksumStr, 148, 8, "utf8");

    blocks.push(header);

    // File content + padding to 512-byte boundary
    const paddedSize = Math.ceil(contentBuf.length / 512) * 512;
    const contentBlock = Buffer.alloc(paddedSize, 0);
    contentBuf.copy(contentBlock);
    blocks.push(contentBlock);
  }

  // End-of-archive: two 512-byte zero blocks
  blocks.push(Buffer.alloc(1024, 0));

  return Buffer.concat(blocks);
}

describe("extractTarGzBundle", () => {
  it("extracts files from a valid tar.gz", () => {
    const tar = buildTar([
      { name: "plugin.json", content: '{"slug":"test","kind":"PAYMENT_CHANNEL"}' },
      { name: "runtime.js", content: "export const pluginRuntime = {};" },
    ]);
    const gz = gzipSync(tar);

    const result = extractTarGzBundle(gz);
    assert.equal(result.files.length, 2);
    assert.equal(result.manifestRaw, '{"slug":"test","kind":"PAYMENT_CHANNEL"}');
    assert.equal(result.files[1]?.relativePath, "runtime.js");
    assert.equal(result.files[1]?.content.toString("utf8"), "export const pluginRuntime = {};");
  });

  it("strips leading ./ from paths", () => {
    const tar = buildTar([
      { name: "./plugin.json", content: '{}' },
    ]);
    const gz = gzipSync(tar);
    const result = extractTarGzBundle(gz);
    assert.equal(result.files[0]?.relativePath, "plugin.json");
  });

  it("rejects path traversal", () => {
    const tar = buildTar([
      { name: "../etc/passwd", content: "root:x:0:0" },
    ]);
    const gz = gzipSync(tar);
    assert.throws(() => extractTarGzBundle(gz), /Unsafe bundle file path/);
  });
});

describe("extractBundle auto-detection", () => {
  it("detects gzip by magic bytes", () => {
    const tar = buildTar([{ name: "plugin.json", content: '{"slug":"auto"}' }]);
    const gz = gzipSync(tar);
    const result = extractBundle(gz, "application/octet-stream");
    assert.equal(result.manifestRaw, '{"slug":"auto"}');
  });

  it("detects JSON by leading brace", () => {
    const json = Buffer.from(JSON.stringify({ manifest: { slug: "json-detect" }, files: [] }));
    const result = extractBundle(json, "application/octet-stream");
    assert.ok(result.manifestRaw?.includes("json-detect"));
  });

  it("rejects unsupported content types", () => {
    assert.throws(
      () => extractBundle(Buffer.from([0x50, 0x4b]), "application/zip"),
      /ZIP bundle extraction is not yet supported/,
    );
  });
});

describe("assertSafeRelativePath", () => {
  it("allows normal paths", () => {
    assert.doesNotThrow(() => assertSafeRelativePath("plugin.json"));
    assert.doesNotThrow(() => assertSafeRelativePath("src/runtime.js"));
    assert.doesNotThrow(() => assertSafeRelativePath("dist/index.mjs"));
  });

  it("rejects traversal and absolute paths", () => {
    assert.throws(() => assertSafeRelativePath("../etc/passwd"));
    assert.throws(() => assertSafeRelativePath("/etc/passwd"));
    assert.throws(() => assertSafeRelativePath("foo/../../bar"));
  });
});
