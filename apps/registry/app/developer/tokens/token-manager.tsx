"use client";

import { useMemo, useState } from "react";

export interface TokenListItem {
  id: string;
  name: string;
  tokenPreview: string;
  status: "ACTIVE" | "REVOKED";
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

interface TokenManagerCopy {
  create: string;
  creating: string;
  name: string;
  token: string;
  created: string;
  lastUsed: string;
  status: string;
  action: string;
  revoked: string;
  revoke: string;
  revoking: string;
  noLastUsed: string;
  active: string;
  createPlaceholder: string;
  createHint: string;
  revealTitle: string;
  revealBody: string;
  copy: string;
  copied: string;
  close: string;
  noTokens: string;
  sessionOnlyTitle: string;
  sessionOnlyBody: string;
  createFailed: string;
  revokeFailed: string;
}

export function TokenManager(props: {
  initialTokens: TokenListItem[];
  locale: "zh" | "en";
  copy: TokenManagerCopy;
  canManage: boolean;
}) {
  const [tokens, setTokens] = useState(props.initialTokens);
  const [tokenName, setTokenName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(props.locale === "en" ? "en-US" : "zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [props.locale],
  );

  function formatDate(value: string | null) {
    if (!value) {
      return props.copy.noLastUsed;
    }

    return dateFormatter.format(new Date(value));
  }

  async function handleCreateToken() {
    if (!tokenName.trim()) {
      setError(props.copy.createHint);
      setMessage(null);
      return;
    }

    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/developer/tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: tokenName.trim() }),
      });
      const payload = (await response.json()) as {
        token?: string;
        record?: TokenListItem;
        message?: string;
      };

      if (!response.ok || !payload.token || !payload.record) {
        throw new Error(payload.message || props.copy.createFailed);
      }

      setTokens((current) => [payload.record!, ...current]);
      setFreshToken({ name: payload.record.name, token: payload.token });
      setTokenName("");
      setCopied(false);
      setMessage(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevokeToken(id: string) {
    setRevokingId(id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/developer/tokens/${id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        token?: TokenListItem;
        message?: string;
      };

      if (!response.ok || !payload.token) {
        throw new Error(payload.message || props.copy.revokeFailed);
      }

      setTokens((current) =>
        current.map((item) => (item.id === id ? payload.token! : item)),
      );
      setMessage(props.copy.revoked);
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : String(revokeError));
    } finally {
      setRevokingId(null);
    }
  }

  async function handleCopyToken() {
    if (!freshToken?.token) {
      return;
    }

    await navigator.clipboard.writeText(freshToken.token);
    setCopied(true);
  }

  if (!props.canManage) {
    return (
      <div className="card-feature-sage" style={{ padding: 32 }}>
        <p className="text-display-xs">{props.copy.sessionOnlyTitle}</p>
        <p className="text-body-md text-body-color" style={{ marginTop: 12 }}>
          {props.copy.sessionOnlyBody}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div className="card" style={{ display: "grid", gap: 16 }}>
        <div className="flex-between" style={{ gap: 12, alignItems: "end" }}>
          <label className="label-block" style={{ flex: 1 }}>
            <span className="label-text">{props.copy.name}</span>
            <input
              type="text"
              className="input"
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              placeholder={props.copy.createPlaceholder}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCreateToken}
            disabled={creating}
          >
            {creating ? props.copy.creating : props.copy.create}
          </button>
        </div>
        <p className="text-caption">{props.copy.createHint}</p>
        {message ? <p className="text-body-sm" style={{ color: "var(--color-positive-deep)" }}>{message}</p> : null}
        {error ? <p className="text-body-sm" style={{ color: "var(--color-danger-deep)" }}>{error}</p> : null}
      </div>

      {freshToken ? (
        <div className="card" style={{ display: "grid", gap: 12, borderColor: "rgba(30, 142, 92, 0.22)" }}>
          <div>
            <p className="text-eyebrow">{props.copy.revealTitle}</p>
            <p className="text-body-sm text-body-color" style={{ marginTop: 6 }}>
              {props.copy.revealBody}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-white/80 p-4">
            <p className="text-body-sm text-mute">{freshToken.name}</p>
            <code style={{ display: "block", marginTop: 8, wordBreak: "break-all", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
              {freshToken.token}
            </code>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleCopyToken}>
              {copied ? props.copy.copied : props.copy.copy}
            </button>
            <button
              type="button"
              className="btn btn-tertiary btn-sm"
              onClick={() => {
                setFreshToken(null);
                setCopied(false);
              }}
            >
              {props.copy.close}
            </button>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{props.copy.name}</th>
              <th>{props.copy.token}</th>
              <th>{props.copy.created}</th>
              <th>{props.copy.lastUsed}</th>
              <th>{props.copy.status}</th>
              <th style={{ textAlign: "right" }}>{props.copy.action}</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-body-sm text-mute" style={{ padding: 24 }}>
                  {props.copy.noTokens}
                </td>
              </tr>
            ) : (
              tokens.map((token) => (
                <tr key={token.id}>
                  <td className="text-body-md-strong">{token.name}</td>
                  <td>
                    <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "var(--color-body)" }}>
                      {token.tokenPreview}
                    </code>
                  </td>
                  <td className="text-body-sm text-mute">{formatDate(token.createdAt)}</td>
                  <td className="text-body-sm text-mute">{formatDate(token.lastUsedAt)}</td>
                  <td>
                    <span className={`badge ${token.status === "ACTIVE" ? "badge-positive" : "badge-negative"}`}>
                      {token.status === "ACTIVE" ? props.copy.active : props.copy.revoked}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {token.status === "ACTIVE" ? (
                      <button
                        type="button"
                        className="btn btn-tertiary btn-sm"
                        onClick={() => handleRevokeToken(token.id)}
                        disabled={revokingId === token.id}
                      >
                        {revokingId === token.id ? props.copy.revoking : props.copy.revoke}
                      </button>
                    ) : (
                      <span className="text-caption">{props.copy.revoked}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
