import assert from "node:assert/strict";
import test from "node:test";
import { getDataEncryptionKey } from "../lib/env";
import { issueRegistrySsoToken } from "../lib/registry-sso";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("data encryption key strength is enforced when NODE_ENV is unset", () => {
  withEnv(
    { NODE_ENV: undefined, NOVAPAY_DATA_ENCRYPTION_KEY: "short" },
    () => assert.throws(() => getDataEncryptionKey(), /high-entropy secret/),
  );
});

test("Registry SSO rejects the development secret in production", () => {
  withEnv(
    {
      NODE_ENV: "production",
      REGISTRY_SSO_SECRET: "novapay-registry-dev-sso-secret",
    },
    () =>
      assert.throws(
        () =>
          issueRegistrySsoToken({
            id: "admin_test",
            email: "admin@example.test",
            name: "Admin",
            role: "SUPER_ADMIN",
          }),
        /high-entropy secret/,
      ),
  );
});
