import assert from "node:assert/strict";
import test from "node:test";
import { downloadRemotePluginBundle } from "../lib/plugins/marketplace";

async function withDownloadEnv(
  nodeEnv: string,
  fetchImpl: typeof fetch | null,
  run: () => Promise<void>,
) {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const previousFetch = globalThis.fetch;
  env.NODE_ENV = nodeEnv;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  try {
    await run();
  } finally {
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    globalThis.fetch = previousFetch;
  }
}

test("plugin download rejects redirects", async () => {
  await withDownloadEnv(
    "test",
    (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://other.example.test/plugin.json" },
      })) as typeof fetch,
    async () => {
      await assert.rejects(
        () => downloadRemotePluginBundle("https://registry.example.test/plugin.json"),
        /重定向/,
      );
    },
  );
});

test("plugin download rejects a declared body larger than 5 MiB", async () => {
  await withDownloadEnv(
    "test",
    (async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-length": String(5 * 1024 * 1024 + 1) },
      })) as typeof fetch,
    async () => {
      await assert.rejects(
        () => downloadRemotePluginBundle("https://registry.example.test/plugin.json"),
        /5 MiB/,
      );
    },
  );
});

test("production plugin download rejects direct private targets before connecting", async () => {
  await withDownloadEnv("production", null, async () => {
    await assert.rejects(
      () => downloadRemotePluginBundle("https://127.0.0.1/plugin.json"),
      /hostname is not allowed/,
    );
  });
});
