"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PayoutReviewActions(props: {
  id: string;
  state: string;
  locale: "zh" | "en";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const copy =
    props.locale === "en"
      ? {
          approve: "Approve",
          approving: "Approving...",
          reject: "Reject",
          rejecting: "Rejecting...",
          approved: "Approved",
          rejected: "Rejected",
          approveNote: "Approved during admin payout review.",
          rejectNote: "Rejected during admin payout review.",
          failedApprove: "Failed to approve payout.",
          failedReject: "Failed to reject payout.",
        }
      : {
          approve: "批准",
          approving: "批准中...",
          reject: "拒绝",
          rejecting: "拒绝中...",
          approved: "已批准",
          rejected: "已拒绝",
          approveNote: "在管理后台打款审核中批准。",
          rejectNote: "在管理后台打款审核中拒绝。",
          failedApprove: "批准打款失败。",
          failedReject: "拒绝打款失败。",
        };

  async function run(action: "approve" | "reject") {
    setBusy(action);
    setMessage(null);

    try {
      const body =
        action === "reject"
          ? { adminNote: copy.rejectNote }
          : { adminNote: copy.approveNote };
      const response = await fetch(`/api/admin/payouts/${props.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(action === "approve" ? copy.failedApprove : copy.failedReject);
      }

      setMessage(action === "approve" ? copy.approved : copy.rejected);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  if (props.state !== "PENDING_REVIEW") {
    return <span className="text-caption">{props.state}</span>;
  }

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-tertiary btn-sm" disabled={busy !== null} onClick={() => run("reject")}>
        {busy === "reject" ? copy.rejecting : copy.reject}
      </button>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => run("approve")}>
        {busy === "approve" ? copy.approving : copy.approve}
      </button>
      {message ? <span className="text-caption">{message}</span> : null}
    </div>
  );
}
