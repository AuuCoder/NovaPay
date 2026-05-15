/**
 * Deterministic pretty-printer for `plugin.json` manifests.
 *
 * Round-trip guarantee:
 *   parse(prettyPrint(parse(raw))) ≡ parse(raw)
 * where equality ignores the internal-only fields `source` and `rawJson`.
 *
 * Output rules:
 *   - UTF-8 JSON, default 2-space indent, trailing newline.
 *   - Field order is fixed (see FIELD_ORDER below) so identical inputs yield
 *     byte-identical outputs.
 *   - Internal fields `source` and `rawJson` are NEVER emitted.
 *   - `runtimeEntrypoint` is only emitted when non-null; omitting it preserves
 *     `parsePluginPackageManifest` semantics (it treats missing entrypoint as
 *     null).
 */

import type { PluginPackageManifest } from "./parse";

export interface PrettyPrintOptions {
  /**
   * Optional indent override; default 2.
   */
  indent?: number;
}

/**
 * Canonical field order for the rendered plugin.json. Adding a new field here
 * is the only place required to extend the printer; consumers must keep this
 * list in sync with the parser's accepted field set.
 */
const FIELD_ORDER = [
  "manifestVersion",
  "slug",
  "kind",
  "channelCode",
  "providerKey",
  "packageName",
  "displayName",
  "vendor",
  "description",
  "version",
  "capabilities",
  "category",
  "summary",
  "detail",
  "supportsCallbackRoute",
  "requiresMerchantProfileCompletion",
  "runtimeEntrypoint",
] as const;

type RenderableKey = (typeof FIELD_ORDER)[number];

function pickRenderableValue(
  manifest: PluginPackageManifest,
  key: RenderableKey,
): unknown {
  switch (key) {
    case "manifestVersion":
      return manifest.manifestVersion;
    case "slug":
      return manifest.slug;
    case "kind":
      return manifest.kind;
    case "channelCode":
      return manifest.channelCode;
    case "providerKey":
      return manifest.providerKey;
    case "packageName":
      return manifest.packageName;
    case "displayName":
      return manifest.displayName;
    case "vendor":
      return manifest.vendor;
    case "description":
      return manifest.description;
    case "version":
      return manifest.version;
    case "capabilities":
      // Defensive copy so callers cannot mutate our intermediate structure.
      return [...manifest.capabilities];
    case "category":
      return { zh: manifest.category.zh, en: manifest.category.en };
    case "summary":
      return { zh: manifest.summary.zh, en: manifest.summary.en };
    case "detail":
      return { zh: manifest.detail.zh, en: manifest.detail.en };
    case "supportsCallbackRoute":
      return manifest.supportsCallbackRoute;
    case "requiresMerchantProfileCompletion":
      return manifest.requiresMerchantProfileCompletion;
    case "runtimeEntrypoint":
      // Sentinel: caller drops null entries before serialization.
      return manifest.runtimeEntrypoint;
  }
}

export function prettyPrintPluginPackageManifest(
  manifest: PluginPackageManifest,
  options: PrettyPrintOptions = {},
): string {
  const indent = options.indent ?? 2;

  const ordered: Record<string, unknown> = {};

  for (const key of FIELD_ORDER) {
    const value = pickRenderableValue(manifest, key);

    if (key === "runtimeEntrypoint" && value === null) {
      continue;
    }

    ordered[key] = value;
  }

  return `${JSON.stringify(ordered, null, indent)}\n`;
}
