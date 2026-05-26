import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { extractBundle } from "../bundle/extract";
import type { PluginPackageManifest, VerificationProfile } from "../manifest/parse";
import type {
  PluginVersionTestSession,
  RegistryRuntimeState,
} from "../runtime/state";
import { updatePluginVersionTestSession } from "../runtime/state";

interface VerificationProviderAccountConfig {
  id: string;
  providerKey: string;
  channelCode: string;
  displayName: string;
  sourceType?: "merchant";
  merchantId?: string | null;
  callbackToken?: string | null;
  config: Record<string, string>;
  limits?: Record<string, unknown> | null;
}

interface VerificationCreatePaymentResult {
  status: "requires_action" | "processing";
  mode: "redirect" | "qr_code";
  checkoutUrl: string;
  gatewayOrderId?: string | null;
  providerStatus?: string | null;
  providerPayload: Record<string, unknown>;
}

interface VerificationPaymentProvider {
  getSummary(): {
    code: string;
    provider: "alipay" | "wxpay" | "crypto";
    displayName: string;
    description: string;
    configured: boolean;
    implementationStatus?: "ready" | "skeleton";
    capabilities: string[];
  };
  isConfigured(account?: VerificationProviderAccountConfig | null): boolean;
  createPayment(input: {
    orderId: string;
    merchant: {
      id: string;
      code: string;
      name: string;
      callbackBase: string;
    };
    amount: string;
    currency: string;
    subject: string;
    description?: string | null;
    notifyUrl?: string | null;
    returnUrl?: string | null;
    metadata?: Record<string, unknown>;
    account?: VerificationProviderAccountConfig | null;
  }): Promise<VerificationCreatePaymentResult>;
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

function assertPaymentRuntimeShape(runtime: unknown): asserts runtime is {
  provider: VerificationPaymentProvider;
} {
  if (!runtime || typeof runtime !== "object") {
    throw new Error("pluginRuntime must export an object.");
  }

  const provider = (runtime as { provider?: unknown }).provider;
  if (!provider || typeof provider !== "object") {
    throw new Error("pluginRuntime.provider is required.");
  }

  const candidate = provider as VerificationPaymentProvider;
  if (
    typeof candidate.getSummary !== "function" ||
    typeof candidate.isConfigured !== "function" ||
    typeof candidate.createPayment !== "function"
  ) {
    throw new Error(
      "pluginRuntime.provider must implement getSummary, isConfigured, and createPayment.",
    );
  }
}

async function importRuntimeFromBundle(input: {
  rawBytes: Buffer;
  manifest: PluginPackageManifest;
}) {
  const extraction = extractBundle(input.rawBytes, "application/json");
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "nvreg-plugin-verify-"));

  for (const file of extraction.files) {
    const absolutePath = path.join(tempDir, file.relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content);
  }

  const entryRelative = input.manifest.runtimeEntrypoint ?? "./runtime.js";
  const entryAbsolute = path.join(tempDir, entryRelative);
  const runtimeStat = await stat(entryAbsolute);
  const imported =
    path.extname(entryAbsolute) === ".cjs"
      ? createRequire(import.meta.url)(entryAbsolute)
      : await new Function(
          "specifier",
          "return import(specifier);",
        )(`${pathToFileURL(entryAbsolute).href}?v=${runtimeStat.mtimeMs}`);
  const runtime = unwrapRuntimeCandidate(imported);
  assertPaymentRuntimeShape(runtime);

  return {
    runtime,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

function validateRequiredConfig(
  verificationProfile: VerificationProfile,
  submittedConfig: Record<string, string>,
) {
  for (const key of verificationProfile.requiredConfigKeys) {
    const value = submittedConfig[key];
    if (!value || !value.trim()) {
      throw new Error(`Missing required verification config: ${key}`);
    }
  }
}

function assertCreatePaymentResult(
  result: VerificationCreatePaymentResult,
  verificationProfile: VerificationProfile,
) {
  const expectation = verificationProfile.expectedCreatePayment;

  if (expectation?.status?.length && !expectation.status.includes(result.status)) {
    throw new Error(
      `createPayment returned unexpected status "${result.status}".`,
    );
  }

  if (expectation?.mode?.length && !expectation.mode.includes(result.mode)) {
    throw new Error(`createPayment returned unexpected mode "${result.mode}".`);
  }

  if (expectation?.checkoutUrl === "required" && !result.checkoutUrl) {
    throw new Error("createPayment did not return checkoutUrl.");
  }
}

export async function runPaymentPluginVerification(input: {
  state: RegistryRuntimeState;
  session: PluginVersionTestSession;
}) {
  const bundle = input.state.demoBundles.get(
    `${input.session.pluginSlug}@${input.session.version}`,
  );

  if (!bundle) {
    throw new Error(
      `No bundle found for ${input.session.pluginSlug}@${input.session.version}.`,
    );
  }

  const session: PluginVersionTestSession = {
    ...input.session,
    status: "RUNNING",
    startedAt: new Date(),
    failureReason: null,
  };
  updatePluginVersionTestSession(input.state, session);

  try {
    validateRequiredConfig(session.verificationProfile, session.submittedConfig);

    const { runtime, cleanup } = await importRuntimeFromBundle({
      rawBytes: bundle.rawBytes,
      manifest: bundle.pipelineResult.manifest,
    });

    try {
      const provider = runtime.provider;
      const providerSummary = provider.getSummary();
      const account: VerificationProviderAccountConfig = {
        id: `verification_account_${randomUUID()}`,
        providerKey: providerSummary.provider,
        channelCode: providerSummary.code,
        displayName: `Verification ${providerSummary.displayName}`,
        config: session.submittedConfig,
        limits: null,
        sourceType: "merchant",
        merchantId: "verification_merchant",
        callbackToken: null,
      };

      const configured = provider.isConfigured(account);
      if (!configured) {
        throw new Error("provider.isConfigured returned false for submitted verification config.");
      }

      const createPaymentStep = session.steps.find((step) => step.stepKey === "create_payment");
      if (!createPaymentStep) {
        throw new Error("Verification session is missing create_payment step.");
      }

      createPaymentStep.status = "RUNNING";
      createPaymentStep.startedAt = new Date();

      const result = await provider.createPayment({
        orderId: `verify_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
        merchant: {
          id: "verification_merchant",
          code: "verification_merchant",
          name: "Verification Merchant",
          callbackBase: "https://registry.local/verification/callback",
        },
        amount: "99.00",
        currency: "CNY",
        subject: `Verification ${input.session.pluginSlug}`,
        description: "Registry pre-publish verification",
        notifyUrl: "https://registry.local/verification/notify",
        returnUrl: "https://registry.local/verification/return",
        metadata: {
          verificationSessionId: session.id,
        },
        account,
      });

      assertCreatePaymentResult(result, session.verificationProfile);

      createPaymentStep.status = "PASSED";
      createPaymentStep.completedAt = new Date();
      createPaymentStep.resultSnapshot = {
        status: result.status,
        mode: result.mode,
        checkoutUrl: result.checkoutUrl,
        providerStatus: result.providerStatus ?? null,
        providerPayload: result.providerPayload,
      };

      session.status = "PASSED";
      session.completedAt = new Date();
      session.resultSnapshot = {
        providerSummary,
        createPayment: createPaymentStep.resultSnapshot,
      };
      updatePluginVersionTestSession(input.state, session);
      return session;
    } finally {
      await cleanup();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const step of session.steps) {
      if (step.status === "RUNNING") {
        step.status = "FAILED";
        step.completedAt = new Date();
        step.errorMessage = message;
      }
    }
    session.status = "FAILED";
    session.completedAt = new Date();
    session.failureReason = message;
    updatePluginVersionTestSession(input.state, session);
    return session;
  }
}
