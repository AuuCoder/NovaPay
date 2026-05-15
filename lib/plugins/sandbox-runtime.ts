/**
 * Sandboxed plugin runtime loader (Req 16, 21).
 *
 * Loads REMOTE_SIGNED plugin code inside a `worker_threads` Worker with:
 *   - resourceLimits: maxOldGenerationSizeMb=128, maxYoungGenerationSizeMb=16
 *   - 5-second timeout per RPC call (PLUGIN_RUNTIME_TIMEOUT)
 *   - OOM detection (PLUGIN_RUNTIME_OOM)
 *   - Banned module interception (CAPABILITY_DENIED)
 *
 * The host communicates with the worker via structured postMessage RPC.
 * Each call returns a Promise that resolves/rejects within the timeout.
 */

import { Worker } from "node:worker_threads";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface SandboxLoadInput {
  installPath: string;
  runtimePath: string;
  capabilities: string[];
}

export interface SandboxRuntimeHandle {
  callMethod(method: string, ...args: unknown[]): Promise<unknown>;
  dispose(): Promise<void>;
  readonly alive: boolean;
}

export class PluginRuntimeTimeoutError extends Error {
  readonly code = "PLUGIN_RUNTIME_TIMEOUT";
  constructor(method: string) {
    super(`Plugin runtime call "${method}" exceeded 5000ms timeout.`);
    this.name = "PluginRuntimeTimeoutError";
  }
}

export class PluginRuntimeOomError extends Error {
  readonly code = "PLUGIN_RUNTIME_OOM";
  constructor() {
    super("Plugin runtime exceeded 128MB heap memory limit.");
    this.name = "PluginRuntimeOomError";
  }
}

export class PluginCapabilityDeniedError extends Error {
  readonly code = "CAPABILITY_DENIED";
  constructor(detail: string) {
    super(`Plugin capability denied: ${detail}`);
    this.name = "PluginCapabilityDeniedError";
  }
}

export class PluginRuntimeLoadError extends Error {
  readonly code = "PLUGIN_RUNTIME_LOAD_ERROR";
  constructor(detail: string) {
    super(`Plugin runtime failed to load: ${detail}`);
    this.name = "PluginRuntimeLoadError";
  }
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_OLD_GENERATION_MB = 128;
const MAX_YOUNG_GENERATION_MB = 16;

// Resolve the worker script path. In development this is the .ts file
// (tsx handles transpilation); in production it would be a compiled .js.
function resolveWorkerPath(): string {
  return path.resolve(__dirname, "sandbox-worker.ts");
}

export async function loadSandboxedRuntime(
  input: SandboxLoadInput,
): Promise<SandboxRuntimeHandle> {
  const workerPath = resolveWorkerPath();

  const worker = new Worker(workerPath, {
    workerData: {
      installPath: input.installPath,
      runtimePath: input.runtimePath,
      capabilities: input.capabilities,
    },
    resourceLimits: {
      maxOldGenerationSizeMb: MAX_OLD_GENERATION_MB,
      maxYoungGenerationSizeMb: MAX_YOUNG_GENERATION_MB,
    },
    // Use tsx loader for .ts worker files in development
    execArgv: ["--import", "tsx"],
  });

  let alive = true;
  const pendingCalls = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void; timer: ReturnType<typeof setTimeout> }
  >();

  // Handle worker exit (OOM or crash)
  worker.on("exit", (code) => {
    alive = false;
    const error =
      code === null || code !== 0
        ? new PluginRuntimeOomError()
        : new Error(`Worker exited with code ${code}`);
    for (const pending of pendingCalls.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    pendingCalls.clear();
  });

  worker.on("error", (err) => {
    alive = false;
    for (const pending of pendingCalls.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    pendingCalls.clear();
  });

  // Handle RPC responses from the worker
  worker.on("message", (msg: unknown) => {
    if (!msg || typeof msg !== "object") return;
    const message = msg as Record<string, unknown>;

    if (message.type === "rpc_response") {
      const id = message.id as string;
      const pending = pendingCalls.get(id);
      if (!pending) return;
      pendingCalls.delete(id);
      clearTimeout(pending.timer);

      if (message.error) {
        const err = message.error as { code: string; message: string };
        if (err.code === "CAPABILITY_DENIED") {
          pending.reject(new PluginCapabilityDeniedError(err.message));
        } else {
          pending.reject(new Error(`[${err.code}] ${err.message}`));
        }
      } else {
        pending.resolve(message.result);
      }
    }
  });

  // Wait for worker to be ready and initialize the plugin
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new PluginRuntimeLoadError("Worker initialization timed out."));
    }, 10_000);

    const onMessage = (msg: unknown) => {
      if (!msg || typeof msg !== "object") return;
      const message = msg as Record<string, unknown>;

      if (message.type === "worker_ready") {
        worker.postMessage({ type: "init" });
      } else if (message.type === "init_ok") {
        clearTimeout(timeout);
        worker.off("message", onMessage);
        resolve();
      } else if (message.type === "init_error") {
        clearTimeout(timeout);
        worker.off("message", onMessage);
        reject(new PluginRuntimeLoadError(message.error as string));
      }
    };

    worker.on("message", onMessage);
  });

  const handle: SandboxRuntimeHandle = {
    get alive() {
      return alive;
    },

    async callMethod(method: string, ...args: unknown[]): Promise<unknown> {
      if (!alive) {
        throw new PluginRuntimeOomError();
      }

      const id = randomUUID();

      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingCalls.delete(id);
          worker.terminate();
          alive = false;
          reject(new PluginRuntimeTimeoutError(method));
        }, DEFAULT_TIMEOUT_MS);

        pendingCalls.set(id, { resolve, reject, timer });
        worker.postMessage({ type: "rpc", id, method, args });
      });
    },

    async dispose(): Promise<void> {
      if (alive) {
        alive = false;
        await worker.terminate();
      }
    },
  };

  return handle;
}
