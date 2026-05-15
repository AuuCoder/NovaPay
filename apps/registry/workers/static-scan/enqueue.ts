/**
 * Static scan job enqueue (Req 20.1).
 *
 * Phase 4 uses a simple in-process async queue. Production deployments
 * should replace this with BullMQ or a similar persistent job queue.
 */

import { scanBundle, type ScanResult } from "../../lib/static-scan/ast-scan";

export interface ScanJob {
  versionId: string;
  pluginSlug: string;
  files: Array<{ relativePath: string; content: string }>;
  declaredCapabilities: string[];
}

export interface ScanJobResult {
  versionId: string;
  pluginSlug: string;
  result: ScanResult;
  completedAt: Date;
}

const completedJobs: ScanJobResult[] = [];

export async function enqueueScanJob(job: ScanJob): Promise<ScanJobResult> {
  // In-process execution (phase 4 dev mode). Production would enqueue to
  // a background worker and return a job ID for polling.
  const result = scanBundle({
    files: job.files,
    declaredCapabilities: job.declaredCapabilities,
  });

  const jobResult: ScanJobResult = {
    versionId: job.versionId,
    pluginSlug: job.pluginSlug,
    result,
    completedAt: new Date(),
  };

  completedJobs.push(jobResult);
  return jobResult;
}

export function getCompletedScanJobs(): ScanJobResult[] {
  return [...completedJobs];
}
