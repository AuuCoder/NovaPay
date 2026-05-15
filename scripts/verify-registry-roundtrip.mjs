/**
 * End-to-end registry verification helper.
 *
 * Usage:
 *   node scripts/verify-registry-roundtrip.mjs [baseUrl] [slug] [version]
 *
 * Defaults to the local Registry dev server. Fetches /.well-known/trust.json,
 * the package metadata, and the actual bundle bytes; recomputes sha256 and
 * verifies the Ed25519 signature against the trust public key.
 */
import { createPublicKey, verify, createHash } from "node:crypto";

const SPKI = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

const baseUrl = process.argv[2] ?? "http://localhost:3100";
const slug = process.argv[3] ?? "remote.demo-runnable-crypto";
const version = process.argv[4] ?? "0.1.0";

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const trust = await fetchJson(`${baseUrl}/api/.well-known/trust.json`);
console.log("trust.currentKey.keyId :", trust.currentKey?.keyId);

const pkg = await fetchJson(`${baseUrl}/api/registry/packages/${slug}/${version}`);
console.log("pkg.signatureKeyId    :", pkg.signatureKeyId);
console.log("pkg.checksum          :", pkg.checksum);

const bytes = await fetchBytes(pkg.downloadUrl);
console.log("download size         :", bytes.length, "(expected", pkg.sizeBytes + ")");

const computedSha = createHash("sha256").update(bytes).digest("hex");
const expectedSha = pkg.checksum.replace(/^sha256:/, "");
console.log("sha256 match          :", computedSha === expectedSha);

const sigB64 = pkg.signature.replace(/^ed25519:/, "");
const sigBytes = Buffer.from(sigB64, "base64url");
const pubBytes = Buffer.from(trust.currentKey.publicKey, "base64url");
const pubKey = createPublicKey({
  key: Buffer.concat([SPKI, pubBytes]),
  format: "der",
  type: "spki",
});
const sigOk = verify(null, bytes, pubKey, sigBytes);
console.log("Ed25519 signature ok  :", sigOk);

const allOk = sigOk && computedSha === expectedSha;
console.log(allOk ? "\n✅ END-TO-END OK" : "\n❌ FAILED");
process.exit(allOk ? 0 : 1);
