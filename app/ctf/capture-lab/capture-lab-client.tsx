"use client";

import { useMemo, useState } from "react";

type LabChannelCode = "ctf.alipay.monitor" | "ctf.wxpay.monitor";

type SessionResponse = {
  ok: boolean;
  appName: string;
  sessionId: string;
  deviceId: string;
  deviceSecret: string;
  signatureBase: string;
};

type LabBillRow = {
  channelCode: LabChannelCode;
  amount: string;
  currency: "CNY";
  paidAt: string;
  externalBillId: string;
  payerAccount: string;
  remark: string;
  source: string;
};

type LabEnvelope = {
  version: number;
  issuedAt: string;
  rows: LabBillRow[];
};

type Content = {
  startSession: string;
  sessionReady: string;
  hiddenSecretHint: string;
  deviceId: string;
  sessionId: string;
  deviceSecret: string;
  channel: string;
  amount: string;
  remark: string;
  payer: string;
  simulatePayment: string;
  fetchBills: string;
  decodedRows: string;
  envelope: string;
  signedRequest: string;
  canonical: string;
  response: string;
  collectorTitle: string;
  collectorIntro: string;
  accountPlaceholder: string;
  tokenPlaceholder: string;
  collectorSecretPlaceholder: string;
  buildCurl: string;
  copyPayload: string;
  noRows: string;
  errorPrefix: string;
};

const PATHS = {
  pay: "/api/ctf/capture-lab/pay",
  bills: "/api/ctf/capture-lab/bills",
};

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return decodeURIComponent(
    Array.from(atob(padded))
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
}

function decodeEnvelope(envelope: string): LabEnvelope {
  return JSON.parse(base64UrlDecode(envelope)) as LabEnvelope;
}

async function hmacSha256Hex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomNonce() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function CaptureLabClient({ content }: { content: Content }) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [channelCode, setChannelCode] = useState<LabChannelCode>("ctf.alipay.monitor");
  const [amount, setAmount] = useState("88.00");
  const [remark, setRemark] = useState("NovaPay CTF ORDER-20260622-001");
  const [payerAccount, setPayerAccount] = useState("buyer@example.test");
  const [envelope, setEnvelope] = useState("");
  const [decoded, setDecoded] = useState<LabEnvelope | null>(null);
  const [lastRequest, setLastRequest] = useState<Record<string, unknown> | null>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);
  const [accountId, setAccountId] = useState("");
  const [token, setToken] = useState("");
  const [collectorSecret, setCollectorSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const firstRow = decoded?.rows[0] ?? null;
  const collectorUrl = useMemo(() => {
    if (!accountId || !token) {
      return "/api/ctf/bill-capture/{accountId}/{token}";
    }
    return `/api/ctf/bill-capture/${encodeURIComponent(accountId)}/${encodeURIComponent(token)}`;
  }, [accountId, token]);

  async function startSession() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/ctf/capture-lab/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: `lab-device-${Date.now()}` }),
      });
      const json = (await response.json()) as SessionResponse;
      if (!response.ok || !json.ok) {
        throw new Error(JSON.stringify(json));
      }
      setSession(json);
      setLastResponse(json);
      setMessage(content.sessionReady);
    } catch (error) {
      setMessage(`${content.errorPrefix}${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function signedPost(path: string, body: Record<string, unknown>) {
    if (!session) {
      throw new Error("session not initialized");
    }

    const rawBody = JSON.stringify(body);
    const timestamp = String(Date.now());
    const nonce = randomNonce();
    const canonical = ["POST", path, timestamp, nonce, rawBody].join("\n");
    const signature = await hmacSha256Hex(session.deviceSecret, canonical);
    const headers = {
      "content-type": "application/json",
      "x-lab-session-id": session.sessionId,
      "x-lab-timestamp": timestamp,
      "x-lab-nonce": nonce,
      "x-lab-signature": signature,
    };

    setLastRequest({ method: "POST", path, headers, body, canonical });

    const response = await fetch(path, {
      method: "POST",
      headers,
      body: rawBody,
    });
    const json = await response.json();
    setLastResponse(json);
    if (!response.ok || !json.ok) {
      throw new Error(JSON.stringify(json));
    }
    return json as { envelope?: string } & Record<string, unknown>;
  }

  async function simulatePayment() {
    setBusy(true);
    setMessage("");
    try {
      const json = await signedPost(PATHS.pay, {
        channelCode,
        amount,
        remark,
        payerAccount,
      });
      if (typeof json.envelope === "string") {
        setEnvelope(json.envelope);
        setDecoded(decodeEnvelope(json.envelope));
      }
      setMessage("bill created");
    } catch (error) {
      setMessage(`${content.errorPrefix}${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function fetchBills() {
    setBusy(true);
    setMessage("");
    try {
      const json = await signedPost(PATHS.bills, { limit: 10 });
      if (typeof json.envelope !== "string") {
        throw new Error("missing envelope in response");
      }
      setEnvelope(json.envelope);
      setDecoded(decodeEnvelope(json.envelope));
      setMessage(`captured ${decodeEnvelope(json.envelope).rows.length} rows`);
    } catch (error) {
      setMessage(`${content.errorPrefix}${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  const collectorPayload = firstRow
    ? {
        channelCode: firstRow.channelCode,
        amount: firstRow.amount,
        currency: firstRow.currency,
        paidAt: firstRow.paidAt,
        externalBillId: firstRow.externalBillId,
        payerAccount: firstRow.payerAccount,
        remark: firstRow.remark,
        source: firstRow.source,
      }
    : null;

  const curl = collectorPayload
    ? [
        `curl -X POST '${collectorUrl}'`,
        "  -H 'content-type: application/json'",
        `  -H 'x-ctf-capture-secret: ${collectorSecret || "<required>"}'`,
        `  --data '${JSON.stringify(collectorPayload)}'`,
      ].join(" \\\n")
    : "";

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <section className="space-y-6">
        <div className="rounded-[1.75rem] border border-line bg-panel-strong p-6 shadow-[0_16px_50px_rgba(79,46,17,0.08)]">
          <button
            type="button"
            onClick={startSession}
            disabled={busy}
            className="rounded-2xl bg-foreground px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {content.startSession}
          </button>
          {message ? <p className="mt-4 text-sm text-secondary">{message}</p> : null}

          {session ? (
            <dl className="mt-5 grid gap-3 text-sm">
              <div className="rounded-2xl border border-line bg-white/70 p-4">
                <dt className="text-xs uppercase tracking-[0.2em] text-muted">{content.sessionId}</dt>
                <dd className="mt-2 break-all font-mono text-foreground">{session.sessionId}</dd>
              </div>
              <div className="rounded-2xl border border-line bg-white/70 p-4">
                <dt className="text-xs uppercase tracking-[0.2em] text-muted">{content.deviceId}</dt>
                <dd className="mt-2 break-all font-mono text-foreground">{session.deviceId}</dd>
              </div>
              <div className="rounded-2xl border border-line bg-[#1e1812] p-4 text-[#f7efe5]">
                <dt className="text-xs uppercase tracking-[0.2em] text-[#d6c0a6]">{content.deviceSecret}</dt>
                <dd className="mt-2 break-all font-mono text-sm">{session.deviceSecret}</dd>
                <dd className="mt-2 text-xs leading-6 text-[#d6c0a6]">{content.hiddenSecretHint}</dd>
              </div>
            </dl>
          ) : null}
        </div>

        <div className="rounded-[1.75rem] border border-line bg-panel-strong p-6 shadow-[0_16px_50px_rgba(79,46,17,0.08)]">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-foreground">
              {content.channel}
              <select
                value={channelCode}
                onChange={(event) => setChannelCode(event.target.value as LabChannelCode)}
                className="mt-2 w-full rounded-2xl border border-line bg-white/80 px-4 py-3 text-sm"
              >
                <option value="ctf.alipay.monitor">ctf.alipay.monitor</option>
                <option value="ctf.wxpay.monitor">ctf.wxpay.monitor</option>
              </select>
            </label>
            <label className="text-sm font-medium text-foreground">
              {content.amount}
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-line bg-white/80 px-4 py-3 font-mono text-sm"
              />
            </label>
            <label className="text-sm font-medium text-foreground sm:col-span-2">
              {content.remark}
              <input
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-line bg-white/80 px-4 py-3 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-foreground sm:col-span-2">
              {content.payer}
              <input
                value={payerAccount}
                onChange={(event) => setPayerAccount(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-line bg-white/80 px-4 py-3 text-sm"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={simulatePayment}
              disabled={busy || !session}
              className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {content.simulatePayment}
            </button>
            <button
              type="button"
              onClick={fetchBills}
              disabled={busy || !session}
              className="rounded-2xl border border-line bg-white/85 px-5 py-3 text-sm font-semibold text-foreground disabled:opacity-60"
            >
              {content.fetchBills}
            </button>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-line bg-panel-strong p-6 shadow-[0_16px_50px_rgba(79,46,17,0.08)]">
          <h2 className="text-lg font-semibold text-foreground">{content.collectorTitle}</h2>
          <p className="mt-2 text-sm leading-7 text-muted">{content.collectorIntro}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <input
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              placeholder={content.accountPlaceholder}
              className="rounded-2xl border border-line bg-white/80 px-4 py-3 text-sm"
            />
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={content.tokenPlaceholder}
              className="rounded-2xl border border-line bg-white/80 px-4 py-3 text-sm"
            />
            <input
              value={collectorSecret}
              onChange={(event) => setCollectorSecret(event.target.value)}
              placeholder={content.collectorSecretPlaceholder}
              className="rounded-2xl border border-line bg-white/80 px-4 py-3 text-sm"
            />
          </div>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-[#1e1812] p-4 text-xs leading-6 text-[#f7efe5]">
            {curl || content.noRows}
          </pre>
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-[1.75rem] border border-line bg-[#1e1812] p-6 text-[#f7efe5] shadow-[0_18px_60px_rgba(20,15,10,0.24)]">
          <p className="text-xs uppercase tracking-[0.22em] text-[#d6c0a6]">{content.signedRequest}</p>
          <h2 className="mt-2 text-lg font-semibold">{content.canonical}</h2>
          <pre className="mt-4 max-h-72 overflow-auto rounded-2xl bg-black/20 p-4 text-xs leading-6">
            {lastRequest ? pretty(lastRequest) : "POST /api/ctf/capture-lab/pay"}
          </pre>
        </div>

        <div className="rounded-[1.75rem] border border-line bg-panel-strong p-6 shadow-[0_16px_50px_rgba(79,46,17,0.08)]">
          <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.envelope}</p>
          <pre className="mt-4 max-h-52 overflow-auto rounded-2xl bg-white/80 p-4 font-mono text-xs leading-6 text-muted">
            {envelope || "base64url(json({ version, issuedAt, rows }))"}
          </pre>
        </div>

        <div className="rounded-[1.75rem] border border-line bg-panel-strong p-6 shadow-[0_16px_50px_rgba(79,46,17,0.08)]">
          <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.decodedRows}</p>
          <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-white/80 p-4 font-mono text-xs leading-6 text-muted">
            {decoded ? pretty(decoded) : content.noRows}
          </pre>
        </div>

        <div className="rounded-[1.75rem] border border-line bg-panel-strong p-6 shadow-[0_16px_50px_rgba(79,46,17,0.08)]">
          <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.response}</p>
          <pre className="mt-4 max-h-72 overflow-auto rounded-2xl bg-white/80 p-4 font-mono text-xs leading-6 text-muted">
            {lastResponse ? pretty(lastResponse) : "{}"}
          </pre>
        </div>
      </section>
    </div>
  );
}
