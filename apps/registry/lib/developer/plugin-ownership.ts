import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isOfficialPluginSlug } from "../plugins/official";

const REGISTRY_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const OWNERSHIP_STATE_FILE = path.join(
  REGISTRY_PROJECT_ROOT,
  ".tmp",
  "registry-plugin-ownership.json",
);

interface PluginOwnershipRecord {
  slug: string;
  developerId: string;
  createdAt: string;
}

interface PluginOwnershipSnapshot {
  records: PluginOwnershipRecord[];
}

export class PluginOwnershipError extends Error {
  code: "RESERVED_SLUG" | "NOT_OWNER";

  constructor(code: "RESERVED_SLUG" | "NOT_OWNER", message: string) {
    super(message);
    this.name = "PluginOwnershipError";
    this.code = code;
  }
}

function loadOwnershipState(): PluginOwnershipSnapshot {
  if (!existsSync(OWNERSHIP_STATE_FILE)) {
    return { records: [] };
  }

  try {
    return JSON.parse(readFileSync(OWNERSHIP_STATE_FILE, "utf8")) as PluginOwnershipSnapshot;
  } catch {
    return { records: [] };
  }
}

function saveOwnershipState(state: PluginOwnershipSnapshot) {
  mkdirSync(path.dirname(OWNERSHIP_STATE_FILE), { recursive: true });
  writeFileSync(OWNERSHIP_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

export function getPluginOwner(slug: string) {
  const state = loadOwnershipState();
  return state.records.find((record) => record.slug === slug)?.developerId ?? null;
}

export function listPluginOwnerships() {
  return loadOwnershipState().records.map((record) => ({ ...record }));
}

export function canDeveloperManagePlugin(slug: string, developerId: string | null) {
  if (!developerId || isOfficialPluginSlug(slug)) {
    return false;
  }

  return getPluginOwner(slug) === developerId;
}

export function ensurePluginOwnership(slug: string, developerId: string) {
  if (isOfficialPluginSlug(slug)) {
    throw new PluginOwnershipError(
      "RESERVED_SLUG",
      "The `novapay.*` namespace is reserved for official NovaPay plugins.",
    );
  }

  const state = loadOwnershipState();
  const existing = state.records.find((record) => record.slug === slug);

  if (!existing) {
    state.records.push({
      slug,
      developerId,
      createdAt: new Date().toISOString(),
    });
    saveOwnershipState(state);
    return { created: true, developerId };
  }

  if (existing.developerId !== developerId) {
    throw new PluginOwnershipError(
      "NOT_OWNER",
      "This plugin slug belongs to another developer account.",
    );
  }

  return { created: false, developerId };
}

export function assertPluginOwnership(slug: string, developerId: string) {
  if (!canDeveloperManagePlugin(slug, developerId)) {
    throw new PluginOwnershipError(
      "NOT_OWNER",
      "You can browse this plugin, but only the original publisher can manage it.",
    );
  }
}
