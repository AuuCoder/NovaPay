"use client";

import { useState } from "react";

export function ReviewActions(props: {
  slug: string;
  version: string;
  reviewState: string;
  locale: "zh" | "en";
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"approve" | "publish" | null>(null);

  const copy =
    props.locale === "en"
      ? {
          approve: "Approve",
          approving: "Approving...",
          publish: "Publish",
          publishing: "Publishing...",
          approved: "Approved",
          published: "Published",
          failedApprove: "Failed to approve version.",
          failedPublish: "Failed to publish version.",
        }
      : {
          approve: "批准",
          approving: "批准中...",
          publish: "发布",
          publishing: "发布中...",
          approved: "已批准",
          published: "已发布",
          failedApprove: "批准版本失败。",
          failedPublish: "发布版本失败。",
        };

  async function run(action: "approve" | "publish") {
    setBusyAction(action);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/plugins/${props.slug}/versions/${props.version}/${action}`,
        {
          method: "POST",
        },
      );
      await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(action === "approve" ? copy.failedApprove : copy.failedPublish);
      }
      setMessage(action === "approve" ? copy.approved : copy.published);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
      {props.reviewState === "SUBMITTED" ? (
        <button
          type="button"
          className="btn btn-tertiary btn-sm"
          disabled={busyAction !== null}
          onClick={() => run("approve")}
        >
          {busyAction === "approve" ? copy.approving : copy.approve}
        </button>
      ) : null}
      {props.reviewState === "APPROVED" ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busyAction !== null}
          onClick={() => run("publish")}
        >
          {busyAction === "publish" ? copy.publishing : copy.publish}
        </button>
      ) : null}
      {message ? <p className="text-caption">{message}</p> : null}
    </div>
  );
}
