import { readFileSync } from "node:fs";
import process from "node:process";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(argv: string[]) {
  const args: {
    url?: string;
    file?: string;
    pick?: string;
    source?: string;
    channelCode?: string;
    collectorSecret?: string;
    dryRun: boolean;
    overrides: Record<string, string>;
  } = {
    dryRun: false,
    overrides: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--url") {
      args.url = argv[index + 1];
      index += 1;
      continue;
    }

    if (current === "--file") {
      args.file = argv[index + 1];
      index += 1;
      continue;
    }

    if (current === "--pick") {
      args.pick = argv[index + 1];
      index += 1;
      continue;
    }

    if (current === "--source") {
      args.source = argv[index + 1];
      index += 1;
      continue;
    }

    if (current === "--channel-code") {
      args.channelCode = argv[index + 1];
      index += 1;
      continue;
    }

    if (current === "--collector-secret") {
      args.collectorSecret = argv[index + 1];
      index += 1;
      continue;
    }

    if (current === "--set") {
      const assignment = argv[index + 1] ?? "";
      const separator = assignment.indexOf("=");
      if (separator === -1) {
        throw new Error("--set expects key=value");
      }
      const key = assignment.slice(0, separator).trim();
      const value = assignment.slice(separator + 1).trim();
      if (!key) {
        throw new Error("--set key cannot be empty");
      }
      args.overrides[key] = value;
      index += 1;
      continue;
    }

    if (current === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (current === "--help" || current === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`unknown argument: ${current}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node --import tsx scripts/post-ctf-bill.ts --url <capture-url> [--file bill.json] [--pick data.rows.0] [--source xxx] [--channel-code ctf.alipay.monitor] [--collector-secret secret] [--set key=value] [--dry-run]

Examples:
  node --import tsx scripts/post-ctf-bill.ts \\
    --url http://localhost:3000/api/ctf/bill-capture/<accountId>/<token> \\
    --file artifacts/alipay-bill.json

  node --import tsx scripts/post-ctf-bill.ts \\
    --url http://localhost:3000/api/ctf/bill-capture/<accountId>/<token> \\
    --file artifacts/export.json \\
    --pick data.list.0 \\
    --source frida-alipay-sandbox \\
    --set remark=ORDER-20260622-001
`);
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function tryAutoSelect(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  if (!isRecord(value)) {
    return value;
  }

  const directArrayKeys = ["rows", "bills", "list", "items", "records", "data"];
  for (const key of directArrayKeys) {
    const current = value[key];
    if (Array.isArray(current)) {
      return current[0] ?? null;
    }
  }

  if (isRecord(value.data)) {
    return tryAutoSelect(value.data);
  }

  return value;
}

function pickByPath(value: unknown, path: string) {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (Array.isArray(current)) {
        const index = Number(segment);
        return Number.isInteger(index) ? current[index] : undefined;
      }

      if (isRecord(current)) {
        return current[segment];
      }

      return undefined;
    }, value);
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, current]) => current !== undefined)
        .map(([key, current]) => [key, toJsonValue(current)]),
    );
  }

  return String(value);
}

function buildPayload(input: unknown, options: ReturnType<typeof parseArgs>) {
  const selected = options.pick ? pickByPath(input, options.pick) : tryAutoSelect(input);

  if (!isRecord(selected)) {
    throw new Error("selected payload is not a JSON object");
  }

  const payload: Record<string, JsonValue> = {
    ...Object.fromEntries(
      Object.entries(selected)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, toJsonValue(value)]),
    ),
  };

  if (options.source) {
    payload.source = options.source;
  }

  if (options.channelCode) {
    payload.channelCode = options.channelCode;
  }

  for (const [key, value] of Object.entries(options.overrides)) {
    payload[key] = value;
  }

  return payload;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.url) {
    throw new Error("--url is required");
  }

  const raw = options.file
    ? readFileSync(options.file, "utf8")
    : process.stdin.isTTY
      ? ""
      : await readStdin();

  if (!raw.trim()) {
    throw new Error("no JSON input found; pass --file or pipe stdin");
  }

  const parsed = JSON.parse(raw) as unknown;
  const payload = buildPayload(parsed, options);

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "dry-run",
          url: options.url,
          payload,
        },
        null,
        2,
      ),
    );
    return;
  }

  const response = await fetch(options.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.collectorSecret
        ? {
            "x-ctf-capture-secret": options.collectorSecret,
          }
        : {}),
    },
    body: JSON.stringify(payload),
  });

  const responseBody = (await response.json().catch(async () => ({ text: await response.text() }))) as unknown;

  console.log(
    JSON.stringify(
      {
        request: {
          url: options.url,
          payload,
        },
        response: {
          status: response.status,
          ok: response.ok,
          body: responseBody,
        },
      },
      null,
      2,
    ),
  );

  if (!response.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
