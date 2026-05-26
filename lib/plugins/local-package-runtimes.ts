import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  readPluginPackageManifestFile,
  type LocalPluginPackageManifest,
} from "@/lib/plugins/local-package-manifests";
import type {
  LocalizedText,
  MerchantChannelFieldDefinitionInput,
  PaymentPluginDefinition,
} from "@/lib/payments/plugins/types";
import type { PaymentProvider } from "@/lib/payments/types";

export interface LocalPaymentPluginRuntimeModule {
  provider: PaymentProvider;
  adminOption: {
    title: LocalizedText;
    detail: LocalizedText;
  };
  merchantTemplate: {
    title: LocalizedText;
    description: LocalizedText;
    fields: MerchantChannelFieldDefinitionInput[];
  };
  callbacks?: {
    pathSegment: string;
  };
}

export interface LocalPaymentPluginRuntimeInspection {
  definition: PaymentPluginDefinition | null;
  runnable: boolean;
  loadError: string | null;
}

function unwrapRuntimeCandidate(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;

  if (record.pluginRuntime) {
    return record.pluginRuntime;
  }

  if (record.default) {
    return unwrapRuntimeCandidate(record.default);
  }

  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLocalizedText(value: unknown): value is LocalizedText {
  return (
    typeof value === "object" &&
    value !== null &&
    "zh" in value &&
    "en" in value &&
    isNonEmptyString((value as { zh?: unknown }).zh) &&
    isNonEmptyString((value as { en?: unknown }).en)
  );
}

function isMerchantFieldArray(
  value: unknown,
): value is MerchantChannelFieldDefinitionInput[] {
  return Array.isArray(value);
}

function assertRuntimeModuleShape(
  manifest: LocalPluginPackageManifest,
  runtime: unknown,
): asserts runtime is LocalPaymentPluginRuntimeModule {
  if (!runtime || typeof runtime !== "object") {
    throw new Error("runtime module must export an object.");
  }

  const candidate = runtime as Record<string, unknown>;

  if (!candidate.provider || typeof candidate.provider !== "object") {
    throw new Error("runtime.provider is required.");
  }

  const provider = candidate.provider as PaymentProvider;

  if (
    typeof provider.getSummary !== "function" ||
    typeof provider.isConfigured !== "function" ||
    typeof provider.createPayment !== "function"
  ) {
    throw new Error(
      "runtime.provider must implement getSummary, isConfigured, and createPayment.",
    );
  }

  if (
    !candidate.adminOption ||
    typeof candidate.adminOption !== "object" ||
    !isLocalizedText((candidate.adminOption as { title?: unknown }).title) ||
    !isLocalizedText((candidate.adminOption as { detail?: unknown }).detail)
  ) {
    throw new Error("runtime.adminOption with localized title/detail is required.");
  }

  if (
    !candidate.merchantTemplate ||
    typeof candidate.merchantTemplate !== "object" ||
    !isLocalizedText((candidate.merchantTemplate as { title?: unknown }).title) ||
    !isLocalizedText((candidate.merchantTemplate as { description?: unknown }).description) ||
    !isMerchantFieldArray((candidate.merchantTemplate as { fields?: unknown }).fields)
  ) {
    throw new Error(
      "runtime.merchantTemplate with localized title/description and fields is required.",
    );
  }

  if (candidate.callbacks !== undefined) {
    if (
      typeof candidate.callbacks !== "object" ||
      candidate.callbacks === null ||
      !isNonEmptyString((candidate.callbacks as { pathSegment?: unknown }).pathSegment)
    ) {
      throw new Error("runtime.callbacks.pathSegment must be a non-empty string.");
    }
  }

  const summary = provider.getSummary();

  if (summary.code !== manifest.channelCode) {
    throw new Error(
      `runtime provider summary code ${summary.code} does not match manifest channelCode ${manifest.channelCode}.`,
    );
  }

  if (summary.provider !== manifest.providerKey) {
    throw new Error(
      `runtime provider summary provider ${summary.provider} does not match manifest providerKey ${manifest.providerKey}.`,
    );
  }

  if (
    manifest.source === "LOCAL_PACKAGE" &&
    (manifest.supportsCallbackRoute || candidate.callbacks !== undefined)
  ) {
    throw new Error(
      "Third-party local plugin runtime callbacks are not supported yet in the current runnable stage.",
    );
  }
}

async function importLocalRuntimeModule(
  manifest: LocalPluginPackageManifest,
): Promise<unknown> {
  if (!manifest.runtimePath) {
    throw new Error("runtimeEntrypoint is missing.");
  }

  const runtimeStat = await stat(manifest.runtimePath);
  const runtimeUrl = `${pathToFileURL(manifest.runtimePath).href}?v=${runtimeStat.mtimeMs}`;
  const imported = (await new Function(
    "specifier",
    "return import(specifier);",
  )(runtimeUrl)) as Record<string, unknown>;

  return unwrapRuntimeCandidate(imported);
}

export async function loadLocalPaymentPluginRuntimeInspection(
  manifest: LocalPluginPackageManifest,
): Promise<LocalPaymentPluginRuntimeInspection> {
  if (!manifest.runtimePath) {
    return {
      definition: null,
      runnable: false,
      loadError: null,
    };
  }

  try {
    const runtime = await importLocalRuntimeModule(manifest);
    assertRuntimeModuleShape(manifest, runtime);

    const definition: PaymentPluginDefinition = {
      channelCode: manifest.channelCode,
      providerKey: manifest.providerKey,
      provider: runtime.provider,
      marketplace: {
        slug: manifest.slug,
        packageName: manifest.packageName,
        vendor: manifest.vendor,
        version: manifest.version,
        category: manifest.category,
        summary: manifest.summary,
        description: manifest.detail,
      },
      adminOption: runtime.adminOption,
      merchantTemplate: {
        title: runtime.merchantTemplate.title,
        description: runtime.merchantTemplate.description,
        requiresMerchantProfileCompletion:
          manifest.requiresMerchantProfileCompletion,
        fields: runtime.merchantTemplate.fields,
      },
      callbacks: runtime.callbacks,
    };

    const implementationStatus =
      definition.provider.getSummary().implementationStatus ?? "skeleton";
    const runnable = implementationStatus === "ready";

    return {
      definition,
      runnable,
      loadError: runnable
        ? null
        : "Runtime adapter loaded, but implementationStatus is not ready.",
    };
  } catch (error) {
    return {
      definition: null,
      runnable: false,
      loadError: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function loadPaymentPluginRuntimeInspectionFromManifestPath(
  manifestPath: string,
  source: LocalPluginPackageManifest["source"],
) {
  const manifest = await readPluginPackageManifestFile(manifestPath, source);

  // Req 21.1: REMOTE_SIGNED plugins load through the worker_threads sandbox
  // only when the sandbox feature flag is explicitly enabled. Other sources
  // (LOCAL_PACKAGE, BUILTIN) and the default REMOTE_SIGNED path continue
  // using the direct import path.
  if (
    source === "REMOTE_SIGNED" &&
    process.env.NOVAPAY_PLUGIN_SANDBOX_ENABLED === "1"
  ) {
    return {
      manifest,
      inspection: await loadSandboxedPaymentPluginRuntimeInspection(manifest),
    };
  }

  return {
    manifest,
    inspection: await loadLocalPaymentPluginRuntimeInspection(manifest),
  };
}

/**
 * Loads a REMOTE_SIGNED plugin through the worker_threads sandbox (Req 21.1).
 * Returns the same inspection shape as `loadLocalPaymentPluginRuntimeInspection`
 * so callers don't need to branch.
 */
async function loadSandboxedPaymentPluginRuntimeInspection(
  manifest: LocalPluginPackageManifest,
): Promise<LocalPaymentPluginRuntimeInspection> {
  if (!manifest.runtimePath) {
    return { definition: null, runnable: false, loadError: null };
  }

  try {
    const { loadSandboxedRuntime } = await import("@/lib/plugins/sandbox-runtime");
    const handle = await loadSandboxedRuntime({
      installPath: manifest.localPath.replace(/\/plugin\.json$/, ""),
      runtimePath: manifest.runtimePath,
      capabilities: manifest.capabilities,
    });

    // Probe the provider to check if it's runnable
    const summary = (await handle.callMethod("getSummary")) as {
      implementationStatus?: string;
    } | null;

    await handle.dispose();

    const implementationStatus = summary?.implementationStatus ?? "skeleton";
    const runnable = implementationStatus === "ready";

    // We don't construct a full PaymentPluginDefinition here because the
    // sandbox handle is disposed. The marketplace.ts layer will re-create
    // a handle when it needs to call createPayment/closePayment at runtime.
    return {
      definition: null, // Sandbox plugins get their definition resolved at call time
      runnable,
      loadError: runnable
        ? null
        : "Sandbox runtime loaded, but implementationStatus is not ready.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      definition: null,
      runnable: false,
      loadError: `Sandbox load failed: ${message}`,
    };
  }
}
