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
import { getRegistryRuntime } from "../../../../../../lib/runtime/state";
import { runBundlePipeline } from "../../../../../../lib/bundle/pipeline";
import { enqueueScanJob } from "../../../../../../workers/static-scan/enqueue";
import { extractBundle } from "../../../../../../lib/bundle/extract";

export const runtime = "nodejs";

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "INVALID_FORM_DATA", message: "Request must be multipart/form-data." },
      { status: 400 },
    );
  }

  const file = formData.get("package");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "MISSING_PACKAGE", message: "Field 'package' (file) is required." },
      { status: 400 },
    );
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json(
      { error: "PACKAGE_TOO_LARGE", message: `Package exceeds ${MAX_UPLOAD_SIZE / 1024 / 1024} MB limit.` },
      { status: 413 },
    );
  }

  const rawBytes = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/gzip";

  const state = await getRegistryRuntime();

  try {
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
      return NextResponse.json(
        {
          error: "SLUG_MISMATCH",
          message: `Manifest slug "${pipelineResult.manifest.slug}" does not match URL slug "${slug}".`,
        },
        { status: 400 },
      );
    }

    // Enqueue static scan
    const extraction = extractBundle(rawBytes, contentType);
    await enqueueScanJob({
      versionId: `ver_${pipelineResult.sha256.slice(0, 12)}`,
      pluginSlug: slug,
      files: extraction.files.map((f) => ({
        relativePath: f.relativePath,
        content: f.content.toString("utf8"),
      })),
      declaredCapabilities: pipelineResult.manifest.capabilities,
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
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "UPLOAD_FAILED", message },
      { status: 400 },
    );
  }
}
