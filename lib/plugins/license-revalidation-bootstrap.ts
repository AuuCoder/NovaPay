let started = false;

/**
 * Thin runtime-only bootstrap wrapper so instrumentation can import a tiny
 * module instead of the full scheduler dependency graph during compilation.
 */
export async function bootstrapLicenseRevalidationScheduler() {
  if (started) {
    return;
  }

  started = true;

  const { startLicenseRevalidationScheduler } = await import(
    "@/lib/plugins/license-revalidation-scheduler"
  );
  startLicenseRevalidationScheduler();
}
