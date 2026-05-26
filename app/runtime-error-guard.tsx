"use client";

import { useEffect } from "react";

const EXTENSION_PROTOCOLS = [
  "chrome-extension://",
  "moz-extension://",
  "safari-web-extension://",
];

const KNOWN_EXTENSION_NOISE_MESSAGES = [
  "origin not allowed",
  "missing or invalid origin",
  "unauthorized origin",
];

const isString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const includesExtensionProtocol = (value: string) =>
  EXTENSION_PROTOCOLS.some((protocol) => value.includes(protocol));

const hasKnownNoiseMessage = (value: string) =>
  KNOWN_EXTENSION_NOISE_MESSAGES.some((message) =>
    value.toLowerCase().includes(message),
  );

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 2 || value == null) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (typeof value !== "object") {
    return [];
  }

  const keys = [
    "message",
    "stack",
    "filename",
    "fileName",
    "sourceURL",
    "reason",
    "cause",
  ] as const;
  const values: string[] = [];
  const record = value as Record<string, unknown>;

  for (const key of keys) {
    try {
      values.push(...collectStrings(record[key], depth + 1));
    } catch {
      // Ignore cross-origin access failures while inspecting extension rejections.
    }
  }

  return values;
}

function shouldIgnore(payload: {
  filename?: string;
  message?: string;
  error?: unknown;
  reason?: unknown;
}) {
  const parts = [
    payload.filename,
    payload.message,
    ...collectStrings(payload.error),
    ...collectStrings(payload.reason),
  ].filter(isString);
  const combined = parts.join("\n");

  if (includesExtensionProtocol(combined)) {
    return true;
  }

  return hasKnownNoiseMessage(combined);
}

function swallow(event: Event) {
  event.preventDefault?.();
  event.stopImmediatePropagation?.();
  event.stopPropagation?.();
}

export function RuntimeErrorGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const handleError = (event: ErrorEvent) => {
      if (
        shouldIgnore({
          filename: event.filename,
          message: event.message,
          error: event.error,
        })
      ) {
        swallow(event);
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (
        shouldIgnore({
          message: typeof event.reason === "string" ? event.reason : "",
          reason: event.reason,
        })
      ) {
        swallow(event);
      }
    };

    window.addEventListener("error", handleError, true);
    window.addEventListener("unhandledrejection", handleUnhandledRejection, true);

    return () => {
      window.removeEventListener("error", handleError, true);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
        true,
      );
    };
  }, []);

  return null;
}
