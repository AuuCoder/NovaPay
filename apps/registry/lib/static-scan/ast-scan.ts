/**
 * Static scanner engine (Req 20.1, 20.2, 20.3).
 *
 * Scans plugin bundle files against banned API rules and capability
 * consistency rules. Uses simple regex-based line scanning (not full AST)
 * for phase 4 — sufficient to catch obvious violations. A full AST parser
 * (e.g. @babel/parser) can be swapped in later for deeper analysis.
 */

import {
  BANNED_API_RULES,
  CAPABILITY_CONSISTENCY_RULES,
  type ScanFinding,
  type ScanRule,
  type CapabilityConsistencyRule,
} from "./rules";

export interface ScanInput {
  /** Files to scan: { relativePath, content } */
  files: Array<{ relativePath: string; content: string }>;
  /** Capabilities declared in the manifest */
  declaredCapabilities: string[];
}

export interface ScanResult {
  findings: ScanFinding[];
  hasBlockers: boolean;
  scannedFileCount: number;
}

const SCANNABLE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts"]);

function isScannable(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf("."));
  return SCANNABLE_EXTENSIONS.has(ext);
}

function scanFileAgainstRules(
  filePath: string,
  content: string,
  rules: ScanRule[],
): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        findings.push({
          code: rule.code,
          severity: rule.severity,
          file: filePath,
          line: i + 1,
          message: rule.message,
        });
      }
    }
  }

  return findings;
}

function checkCapabilityConsistency(
  allContent: string,
  declaredCapabilities: string[],
  rules: CapabilityConsistencyRule[],
): ScanFinding[] {
  const findings: ScanFinding[] = [];

  for (const rule of rules) {
    const declared = declaredCapabilities.includes(rule.capability);
    if (declared && !rule.implementationPattern.test(allContent)) {
      findings.push({
        code: rule.code,
        severity: rule.severity,
        file: "(bundle-wide)",
        message: rule.missingImplMessage,
      });
    }
  }

  return findings;
}

export function scanBundle(input: ScanInput): ScanResult {
  const findings: ScanFinding[] = [];
  let scannedFileCount = 0;
  let allContent = "";

  for (const file of input.files) {
    if (!isScannable(file.relativePath)) continue;
    scannedFileCount += 1;
    allContent += file.content + "\n";

    const fileFindings = scanFileAgainstRules(
      file.relativePath,
      file.content,
      BANNED_API_RULES,
    );
    findings.push(...fileFindings);
  }

  // Capability consistency checks run against the concatenated content
  const capFindings = checkCapabilityConsistency(
    allContent,
    input.declaredCapabilities,
    CAPABILITY_CONSISTENCY_RULES,
  );
  findings.push(...capFindings);

  const hasBlockers = findings.some((f) => f.severity === "BLOCK");

  return { findings, hasBlockers, scannedFileCount };
}
