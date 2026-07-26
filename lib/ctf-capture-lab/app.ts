import { createHmac, randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { normalizePaymentChannelCode } from "@/lib/payments/channel-codes";
import { formatAmount, isRecord } from "@/lib/payments/utils";

const LAB_STATE_SYMBOL = Symbol.for("novapay.ctf.capture.lab.state");
const LAB_SESSION_MAX_AGE_MS = 60 * 60 * 1_000;
const LAB_SIGNATURE_MAX_AGE_MS = 10 * 60 * 1_000;
const MAX_BILLS_PER_SESSION = 50;

export interface CtfCaptureLabSession {
  sessionId: string;
  deviceId: string;
  deviceSecret: string;
  createdAt: Date;
}

export interface CtfCaptureLabBill {
  channelCode: "ctf.alipay.monitor" | "ctf.wxpay.monitor";
  amount: string;
  currency: "CNY";
  paidAt: Date;
  externalBillId: string;
  payerAccount: string;
  remark: string;
  source: string;
}

interface CtfCaptureLabState {
  sessions: Map<string, CtfCaptureLabSession>;
  bills: Map<string, CtfCaptureLabBill[]>;
}

declare global {
  // eslint-disable-next-line no-var
  var __NOVAPAY_CTF_CAPTURE_LAB_STATE__: CtfCaptureLabState | undefined;
}

function getState(): CtfCaptureLabState {
  const globalWithState = globalThis as typeof globalThis & {
    [LAB_STATE_SYMBOL]?: CtfCaptureLabState;
  };

  if (!globalWithState[LAB_STATE_SYMBOL]) {
    globalWithState[LAB_STATE_SYMBOL] = {
      sessions: new Map(),
      bills: new Map(),
    };
  }

  return globalWithState[LAB_STATE_SYMBOL];
}

function randomId(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

function normalizeLabChannelCode(input: unknown): CtfCaptureLabBill["channelCode"] {
  const normalized = normalizePaymentChannelCode(String(input ?? "ctf.alipay.monitor"));

  if (normalized === "ctf.wxpay.monitor" || normalized === "wxpay") {
    return "ctf.wxpay.monitor";
  }

  if (normalized === "ctf.alipay.monitor" || normalized === "alipay") {
    return "ctf.alipay.monitor";
  }

  throw new AppError(
    "CTF_LAB_CHANNEL_UNSUPPORTED",
    `Unsupported CTF lab channel: ${String(input ?? "")}`,
    400,
  );
}

function readString(record: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return fallback;
}

export function createCtfCaptureLabSession(input?: { deviceId?: string | null }) {
  const session: CtfCaptureLabSession = {
    sessionId: randomId("lab_sess"),
    deviceId: input?.deviceId?.trim() || randomId("lab_device"),
    deviceSecret: randomBytes(16).toString("hex"),
    createdAt: new Date(),
  };

  const state = getState();
  state.sessions.set(session.sessionId, session);
  state.bills.set(session.sessionId, []);

  return session;
}

export function getCtfCaptureLabSession(sessionId: string | null | undefined) {
  if (!sessionId) {
    return null;
  }

  const session = getState().sessions.get(sessionId) ?? null;
  if (!session) {
    return null;
  }

  if (Date.now() - session.createdAt.getTime() > LAB_SESSION_MAX_AGE_MS) {
    getState().sessions.delete(sessionId);
    getState().bills.delete(sessionId);
    return null;
  }

  return session;
}

export function buildCtfCaptureLabSignature(input: {
  secret: string;
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  body: string;
}) {
  return createHmac("sha256", input.secret)
    .update(
      [
        input.method.toUpperCase(),
        input.path,
        input.timestamp,
        input.nonce,
        input.body,
      ].join("\n"),
      "utf8",
    )
    .digest("hex");
}

export function verifyCtfCaptureLabSignedRequest(input: {
  method: string;
  path: string;
  body: string;
  headers: Headers;
}) {
  const sessionId = input.headers.get("x-lab-session-id");
  const timestamp = input.headers.get("x-lab-timestamp");
  const nonce = input.headers.get("x-lab-nonce");
  const signature = input.headers.get("x-lab-signature");

  if (!sessionId || !timestamp || !nonce || !signature) {
    throw new AppError("CTF_LAB_SIGNATURE_REQUIRED", "Missing CTF lab signature headers.", 401);
  }

  const session = getCtfCaptureLabSession(sessionId);
  if (!session) {
    throw new AppError("CTF_LAB_SESSION_NOT_FOUND", "CTF lab session not found or expired.", 401);
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > LAB_SIGNATURE_MAX_AGE_MS) {
    throw new AppError("CTF_LAB_SIGNATURE_EXPIRED", "CTF lab signature timestamp is invalid.", 401);
  }

  const expected = buildCtfCaptureLabSignature({
    secret: session.deviceSecret,
    method: input.method,
    path: input.path,
    timestamp,
    nonce,
    body: input.body,
  });

  if (expected !== signature.toLowerCase()) {
    throw new AppError("CTF_LAB_SIGNATURE_INVALID", "CTF lab request signature is invalid.", 401);
  }

  return session;
}

export function parseCtfCaptureLabPaymentInput(raw: unknown) {
  if (!isRecord(raw)) {
    throw new AppError("CTF_LAB_PAYLOAD_INVALID", "CTF lab payload must be a JSON object.", 400);
  }

  const amount = readString(raw, ["amount", "money"], "88.00");
  const channelCode = normalizeLabChannelCode(raw.channelCode ?? raw.channel ?? raw.type);
  const defaultRemark = `NovaPay CTF ${randomId("order_hint")}`;

  return {
    channelCode,
    amount: formatAmount(amount),
    remark: readString(raw, ["remark", "memo", "note", "subject"], defaultRemark),
    payerAccount: readString(
      raw,
      ["payerAccount", "payer_account", "buyer", "nickname"],
      channelCode === "ctf.alipay.monitor" ? "buyer@example.test" : "ctf-buyer",
    ),
  };
}

export function createCtfCaptureLabBill(input: {
  sessionId: string;
  channelCode: CtfCaptureLabBill["channelCode"];
  amount: string;
  remark: string;
  payerAccount: string;
}) {
  const bill: CtfCaptureLabBill = {
    channelCode: input.channelCode,
    amount: formatAmount(input.amount),
    currency: "CNY",
    paidAt: new Date(),
    externalBillId:
      input.channelCode === "ctf.alipay.monitor"
        ? randomId("CTF_ALIPAY_BILL")
        : randomId("CTF_WXPAY_BILL"),
    payerAccount: input.payerAccount,
    remark: input.remark,
    source:
      input.channelCode === "ctf.alipay.monitor"
        ? "ctf-lab-alipay-app"
        : "ctf-lab-wechat-app",
  };

  const state = getState();
  const rows = state.bills.get(input.sessionId) ?? [];
  rows.unshift(bill);
  state.bills.set(input.sessionId, rows.slice(0, MAX_BILLS_PER_SESSION));

  return bill;
}

export function listCtfCaptureLabBills(sessionId: string, limit = 10) {
  const rows = getState().bills.get(sessionId) ?? [];
  return rows.slice(0, Math.max(1, Math.min(limit, MAX_BILLS_PER_SESSION)));
}

export function toCtfCaptureLabBillJson(bill: CtfCaptureLabBill) {
  return {
    channelCode: bill.channelCode,
    amount: bill.amount,
    currency: bill.currency,
    paidAt: bill.paidAt.toISOString(),
    externalBillId: bill.externalBillId,
    payerAccount: bill.payerAccount,
    remark: bill.remark,
    source: bill.source,
  };
}

export function encodeCtfCaptureLabEnvelope(bills: CtfCaptureLabBill[]) {
  const envelope = {
    version: 1,
    issuedAt: new Date().toISOString(),
    rows: bills.map(toCtfCaptureLabBillJson),
  };

  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

export function decodeCtfCaptureLabEnvelope(envelope: string) {
  return JSON.parse(Buffer.from(envelope, "base64url").toString("utf8")) as {
    version: number;
    issuedAt: string;
    rows: Array<ReturnType<typeof toCtfCaptureLabBillJson>>;
  };
}
