import Script from "next/script";

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

function buildGuardScript() {
  const protocols = JSON.stringify(EXTENSION_PROTOCOLS);
  const noisyMessages = JSON.stringify(KNOWN_EXTENSION_NOISE_MESSAGES);

  return `
    (() => {
      const EXTENSION_PROTOCOLS = ${protocols};
      const KNOWN_EXTENSION_NOISE_MESSAGES = ${noisyMessages};

      const isString = (value) => typeof value === "string" && value.length > 0;

      const includesExtensionProtocol = (value) =>
        isString(value) && EXTENSION_PROTOCOLS.some((protocol) => value.includes(protocol));

      const hasKnownNoiseMessage = (value) =>
        isString(value) &&
        KNOWN_EXTENSION_NOISE_MESSAGES.some((message) =>
          value.toLowerCase().includes(message),
        );

      const collectStrings = (value, depth = 0) => {
        if (depth > 2 || value == null) {
          return [];
        }

        if (typeof value === "string") {
          return [value];
        }

        if (typeof value !== "object") {
          return [];
        }

        const keys = ["message", "stack", "filename", "fileName", "sourceURL", "reason", "cause"];
        const values = [];

        for (const key of keys) {
          try {
            values.push(...collectStrings(value[key], depth + 1));
          } catch (_error) {
            // Ignore cross-origin access failures while inspecting extension rejections.
          }
        }

        return values;
      };

      const shouldIgnore = (payload) => {
        const parts = [payload.filename, payload.message, ...collectStrings(payload.error), ...collectStrings(payload.reason)]
          .filter(Boolean);
        const combined = parts.join("\\n");

        if (includesExtensionProtocol(combined)) {
          return true;
        }

        return hasKnownNoiseMessage(combined);
      };

      const swallow = (event) => {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
      };

      window.addEventListener(
        "error",
        (event) => {
          if (
            shouldIgnore({
              filename: event.filename,
              message: event.message,
              error: event.error,
            })
          ) {
            swallow(event);
          }
        },
        true,
      );

      window.addEventListener(
        "unhandledrejection",
        (event) => {
          if (
            shouldIgnore({
              message: typeof event.reason === "string" ? event.reason : "",
              reason: event.reason,
            })
          ) {
            swallow(event);
          }
        },
        true,
      );
    })();
  `;
}

export function RuntimeErrorGuard() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <Script id="runtime-error-guard" strategy="beforeInteractive">
      {buildGuardScript()}
    </Script>
  );
}
