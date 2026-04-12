import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ENTRY_FILE_NAMES = new Set(["page.tsx", "layout.tsx", "not-found.tsx", "error.tsx"]);
const LOCALE_GUARD = /getCurrentLocale|pickByLocale/;

function collectEntryFiles(directory: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectEntryFiles(fullPath));
      continue;
    }

    if (ENTRY_FILE_NAMES.has(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

test("all app entry files are locale-aware", () => {
  const appDir = path.join(process.cwd(), "app");
  const entryFiles = collectEntryFiles(appDir);
  const missingLocaleGuard = entryFiles
    .filter((filePath) => !LOCALE_GUARD.test(readFileSync(filePath, "utf8")))
    .map((filePath) => path.relative(process.cwd(), filePath))
    .sort();

  assert.deepEqual(
    missingLocaleGuard,
    [],
    [
      "The following app entry files are missing a locale guard.",
      "Each page/layout entry should explicitly use `getCurrentLocale` or `pickByLocale`.",
      ...missingLocaleGuard.map((filePath) => `- ${filePath}`),
    ].join("\n"),
  );
});
