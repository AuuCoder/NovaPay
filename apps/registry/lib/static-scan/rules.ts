/**
 * Static scan rules for plugin bundles (Req 20.1, 20.2, 20.3).
 *
 * Defines banned API patterns and capability-vs-code consistency checks.
 * The scanner runs these rules against every .js/.mjs/.cjs/.ts file in the
 * uploaded bundle.
 */

export type FindingSeverity = "BLOCK" | "WARN" | "INFO";

export interface ScanFinding {
  code: string;
  severity: FindingSeverity;
  file: string;
  line?: number;
  message: string;
}

export interface ScanRule {
  code: string;
  severity: FindingSeverity;
  /** Regex pattern to match against file content (line by line) */
  pattern: RegExp;
  message: string;
}

export const BANNED_API_RULES: ScanRule[] = [
  {
    code: "BANNED_API_CHILD_PROCESS_EXEC",
    severity: "BLOCK",
    pattern: /child_process.*\b(exec|execSync)\b/,
    message: "Use of child_process.exec/execSync is banned in plugin code.",
  },
  {
    code: "BANNED_API_CHILD_PROCESS_SPAWN",
    severity: "BLOCK",
    pattern: /child_process.*\b(spawn|spawnSync)\b/,
    message: "Use of child_process.spawn/spawnSync is banned in plugin code.",
  },
  {
    code: "BANNED_API_EVAL",
    severity: "BLOCK",
    pattern: /\beval\s*\(/,
    message: "Use of eval() is banned in plugin code.",
  },
  {
    code: "BANNED_API_NEW_FUNCTION",
    severity: "BLOCK",
    pattern: /new\s+Function\s*\(/,
    message: "Use of new Function() is banned in plugin code.",
  },
  {
    code: "BANNED_API_FS_WRITE",
    severity: "WARN",
    pattern: /\b(writeFile|writeFileSync|appendFile|appendFileSync)\s*\(/,
    message: "Use of fs write operations is discouraged in plugin code.",
  },
  {
    code: "BANNED_API_WORKER_THREADS",
    severity: "WARN",
    pattern: /import\s*\(?.*['"]worker_threads['"]/,
    message: "Use of worker_threads is discouraged in plugin code.",
  },
];

export interface CapabilityConsistencyRule {
  code: string;
  severity: FindingSeverity;
  /** Capability that must be declared in the manifest */
  capability: string;
  /** Pattern that indicates the capability is implemented */
  implementationPattern: RegExp;
  /** Error when capability is declared but implementation is missing */
  missingImplMessage: string;
}

export const CAPABILITY_CONSISTENCY_RULES: CapabilityConsistencyRule[] = [
  {
    code: "CAPABILITY_MISMATCH_NOTIFY_CALLBACK",
    severity: "WARN",
    capability: "notify_callback",
    implementationPattern: /callbacks|pathSegment/,
    missingImplMessage:
      "Manifest declares notify_callback but no callbacks/pathSegment export found.",
  },
  {
    code: "CAPABILITY_MISMATCH_REFUND",
    severity: "WARN",
    capability: "refund",
    implementationPattern: /createRefund/,
    missingImplMessage:
      "Manifest declares refund capability but no createRefund implementation found.",
  },
];
