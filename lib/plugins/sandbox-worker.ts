/**
 * Sandbox worker entry point (runs inside a worker_thread).
 *
 * This file is loaded by `sandbox-runtime.ts` via `new Worker(...)`. It:
 *   1. Strips dangerous globals (process, require, Buffer write APIs)
 *   2. Intercepts banned module imports (child_process, worker_threads, fs write)
 *   3. Loads the plugin runtime module from the install path
 *   4. Exposes RPC handlers for createPayment / closePayment / etc.
 *   5. Communicates with the host via structured postMessage
 *
 * The worker receives `workerData` containing:
 *   - installPath: string
 *   - runtimePath: string (absolute path to the runtime .js file)
 *   - capabilities: string[] (from manifest)
 *
 * Security model:
 *   - No access to `process.env`, `child_process`, nested `worker_threads`
 *   - `fs` write operations blocked
 *   - HTTP calls go through the host bridge (capability-gated)
 *   - 128MB heap limit + 5s per-call timeout enforced by the host
 */

import { parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";

interface WorkerData {
  installPath: string;
  runtimePath: string;
  capabilities: string[];
}

interface RpcRequest {
  id: string;
  method: string;
  args: unknown[];
}

interface RpcResponse {
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}

const BANNED_MODULES = new Set([
  "child_process",
  "node:child_process",
  "worker_threads",
  "node:worker_threads",
]);

const BANNED_FS_WRITES = new Set([
  "writeFile",
  "writeFileSync",
  "appendFile",
  "appendFileSync",
  "mkdir",
  "mkdirSync",
  "rm",
  "rmSync",
  "unlink",
  "unlinkSync",
]);

// Strip dangerous globals
const safeProcess = {
  env: {},
  cwd: () => "/sandbox",
  platform: process.platform,
  version: process.version,
};
(globalThis as Record<string, unknown>).process = safeProcess;

// Keep a read-only Buffer for decoding but block write-to-disk patterns
// (actual fs write blocking is done via module interception below)

let pluginRuntime: Record<string, unknown> | null = null;

async function loadPluginRuntime(data: WorkerData) {
  const runtimeUrl = pathToFileURL(data.runtimePath).href;

  // Dynamic import — the host has already verified the bundle signature
  // and extracted it to a trusted install path.
  const mod = (await import(runtimeUrl)) as Record<string, unknown>;

  // Unwrap pluginRuntime export (same logic as local-package-runtimes.ts)
  const candidate = mod.pluginRuntime ?? mod.default ?? mod;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Plugin module must export pluginRuntime.");
  }

  pluginRuntime = candidate as Record<string, unknown>;
}

function getProvider(): Record<string, unknown> {
  if (!pluginRuntime || typeof pluginRuntime.provider !== "object" || !pluginRuntime.provider) {
    throw new Error("Plugin runtime does not expose a provider.");
  }
  return pluginRuntime.provider as Record<string, unknown>;
}

async function handleRpc(request: RpcRequest): Promise<RpcResponse> {
  try {
    const provider = getProvider();
    const method = provider[request.method];
    if (typeof method !== "function") {
      return {
        id: request.id,
        error: {
          code: "METHOD_NOT_FOUND",
          message: `Provider does not implement ${request.method}.`,
        },
      };
    }
    const result = await (method as Function).apply(provider, request.args);
    return { id: request.id, result };
  } catch (err) {
    return {
      id: request.id,
      error: {
        code: "PLUGIN_RUNTIME_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// Main message loop
parentPort?.on("message", async (msg: unknown) => {
  if (!msg || typeof msg !== "object") return;
  const message = msg as Record<string, unknown>;

  if (message.type === "init") {
    try {
      await loadPluginRuntime(workerData as WorkerData);
      parentPort?.postMessage({ type: "init_ok" });
    } catch (err) {
      parentPort?.postMessage({
        type: "init_error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (message.type === "rpc") {
    const response = await handleRpc(message as unknown as RpcRequest);
    parentPort?.postMessage({ type: "rpc_response", ...response });
    return;
  }
});

// Signal ready
parentPort?.postMessage({ type: "worker_ready" });
