/**
 * POST /api/developer/plugins/:slug/versions
 *
 * Accepts a plugin bundle upload (tar.gz, zip, or JSON) as multipart
 * form-data with field name `package`. Maximum 50 MB (Req 6.1).
 *
 * The bundle is run through the full pipeline:
 *   1. Extract → parse manifest
 *   2. sha256 + object store write
 *   3. Ed25519 sign
 *   4. Create PluginVersion (state=DRAFT)
 *   5. Enqueue static scan job
 *
 * Returns: { version, sha256, signature, status: "DRAFT" }
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryDeveloperRequest } from "../../../../../../lib/auth/session";
import {
  ensurePluginOwnership,
  PluginOwnershipError,
} from "../../../../../../lib/developer/plugin-ownership";
import {
  getRegistryRuntime,
  type RegistryPaidPricingPlanKind,
  registerUploadedCatalogBundle,
} from "../../../../../../lib/runtime/state";
import { runBundlePipeline } from "../../../../../../lib/bundle/pipeline";
import { enqueueScanJob } from "../../../../../../workers/static-scan/enqueue";
import { extractBundle } from "../../../../../../lib/bundle/extract";
import { apiError } from "../../../../../../lib/api/response";

export const runtime = "nodejs";

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB
const PAID_PRICING_PLAN_KINDS = new Set<RegistryPaidPricingPlanKind>([
  "PER_INSTANCE_ONE_TIME",
  "PER_MERCHANT_SUBSCRIPTION",
  "PER_USAGE",
]);

function parsePriceAmountCents(rawValue: FormDataEntryValue | null) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return null;
  }

  const normalized = rawValue.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.round(numeric * 100);
}

function parsePriceCurrency(rawValue: FormDataEntryValue | null) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return null;
  }

  const normalized = rawValue.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireRegistryDeveloperRequest(request);
  if (auth.response) {
    return auth.response;
  }

  if (auth.actor.kind !== "SESSION" || auth.actor.session.actorKind !== "DEVELOPER") {
    return apiError(request, "DEVELOPER_ACCOUNT_REQUIRED", 403);
  }

  const { slug } = await params;

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError(request, "INVALID_FORM_DATA", 400);
  }

  const file = formData.get("package");
  if (!file || !(file instanceof Blob)) {
    return apiError(request, "MISSING_PACKAGE", 400);
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return apiError(request, "PACKAGE_TOO_LARGE", 413, {
      maxMb: MAX_UPLOAD_SIZE / 1024 / 1024,
    });
  }

  const rawBytes = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/gzip";

  const state = await getRegistryRuntime();
  const pricingModeRaw = formData.get("pricingMode");
  const pricingPlanKindRaw = formData.get("pricingPlanKind");
  const priceAmountRaw = formData.get("priceAmount");
  const priceCurrencyRaw = formData.get("priceCurrency");
  const priceLabelRaw = formData.get("priceLabel");
  const purchaseUrlRaw = formData.get("purchaseUrl");
  const pricingMode = pricingModeRaw === "PAID" ? "PAID" : "FREE";
  const pricingPlanKind =
    typeof pricingPlanKindRaw === "string" &&
    PAID_PRICING_PLAN_KINDS.has(pricingPlanKindRaw as RegistryPaidPricingPlanKind)
      ? (pricingPlanKindRaw as RegistryPaidPricingPlanKind)
      : null;
  const priceAmountCents = parsePriceAmountCents(priceAmountRaw);
  const priceCurrency = parsePriceCurrency(priceCurrencyRaw) ?? "CNY";
  const priceLabel =
    typeof priceLabelRaw === "string" && priceLabelRaw.trim()
      ? priceLabelRaw.trim()
      : null;
  const purchaseUrl =
    typeof purchaseUrlRaw === "string" && purchaseUrlRaw.trim()
      ? purchaseUrlRaw.trim()
      : null;

  if (pricingMode === "PAID") {
    if (!pricingPlanKind) {
      return apiError(request, "INVALID_PRICING_PLAN_KIND", 400);
    }

    if (!priceAmountCents) {
      return apiError(request, "INVALID_PRICE_AMOUNT", 400);
    }

    if (!parsePriceCurrency(priceCurrencyRaw) && priceCurrencyRaw !== null) {
      return apiError(request, "INVALID_PRICE_CURRENCY", 400);
    }
  }

  try {
    await ensurePluginOwnership(slug, auth.actor.session.actorId);

    // Run the bundle pipeline (extract → sha256 → store → sign)
    const pipelineResult = await runBundlePipeline(
      { rawBytes, contentType: contentType as "application/gzip" | "application/zip" | "application/json" },
      {
        objectStore: state.objectStore,
        signer: state.signer,
        keyStore: state.keyStore,
      },
    );

    // Verify the manifest slug matches the URL slug
    if (pipelineResult.manifest.slug !== slug) {
      return apiError(request, "SLUG_MISMATCH", 400, {
        manifestSlug: pipelineResult.manifest.slug,
        slug,
      });
    }

    // Enqueue static scan
    const extraction = extractBundle(rawBytes, contentType);
    await enqueueScanJob({
      versionId: `ver_${pipelineResult.sha256.slice(0, 12)}`,
      pluginSlug: slug,
      pluginVersion: pipelineResult.manifest.version,
      files: extraction.files.map((f) => ({
        relativePath: f.relativePath,
        content: f.content.toString("utf8"),
      })),
      declaredCapabilities: pipelineResult.manifest.capabilities,
    });

    registerUploadedCatalogBundle(state, {
      rawBytes,
      pipelineResult,
      pricingMode,
      pricingPlanKind: pricingMode === "PAID" ? pricingPlanKind : null,
      priceAmountCents: pricingMode === "PAID" ? priceAmountCents : null,
      priceCurrency: pricingMode === "PAID" ? priceCurrency : null,
      priceLabel,
      purchaseUrl,
    });

    return NextResponse.json({
      slug,
      version: pipelineResult.manifest.version,
      sha256: pipelineResult.sha256,
      signature: pipelineResult.signature,
      signatureKeyId: pipelineResult.signatureKeyId,
      sizeBytes: pipelineResult.sizeBytes,
      status: "DRAFT",
      alreadyExisted: pipelineResult.alreadyExisted,
    });
  } catch (error) {
    if (error instanceof PluginOwnershipError) {
      return apiError(
        request,
        error.code,
        error.code === "RESERVED_SLUG" ? 403 : 409,
      );
    }

    return apiError(request, "UPLOAD_FAILED", 400);
  }
}
