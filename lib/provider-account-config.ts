import { isRecord } from "@/lib/payments/utils";
import {
  maskStoredSecret,
  migrateStoredSecret,
  revealStoredSecret,
  sealStoredSecret,
} from "@/lib/secret-box";

function isSensitiveProviderConfigKey(fieldName: string) {
  return /(key|secret|private|password|token|cert)/i.test(fieldName);
}

function stringifyScalar(value: unknown) {
  return typeof value === "string" ? value : String(value);
}

export function protectProviderConfigForStorage(input: unknown, existing?: unknown) {
  if (!isRecord(input)) {
    return {};
  }

  const existingRecord = isRecord(existing) ? existing : {};

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (!isSensitiveProviderConfigKey(key)) {
        return [key, value];
      }

      if (value === null) {
        return [key, null];
      }

      const submitted = stringifyScalar(value);
      const existingStored =
        existingRecord[key] === null || existingRecord[key] === undefined
          ? null
          : stringifyScalar(existingRecord[key]);
      const existingMasked = maskStoredSecret(existingStored);

      if (existingStored && submitted && existingMasked && submitted === existingMasked) {
        return [key, migrateStoredSecret(existingStored)];
      }

      if (!submitted) {
        return [key, ""];
      }

      return [key, sealStoredSecret(submitted)];
    }),
  );
}

export function migrateProviderConfigForStorage(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (!isSensitiveProviderConfigKey(key)) {
        return [key, item];
      }

      if (item === undefined || item === null) {
        return [key, item];
      }

      const raw = stringifyScalar(item);
      return [key, raw ? migrateStoredSecret(raw) : ""];
    }),
  );
}

export function revealProviderConfigForRuntime(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (item === undefined || item === null) {
        return [];
      }

      const raw = stringifyScalar(item);
      return [[key, isSensitiveProviderConfigKey(key) ? revealStoredSecret(raw) ?? "" : raw]];
    }),
  );
}

export function maskProviderConfigForDisplay(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (item === undefined || item === null) {
        return [key, item];
      }

      if (!isSensitiveProviderConfigKey(key)) {
        return [key, item];
      }

      return [key, maskStoredSecret(stringifyScalar(item)) ?? ""];
    }),
  );
}
