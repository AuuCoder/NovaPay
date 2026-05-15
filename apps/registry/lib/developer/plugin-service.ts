/**
 * Developer plugin & version management service (Req 6, 9.1).
 *
 * Provides the business logic for creating plugins, uploading versions,
 * submitting for review, and querying version status. Route handlers
 * delegate to these functions after authentication.
 */

import { randomUUID } from "node:crypto";
import { compare as semverCompare, valid as semverValid } from "../semver-lite";

export interface PluginCreateInput {
  developerId: string;
  slug: string;
  channelCode: string;
  providerKey: string;
  packageName: string;
  displayName: string;
  vendor: string;
  description: string;
  pricingMode: "FREE" | "PAID";
}

export interface PluginRecordSummary {
  id: string;
  slug: string;
  channelCode: string;
  displayName: string;
  vendor: string;
  pricingMode: "FREE" | "PAID";
  latestVersion: string | null;
  publishedVersion: string | null;
  createdAt: Date;
}

export interface VersionUploadResult {
  versionId: string;
  version: string;
  sha256: string;
  status: "DRAFT";
}

export type PluginServiceErrorCode =
  | "SLUG_OR_CHANNEL_CONFLICT"
  | "PLUGIN_NOT_FOUND"
  | "NOT_PLUGIN_OWNER"
  | "VERSION_NOT_FOUND"
  | "SEMVER_INVALID"
  | "SEMVER_NOT_INCREMENTED"
  | "ACCOUNT_NOT_VERIFIED"
  | "INVALID_TRANSITION";

export interface PluginServiceError {
  errorCode: PluginServiceErrorCode;
  message: string;
}

export interface PluginStore {
  findBySlug(slug: string): Promise<PluginRecordSummary | null>;
  findByChannelCode(channelCode: string): Promise<PluginRecordSummary | null>;
  create(input: PluginCreateInput & { id: string; createdAt: Date }): Promise<PluginRecordSummary>;
  listByDeveloper(developerId: string): Promise<PluginRecordSummary[]>;
  getLatestVersion(pluginId: string): Promise<string | null>;
  updateLatestVersion(pluginId: string, version: string): Promise<void>;
}

export function validateSlugOwnership(
  plugin: PluginRecordSummary | null,
  developerId: string,
): PluginServiceError | null {
  // In phase 2 we don't have developerId on PluginRecordSummary yet
  // (it's in the full DB record). This is a placeholder for the ownership check.
  return null;
}

export async function createPlugin(
  input: PluginCreateInput,
  store: PluginStore,
): Promise<PluginRecordSummary | PluginServiceError> {
  const existingSlug = await store.findBySlug(input.slug);
  if (existingSlug) {
    return { errorCode: "SLUG_OR_CHANNEL_CONFLICT", message: `Slug already exists: ${input.slug}` };
  }

  const existingChannel = await store.findByChannelCode(input.channelCode);
  if (existingChannel) {
    return { errorCode: "SLUG_OR_CHANNEL_CONFLICT", message: `Channel code already exists: ${input.channelCode}` };
  }

  return store.create({
    ...input,
    id: randomUUID(),
    createdAt: new Date(),
  });
}

export function validateVersionIncrement(
  currentLatest: string | null,
  newVersion: string,
): PluginServiceError | null {
  if (!semverValid(newVersion)) {
    return { errorCode: "SEMVER_INVALID", message: `Invalid semver: ${newVersion}` };
  }

  if (currentLatest && semverCompare(newVersion, currentLatest) <= 0) {
    return {
      errorCode: "SEMVER_NOT_INCREMENTED",
      message: `New version ${newVersion} must be greater than current latest ${currentLatest}.`,
    };
  }

  return null;
}

export function isPluginServiceError(value: unknown): value is PluginServiceError {
  return (
    typeof value === "object" &&
    value !== null &&
    "errorCode" in value &&
    "message" in value
  );
}
