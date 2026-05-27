"use client";

import { useState } from "react";

interface PayoutAccount {
  id: string;
  accountType: "bank_transfer" | "paypal";
  accountHolder: string;
  accountNumber: string | null;
  routingNumber: string | null;
  bankName: string | null;
  paypalEmail: string | null;
  status: "PENDING_VERIFICATION" | "VERIFIED" | "SUSPENDED";
  verifiedAt: string | null;
  createdAt: string;
}

interface PayoutRequest {
  id: string;
  payoutAccountId: string;
  amountCents: number;
  currency: string;
  state: string;
  adminNote?: string | null;
  createdAt: string;
  processedAt?: string | null;
}

interface LedgerEntry {
  id: string;
  amountCents: number;
  currency: string;
  reason: string;
  externalRef: string;
  occurredAt: string;
}

interface SettlementOrder {
  id: string;
  orderNumber: string;
  pluginSlug: string;
  version: string;
  buyerInstanceId: string;
  buyerMerchantId?: string | null;
  priceAmountCents: number;
  priceCurrency: string;
  state: string;
  paidAt?: string | null;
  createdAt: string;
}

export function SalesManager(props: {
  locale: "zh" | "en";
  initialAccounts: PayoutAccount[];
  initialPayouts: PayoutRequest[];
  initialEntries: LedgerEntry[];
  initialOrders: SettlementOrder[];
  initialBalance: { available: number; frozen: number; total: number; currency: string };
  labels: {
    available: string;
    frozen: string;
    total: string;
    accounts: string;
    addAccount: string;
    accountType: string;
    bankTransfer: string;
    paypal: string;
    accountHolder: string;
    bankName: string;
    accountNumber: string;
    routingNumber: string;
    paypalEmail: string;
    submitAccount: string;
    payouts: string;
    requestPayout: string;
    amount: string;
    selectAccount: string;
    submitPayout: string;
    status: string;
    noAccounts: string;
    noPayouts: string;
    ledger: string;
    noEntries: string;
    orders: string;
    noOrders: string;
    plugin: string;
    buyer: string;
    stateLabel: string;
    reason: string;
    reference: string;
    occurredAt: string;
    amountCol: string;
    pendingVerification: string;
    verified: string;
    suspended: string;
    pendingReview: string;
    approved: string;
    rejected: string;
    errorCreateAccount: string;
    errorPayout: string;
  };
}) {
  const [accounts, setAccounts] = useState(props.initialAccounts);
  const [payouts, setPayouts] = useState(props.initialPayouts);
  const [entries] = useState(props.initialEntries);
  const [orders] = useState(props.initialOrders);
  const [balance, setBalance] = useState(props.initialBalance);
  const [accountType, setAccountType] = useState<"bank_transfer" | "paypal">("bank_transfer");
  const [accountHolder, setAccountHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [amountYuan, setAmountYuan] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function formatCny(cents: number) {
    return `¥${(cents / 100).toFixed(2)}`;
  }

  function accountStatusLabel(status: PayoutAccount["status"]) {
    switch (status) {
      case "VERIFIED":
        return props.labels.verified;
      case "SUSPENDED":
        return props.labels.suspended;
      case "PENDING_VERIFICATION":
      default:
        return props.labels.pendingVerification;
    }
  }

  function payoutStatusLabel(status: string) {
    switch (status) {
      case "APPROVED":
        return props.labels.approved;
      case "REJECTED":
        return props.labels.rejected;
      case "PENDING_REVIEW":
      default:
        return props.labels.pendingReview;
    }
  }

  async function handleCreateAccount() {
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/developer/payout-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType,
          accountHolder,
          bankName,
          accountNumber,
          routingNumber,
          paypalEmail,
        }),
      });
      const payload = (await response.json()) as { account?: PayoutAccount; message?: string };

      if (!response.ok || !payload.account) {
        throw new Error(payload.message || props.labels.errorCreateAccount);
      }

      setAccounts((current) => [payload.account!, ...current]);
      setSelectedAccountId(payload.account.id);
      setAccountHolder("");
      setBankName("");
      setAccountNumber("");
      setRoutingNumber("");
      setPaypalEmail("");
      setMessage(props.labels.addAccount);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRequestPayout() {
    setMessage(null);
    setError(null);

    try {
      const amountCents = Math.round(Number(amountYuan) * 100);
      const response = await fetch("/api/developer/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutAccountId: selectedAccountId,
          amountCents,
        }),
      });
      const payload = (await response.json()) as {
        request?: PayoutRequest;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.request) {
        throw new Error(payload.message || props.labels.errorPayout);
      }

      setPayouts((current) => [payload.request!, ...current]);
      setBalance((current) => ({
        ...current,
        frozen: current.frozen + payload.request!.amountCents,
        available: current.available - payload.request!.amountCents,
      }));
      setAmountYuan("");
      setMessage(props.labels.submitPayout);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="enterprise-grid">
      {message ? <p className="text-body-sm" style={{ color: "var(--color-positive-deep)" }}>{message}</p> : null}
      {error ? <p className="text-body-sm" style={{ color: "var(--color-negative-deep)" }}>{error}</p> : null}

      <div className="grid-3">
        <div className="stat-card feature">
          <p className="stat-label">{props.labels.available}</p>
          <p className="stat-value">{formatCny(balance.available)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">{props.labels.frozen}</p>
          <p className="stat-value">{formatCny(balance.frozen)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">{props.labels.total}</p>
          <p className="stat-value">{formatCny(balance.total)}</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="enterprise-panel">
          <div className="admin-header-copy">
            <h2 className="text-display-xs">{props.labels.accounts}</h2>
          </div>
          <div className="enterprise-grid" style={{ marginTop: 16 }}>
            <select className="input" value={accountType} onChange={(event) => setAccountType(event.target.value as "bank_transfer" | "paypal")}>
              <option value="bank_transfer">{props.labels.bankTransfer}</option>
              <option value="paypal">{props.labels.paypal}</option>
            </select>
            <input className="input" placeholder={props.labels.accountHolder} value={accountHolder} onChange={(event) => setAccountHolder(event.target.value)} />
            {accountType === "bank_transfer" ? (
              <>
                <input className="input" placeholder={props.labels.bankName} value={bankName} onChange={(event) => setBankName(event.target.value)} />
                <input className="input" placeholder={props.labels.accountNumber} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} />
                <input className="input" placeholder={props.labels.routingNumber} value={routingNumber} onChange={(event) => setRoutingNumber(event.target.value)} />
              </>
            ) : (
              <input className="input" placeholder={props.labels.paypalEmail} value={paypalEmail} onChange={(event) => setPaypalEmail(event.target.value)} />
            )}
            <button type="button" className="btn btn-primary" onClick={handleCreateAccount}>
              {props.labels.submitAccount}
            </button>
          </div>

          <div className="enterprise-grid" style={{ marginTop: 20 }}>
            {accounts.length === 0 ? (
              <p className="text-body-sm text-mute">{props.labels.noAccounts}</p>
            ) : (
              accounts.map((account) => (
                <div key={account.id} className="risk-kpi">
                  <p className="risk-kpi-label">{account.accountType === "paypal" ? props.labels.paypal : props.labels.bankTransfer}</p>
                  <p className="risk-kpi-value">{account.accountHolder}</p>
                  <p className="text-body-sm text-mute">
                    {account.accountType === "paypal" ? account.paypalEmail : account.bankName}
                  </p>
                  <p className="text-caption">{accountStatusLabel(account.status)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="enterprise-panel">
          <div className="admin-header-copy">
            <h2 className="text-display-xs">{props.labels.payouts}</h2>
          </div>
          <div className="enterprise-grid" style={{ marginTop: 16 }}>
            <select className="input" value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
              <option value="">{props.labels.selectAccount}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountHolder} · {account.accountType === "paypal" ? account.paypalEmail : account.bankName}
                </option>
              ))}
            </select>
            <input className="input" placeholder={props.labels.amount} value={amountYuan} onChange={(event) => setAmountYuan(event.target.value)} />
            <button type="button" className="btn btn-primary" onClick={handleRequestPayout}>
              {props.labels.submitPayout}
            </button>
          </div>

          <div className="enterprise-grid" style={{ marginTop: 20 }}>
            {payouts.length === 0 ? (
              <p className="text-body-sm text-mute">{props.labels.noPayouts}</p>
            ) : (
              payouts.map((request) => (
                <div key={request.id} className="risk-kpi">
                  <p className="risk-kpi-label">{props.labels.status}</p>
                  <p className="risk-kpi-value">{payoutStatusLabel(request.state)}</p>
                  <p className="text-body-sm text-body-color">{formatCny(request.amountCents)}</p>
                  <p className="text-caption">{new Date(request.createdAt).toLocaleString(props.locale === "en" ? "en-US" : "zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="enterprise-panel">
        <div className="admin-header-copy">
          <h2 className="text-display-xs">{props.labels.ledger}</h2>
        </div>

        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{props.labels.reason}</th>
                <th>{props.labels.reference}</th>
                <th>{props.labels.occurredAt}</th>
                <th style={{ textAlign: "right" }}>{props.labels.amountCol}</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-body-sm text-mute" style={{ padding: 24 }}>
                    {props.labels.noEntries}
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="text-body-sm text-body-color">{entry.reason}</td>
                    <td className="text-caption" style={{ fontFamily: "ui-monospace, monospace" }}>
                      {entry.externalRef}
                    </td>
                    <td className="text-body-sm text-body-color">
                      {new Date(entry.occurredAt).toLocaleString(
                        props.locale === "en" ? "en-US" : "zh-CN",
                        { timeZone: "Asia/Shanghai", hour12: false },
                      )}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {entry.amountCents >= 0 ? "+" : "-"}
                      {formatCny(Math.abs(entry.amountCents))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="enterprise-panel">
        <div className="admin-header-copy">
          <h2 className="text-display-xs">{props.labels.orders}</h2>
        </div>

        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{props.labels.plugin}</th>
                <th>{props.labels.buyer}</th>
                <th>{props.labels.stateLabel}</th>
                <th>{props.labels.occurredAt}</th>
                <th style={{ textAlign: "right" }}>{props.labels.amountCol}</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-body-sm text-mute" style={{ padding: 24 }}>
                    {props.labels.noOrders}
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <span className="text-body-sm text-body-color">{order.pluginSlug}</span>
                        <span className="text-caption">v{order.version}</span>
                      </div>
                    </td>
                    <td className="text-body-sm text-body-color">
                      {order.buyerMerchantId ?? order.buyerInstanceId}
                    </td>
                    <td>
                      <span className={order.state === "PAID" ? "badge badge-positive" : "badge badge-neutral"}>
                        {order.state}
                      </span>
                    </td>
                    <td className="text-body-sm text-body-color">
                      {new Date(order.createdAt).toLocaleString(
                        props.locale === "en" ? "en-US" : "zh-CN",
                        { timeZone: "Asia/Shanghai", hour12: false },
                      )}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {formatCny(order.priceAmountCents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
