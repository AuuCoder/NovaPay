/**
 * Smoke test: builds a minimal tar.gz plugin bundle, uploads it via the
 * Developer API, and prints the signed result. Use against a running
 * Registry dev server (default localhost:3100).
 */
import { gzipSync } from "node:zlib";

function buildTar(files) {
  const blocks = [];
  for (const f of files) {
    const content = Buffer.from(f.content, "utf8");
    const header = Buffer.alloc(512, 0);
    header.write(f.name, 0, Math.min(f.name.length, 100), "utf8");
    header.write("0000644\0", 100, 8, "utf8");
    header.write(content.length.toString(8).padStart(11, "0") + "\0", 124, 12, "utf8");
    header[156] = 0x30;
    header.write("ustar\0", 257, 6, "utf8");
    for (let i = 148; i < 156; i++) header[i] = 0x20;
    let cs = 0;
    for (let i = 0; i < 512; i++) cs += header[i];
    header.write(cs.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");
    blocks.push(header);
    const padded = Buffer.alloc(Math.ceil(content.length / 512) * 512, 0);
    content.copy(padded);
    blocks.push(padded);
  }
  blocks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocks);
}

const manifest = {
  manifestVersion: 1,
  slug: "remote.smoke-test",
  kind: "PAYMENT_CHANNEL",
  channelCode: "crypto.smoke",
  providerKey: "crypto",
  packageName: "@novapay/smoke-test",
  displayName: "Smoke Test Plugin",
  vendor: "Smoke",
  description: "Smoke test bundle uploaded via /api/developer/plugins/.../versions",
  version: "0.1.0",
  capabilities: ["native_qr"],
  category: { zh: "测试", en: "Test" },
  summary: { zh: "冒烟", en: "Smoke" },
  detail: { zh: "冒烟测试详情", en: "Smoke test detail" },
  supportsCallbackRoute: false,
  requiresMerchantProfileCompletion: false,
  runtimeEntrypoint: "./runtime.js",
};

const tar = buildTar([
  { name: "plugin.json", content: JSON.stringify(manifest, null, 2) },
  { name: "runtime.js", content: "export const pluginRuntime = { provider: { getSummary() { return { code: 'crypto.smoke', provider: 'crypto', implementationStatus: 'ready' }; } } };" },
]);
const gz = gzipSync(tar);

const baseUrl = process.argv[2] ?? "http://localhost:3100";
const url = `${baseUrl}/api/developer/plugins/remote.smoke-test/versions`;

const fd = new FormData();
fd.append("package", new Blob([gz], { type: "application/gzip" }), "smoke.tar.gz");

const res = await fetch(url, { method: "POST", body: fd });
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
process.exit(res.ok && !body.error ? 0 : 1);
