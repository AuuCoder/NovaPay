/**
 * License revalidation scheduler (Req 13.7).
 *
 * Periodically re-runs `revalidateInstalledPluginLicenses` against all
 * paid plugins to detect REVOKED / EXPIRED licenses and disable the
 * affected MarketplacePlugin rows. Designed for single-process Node.js
 * deployments — multi-instance setups should use a coordinated cron
 * (e.g. Vercel Cron, BullMQ scheduler) and skip this in-process timer.
 *
 * Default cadence: 24 hours (configurable via env).
 *
 * Bootstrap: call `startLicenseRevalidationScheduler()` once during process
 * boot (e.g. instrumentation.ts, or from a custom server entry).
 */

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STARTUP_DELAY_MS = 60 * 1000; // wait 1 minute after boot before first run
const INTERVAL_ENV_KEYS = [
  "NOVAPAY_LICENSE_REVALIDATE_INTERVAL_MS",
  "NOVAPAY_LICENSE_REVALIDATION_INTERVAL_MS",
] as const;
const DISABLE_ENV_KEYS = [
  "NOVAPAY_DISABLE_LICENSE_SCHEDULER",
  "NOVAPAY_LICENSE_REVALIDATION_DISABLED",
] as const;

let timer: ReturnType<typeof setInterval> | null = null;
let runInFlight = false;
let lastRunAt: Date | null = null;
let lastRunResult: { inspected: number; disabled: number } | null = null;
let lastRunError: string | null = null;

export interface SchedulerStatus {
  running: boolean;
  intervalMs: number;
  lastRunAt: Date | null;
  lastRunResult: { inspected: number; disabled: number } | null;
  lastRunError: string | null;
}

function getIntervalMs(): number {
  const raw = INTERVAL_ENV_KEYS
    .map((key) => process.env[key])
    .find((value) => value && value.trim());
  if (!raw) return DEFAULT_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 60_000) {
    console.warn(
      `[license-scheduler] Invalid license revalidation interval=${raw}, ` +
        `falling back to ${DEFAULT_INTERVAL_MS}ms.`,
    );
    return DEFAULT_INTERVAL_MS;
  }
  return parsed;
}

async function runOnce(): Promise<void> {
  if (runInFlight) {
    // Skip overlapping runs — the previous one is still going.
    return;
  }
  runInFlight = true;
  try {
    const { revalidateInstalledPluginLicenses } = await import(
      "@/lib/plugins/marketplace"
    );
    const result = await revalidateInstalledPluginLicenses();
    lastRunAt = new Date();
    lastRunResult = result;
    lastRunError = null;
    if (result.disabled > 0) {
      console.warn(
        `[license-scheduler] Disabled ${result.disabled}/${result.inspected} plugins due to invalid licenses.`,
      );
    }
  } catch (err) {
    lastRunAt = new Date();
    lastRunError = err instanceof Error ? err.message : String(err);
    console.error("[license-scheduler] Revalidation failed:", err);
  } finally {
    runInFlight = false;
  }
}

/**
 * Starts the scheduler. Idempotent — calling twice is a no-op.
 * Returns immediately; the first run is delayed by STARTUP_DELAY_MS.
 */
export function startLicenseRevalidationScheduler(): void {
  if (timer) return;

  if (DISABLE_ENV_KEYS.some((key) => process.env[key] === "1")) {
    console.log("[license-scheduler] Disabled via environment flag.");
    return;
  }

  const intervalMs = getIntervalMs();
  console.log(
    `[license-scheduler] Starting with interval ${intervalMs}ms ` +
      `(first run in ${STARTUP_DELAY_MS}ms).`,
  );

  // Schedule first run after a short delay so it doesn't block boot.
  setTimeout(() => {
    void runOnce();
  }, STARTUP_DELAY_MS);

  timer = setInterval(() => {
    void runOnce();
  }, intervalMs);

  // Don't keep the process alive if everything else is idle.
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

export function stopLicenseRevalidationScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getSchedulerStatus(): SchedulerStatus {
  return {
    running: timer !== null,
    intervalMs: getIntervalMs(),
    lastRunAt,
    lastRunResult,
    lastRunError,
  };
}

/**
 * Manually trigger a revalidation run (for admin actions / debugging).
 * Returns the run result; throws if already in flight.
 */
export async function triggerLicenseRevalidationNow(): Promise<{
  inspected: number;
  disabled: number;
}> {
  if (runInFlight) {
    throw new Error("Revalidation is already in progress.");
  }
  await runOnce();
  if (lastRunError) {
    throw new Error(lastRunError);
  }
  return lastRunResult ?? { inspected: 0, disabled: 0 };
}
