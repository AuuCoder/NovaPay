import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { scanBundle } from "../../lib/static-scan/ast-scan";

describe("static scan", () => {
  it("detects child_process.exec as BLOCK", () => {
    const result = scanBundle({
      files: [
        {
          relativePath: "runtime.js",
          content: 'const { exec } = require("child_process"); exec("ls");',
        },
      ],
      declaredCapabilities: ["native_qr"],
    });
    assert.equal(result.hasBlockers, true);
    const finding = result.findings.find(
      (f) => f.code === "BANNED_API_CHILD_PROCESS_EXEC",
    );
    assert.ok(finding);
    assert.equal(finding?.severity, "BLOCK");
    assert.equal(finding?.line, 1);
  });

  it("detects eval() as BLOCK", () => {
    const result = scanBundle({
      files: [
        { relativePath: "helper.ts", content: "const x = eval('1+1');" },
      ],
      declaredCapabilities: [],
    });
    assert.equal(result.hasBlockers, true);
    assert.ok(result.findings.some((f) => f.code === "BANNED_API_EVAL"));
  });

  it("detects new Function() as BLOCK", () => {
    const result = scanBundle({
      files: [
        {
          relativePath: "loader.mjs",
          content: 'const fn = new Function("return 42");',
        },
      ],
      declaredCapabilities: [],
    });
    assert.equal(result.hasBlockers, true);
    assert.ok(
      result.findings.some((f) => f.code === "BANNED_API_NEW_FUNCTION"),
    );
  });

  it("detects fs.writeFile as WARN (not BLOCK)", () => {
    const result = scanBundle({
      files: [
        {
          relativePath: "runtime.js",
          content: 'import { writeFile } from "fs/promises"; writeFile("/tmp/x", "y");',
        },
      ],
      declaredCapabilities: [],
    });
    assert.equal(result.hasBlockers, false);
    const finding = result.findings.find(
      (f) => f.code === "BANNED_API_FS_WRITE",
    );
    assert.ok(finding);
    assert.equal(finding?.severity, "WARN");
  });

  it("flags capability mismatch: notify_callback declared but no callbacks export", () => {
    const result = scanBundle({
      files: [
        {
          relativePath: "runtime.js",
          content: "export const pluginRuntime = { provider: {} };",
        },
      ],
      declaredCapabilities: ["notify_callback"],
    });
    assert.ok(
      result.findings.some(
        (f) => f.code === "CAPABILITY_MISMATCH_NOTIFY_CALLBACK",
      ),
    );
  });

  it("flags capability mismatch: refund declared but no createRefund", () => {
    const result = scanBundle({
      files: [
        {
          relativePath: "runtime.js",
          content: "export const pluginRuntime = { provider: { createPayment() {} } };",
        },
      ],
      declaredCapabilities: ["refund"],
    });
    assert.ok(
      result.findings.some((f) => f.code === "CAPABILITY_MISMATCH_REFUND"),
    );
  });

  it("passes clean code with no findings", () => {
    const result = scanBundle({
      files: [
        {
          relativePath: "runtime.js",
          content: `export const pluginRuntime = {
  provider: {
    getSummary() { return { code: "test", provider: "crypto" }; },
    isConfigured() { return true; },
    async createPayment() { return { status: "ok" }; },
  },
};`,
        },
      ],
      declaredCapabilities: ["native_qr"],
    });
    assert.equal(result.findings.length, 0);
    assert.equal(result.hasBlockers, false);
    assert.equal(result.scannedFileCount, 1);
  });

  it("skips non-scannable files (e.g. .json, .css)", () => {
    const result = scanBundle({
      files: [
        { relativePath: "plugin.json", content: '{"eval": true}' },
        { relativePath: "styles.css", content: "body { eval: none; }" },
      ],
      declaredCapabilities: [],
    });
    assert.equal(result.scannedFileCount, 0);
    assert.equal(result.findings.length, 0);
  });
});
