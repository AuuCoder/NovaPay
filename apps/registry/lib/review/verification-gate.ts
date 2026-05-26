import { isOfficialPluginSlug } from "../plugins/official";
import type { PluginPackageManifest } from "../manifest/parse";
import type { PluginVersionTestSession } from "../runtime/state";

export function requiresVerificationForPublish(slug: string) {
  return !isOfficialPluginSlug(slug);
}

export function hasPassedVerificationSession(
  sessions: PluginVersionTestSession[],
) {
  return sessions.some((session) => session.status === "PASSED");
}

export function assertVerificationSatisfied(input: {
  slug: string;
  sessions: PluginVersionTestSession[];
  manifest?: PluginPackageManifest | null;
}) {
  if (!requiresVerificationForPublish(input.slug)) {
    return;
  }

  if (!input.manifest?.verificationProfile) {
    throw new Error(
      "Third-party payment plugins must declare verificationProfile before they can proceed.",
    );
  }

  if (!hasPassedVerificationSession(input.sessions)) {
    throw new Error(
      "This version must pass publisher self-verification before it can proceed.",
    );
  }
}
