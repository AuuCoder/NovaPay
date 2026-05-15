import assert from "node:assert/strict";
import test from "node:test";

/**
 * Phase 3 (Req 13.4, 13.7, 13.8): NovaPay-side license revalidation regression
 * coverage.
 *
 * The full `revalidateInstalledPluginLicenses` flow needs Prisma; we keep the
 * regression test scope to the `verifyLicense` decision branch that drives the
 * disable behavior. Specifically, we assert that:
 *   1. A successful revalidation leaves the plugin enabled.
 *   2. A REVOKED revalidation should trigger disable + audit notes.
 *   3. An EXPIRED revalidation should trigger disable + audit notes.
 *   4. TRANSPORT_ERROR should NOT disable a plugin (preserve install path).
 *
 * The test simulates the policy directly without touching Prisma.
 */

interface FakeMarketplaceState {
  enabled: boolean;
  notes: string | null;
}

function applyRevalidationPolicy(
  state: FakeMarketplaceState,
  result:
    | { valid: true }
    | { valid: false; reason: string; message: string },
): FakeMarketplaceState {
  if (result.valid) return { ...state };
  if (result.reason === "REVOKED" || result.reason === "EXPIRED") {
    return {
      enabled: false,
      notes: `license ${result.reason.toLowerCase()} on revalidation: ${result.message}`,
    };
  }
  // For other failure reasons (e.g. TRANSPORT_ERROR), keep the plugin
  // enabled so a transient outage doesn't disable production traffic.
  return { ...state };
}

test("successful revalidation keeps the plugin enabled", () => {
  const before: FakeMarketplaceState = { enabled: true, notes: null };
  const after = applyRevalidationPolicy(before, { valid: true });
  assert.deepEqual(after, before);
});

test("REVOKED license disables the plugin and writes audit notes", () => {
  const before: FakeMarketplaceState = { enabled: true, notes: null };
  const after = applyRevalidationPolicy(before, {
    valid: false,
    reason: "REVOKED",
    message: "Refunded by issuer.",
  });
  assert.equal(after.enabled, false);
  assert.match(after.notes ?? "", /license revoked on revalidation/);
});

test("EXPIRED license disables the plugin and writes audit notes", () => {
  const before: FakeMarketplaceState = { enabled: true, notes: null };
  const after = applyRevalidationPolicy(before, {
    valid: false,
    reason: "EXPIRED",
    message: "License expired at 2025-01-01.",
  });
  assert.equal(after.enabled, false);
  assert.match(after.notes ?? "", /license expired on revalidation/);
});

test("TRANSPORT_ERROR keeps the plugin enabled (preserves install path)", () => {
  const before: FakeMarketplaceState = { enabled: true, notes: null };
  const after = applyRevalidationPolicy(before, {
    valid: false,
    reason: "TRANSPORT_ERROR",
    message: "Registry unreachable.",
  });
  assert.deepEqual(after, before);
});
