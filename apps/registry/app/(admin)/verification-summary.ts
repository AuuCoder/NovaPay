import type { PluginPackageManifest } from "../../lib/manifest/parse";
import type { PluginVersionTestSession } from "../../lib/runtime/state";

export type VerificationReviewStatus =
  | "OFFICIAL_EXEMPT"
  | "MISSING_PROFILE"
  | "NO_TEST"
  | "FAILED"
  | "PASSED"
  | "OTHER";

export interface VerificationSummary {
  id: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  submittedConfigKeys: string[];
  createPaymentMode: string | null;
  createPaymentStatus: string | null;
  reviewStatus: VerificationReviewStatus;
}

export function summarizeVerificationSession(input: {
  session: PluginVersionTestSession | null;
  manifest: PluginPackageManifest | null;
  officialPlugin: boolean;
}): VerificationSummary | null {
  if (input.officialPlugin) {
    if (!input.session) {
      return {
        id: "official-exempt",
        status: "EXEMPT",
        createdAt: "",
        completedAt: null,
        submittedConfigKeys: [],
        createPaymentMode: null,
        createPaymentStatus: null,
        reviewStatus: "OFFICIAL_EXEMPT",
      };
    }
  }

  if (!input.manifest?.verificationProfile) {
    return {
      id: "missing-profile",
      status: "MISSING_PROFILE",
      createdAt: "",
      completedAt: null,
      submittedConfigKeys: [],
      createPaymentMode: null,
      createPaymentStatus: null,
      reviewStatus: "MISSING_PROFILE",
    };
  }

  if (!input.session) {
    return {
      id: "no-test",
      status: "NO_TEST",
      createdAt: "",
      completedAt: null,
      submittedConfigKeys: [],
      createPaymentMode: null,
      createPaymentStatus: null,
      reviewStatus: "NO_TEST",
    };
  }

  const createPayment = input.session.resultSnapshot?.createPayment;
  const mode =
    createPayment &&
    typeof createPayment === "object" &&
    createPayment !== null &&
    "mode" in createPayment &&
    typeof createPayment.mode === "string"
      ? createPayment.mode
      : null;
  const status =
    createPayment &&
    typeof createPayment === "object" &&
    createPayment !== null &&
    "status" in createPayment &&
    typeof createPayment.status === "string"
      ? createPayment.status
      : null;

  return {
    id: input.session.id,
    status: input.session.status,
    createdAt: input.session.createdAt.toISOString(),
    completedAt: input.session.completedAt?.toISOString() ?? null,
    submittedConfigKeys: Object.keys(input.session.submittedConfig),
    createPaymentMode: mode,
    createPaymentStatus: status,
    reviewStatus:
      input.session.status === "PASSED"
        ? "PASSED"
        : input.session.status === "FAILED"
          ? "FAILED"
          : "OTHER",
  };
}

export function getVerificationRiskRank(status: VerificationReviewStatus) {
  switch (status) {
    case "MISSING_PROFILE":
      return 0;
    case "NO_TEST":
      return 1;
    case "FAILED":
      return 2;
    case "OTHER":
      return 3;
    case "PASSED":
      return 4;
    case "OFFICIAL_EXEMPT":
    default:
      return 5;
  }
}
