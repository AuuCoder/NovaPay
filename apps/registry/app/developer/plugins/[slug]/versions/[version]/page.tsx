import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentLocale } from "@/lib/i18n-server";
import { requireRegistryUserSession } from "../../../../../../lib/auth/session";
import { canDeveloperManagePlugin } from "../../../../../../lib/developer/plugin-ownership";
import { isOfficialPluginSlug } from "../../../../../../lib/plugins/official";
import {
  getPluginVersionRecord,
  getRegistryRuntime,
  listPluginVersionTestSessions,
} from "../../../../../../lib/runtime/state";
import { VerificationRunner } from "./verification-runner";
import { SubmitVersionButton } from "./submit-button";

export default async function DeveloperVersionDetailPage({
  params,
}: {
  params: Promise<{ slug: string; version: string }>;
}) {
  const session = await requireRegistryUserSession();
  const locale = await getCurrentLocale();
  const { slug, version } = await params;
  const state = await getRegistryRuntime();
  const bundle = state.demoBundles.get(`${slug}@${version}`);
  const versionRecord = getPluginVersionRecord(state, slug, version);

  if (!bundle || !versionRecord) {
    notFound();
  }

  const sessions = listPluginVersionTestSessions({
    state,
    pluginSlug: slug,
    version,
  }).map((session) => ({
    ...session,
    createdAt: session.createdAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
  }));
  const verificationProfile = bundle.pipelineResult.manifest.verificationProfile;
  const officialPlugin = isOfficialPluginSlug(slug);
  const developerId = session.actorKind === "DEVELOPER" ? session.actorId : null;
  const canManage = await canDeveloperManagePlugin(slug, developerId);
  const content =
    locale === "en"
      ? {
          back: "Back to plugin",
          eyebrow: "Version",
          title: "Review & scan findings",
          lead:
            "This page now reflects the actual remote bundle stored in the runtime catalog. Static scan findings are not wired yet, but signature and checksum data below are real.",
          noFindings: "No findings yet.",
          scanTitle: "Static scan",
          scanPassed: "No blockers found",
          scanBlocked: "Blockers detected",
          scanWarnings: "Warnings",
          scanInfo: "Info",
          scanEmpty: "The static scan has not produced any findings yet.",
          verification: "Pre-publish verification",
          runVerification: "Run verification",
          runningVerification: "Running…",
          verificationConfig: "Config",
          latestResult: "Latest verification result",
          noRuns: "No verification runs yet.",
          statusPassed: "Passed",
          statusFailed: "Failed",
          verificationFailedGeneric: "Verification failed.",
          statusLabels: {
            DRAFT: "Draft",
            RUNNING: "Running",
            WAITING_MANUAL_PAYMENT: "Waiting for manual payment",
            PASSED: "Passed",
            FAILED: "Failed",
            EXPIRED: "Expired",
            PENDING: "Pending",
            SKIPPED: "Skipped",
          },
          stepLabels: {
            create_payment: "Create payment",
          },
          officialExempt: "Official NovaPay plugins are exempt from pre-publish verification.",
          missingVerificationProfile:
            "Third-party payment plugins must declare verificationProfile before they can be submitted.",
          publisherSelfTest:
            "The publisher must run one full self-test with real plugin parameters before this version can be submitted.",
          submit: "Submit for review",
          submitting: "Submitting…",
          submitted: "Version submitted for review.",
          submitFailed: "Failed to submit version.",
          metadata: "Signed bundle metadata",
          signature: "Signature",
          sha256: "sha256",
          size: "Size",
          keyId: "Signing key",
          reviewState: "Review state",
          viewOnly: "Browse only",
          manageHint:
            "Only the original publisher can run verification or submit this version for review.",
        }
      : {
          back: "返回插件详情",
          eyebrow: "版本",
          title: "审核与扫描结果",
          lead:
            "这里现在展示的是真实远程插件包版本。静态扫描结果还没接线，但下方的签名和 checksum 都来自真实运行时目录。",
          noFindings: "当前还没有扫描结果。",
          scanTitle: "静态扫描",
          scanPassed: "未发现阻断项",
          scanBlocked: "发现阻断项",
          scanWarnings: "警告",
          scanInfo: "提示",
          scanEmpty: "当前静态扫描还没有产出任何结果。",
          verification: "发布前验证",
          runVerification: "运行验证",
          runningVerification: "验证中…",
          verificationConfig: "参数",
          latestResult: "最近一次验证结果",
          noRuns: "当前还没有验证记录。",
          statusPassed: "已通过",
          statusFailed: "失败",
          verificationFailedGeneric: "验证失败。",
          statusLabels: {
            DRAFT: "草稿",
            RUNNING: "进行中",
            WAITING_MANUAL_PAYMENT: "等待人工支付",
            PASSED: "已通过",
            FAILED: "失败",
            EXPIRED: "已过期",
            PENDING: "待处理",
            SKIPPED: "已跳过",
          },
          stepLabels: {
            create_payment: "创建支付",
          },
          officialExempt: "NovaPay 官方插件不要求发布前验证。",
          missingVerificationProfile:
            "第三方支付插件必须声明 verificationProfile，才能进入提审流程。",
          publisherSelfTest:
            "第三方插件发布前，发布者必须用自己插件所需的真实参数完整自测一遍链路。",
          submit: "提交审核",
          submitting: "提交中…",
          submitted: "版本已提交审核。",
          submitFailed: "提交版本审核失败。",
          metadata: "签名包元数据",
          signature: "签名",
          sha256: "sha256",
          size: "大小",
          keyId: "签名密钥",
          reviewState: "审核状态",
          viewOnly: "仅浏览",
          manageHint: "只有最初发布该 slug 的开发者，才能运行验证和提交这个版本的审核。",
        };

  return (
    <>
      <section className="hero-band">
        <div className="container">
          <Link
            href={`/developer/plugins/${slug}`}
            className="text-body-sm"
            style={{ color: "var(--color-positive-deep)", fontWeight: 600 }}
          >
            ← {content.back}
          </Link>
          <p className="text-eyebrow" style={{ marginTop: 16 }}>{content.eyebrow}</p>
          <h1 className="text-display-md" style={{ marginTop: 8 }}>
            {slug} <span style={{ fontWeight: 500, color: "var(--color-mute)" }}>v{version}</span>
          </h1>
        </div>
      </section>

      <section className="content-band">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 32 }}>
          <div className="card card-lg">
            <h2 className="text-display-xs">{content.title}</h2>
            <p className="text-body-md text-body-color" style={{ marginTop: 12 }}>
              {content.lead}
            </p>
            <div className="divider" />
            <div style={{ display: "grid", gap: 12 }}>
              <p className="text-eyebrow">{content.scanTitle}</p>
              {versionRecord.scanResult ? (
                <>
                  <span
                    className={`badge ${
                      versionRecord.scanResult.hasBlockers
                        ? "badge-negative"
                        : "badge-positive"
                    }`}
                  >
                    {versionRecord.scanResult.hasBlockers
                      ? content.scanBlocked
                      : content.scanPassed}
                  </span>
                  <div className="activity-list">
                    {versionRecord.scanResult.findings.length > 0 ? (
                      versionRecord.scanResult.findings.map((finding) => (
                        <div
                          key={`${finding.code}-${finding.file}-${finding.line ?? "x"}`}
                          className={`activity-item ${
                            finding.severity === "BLOCK"
                              ? "activity-item-danger"
                              : finding.severity === "WARN"
                                ? "activity-item-warning"
                                : "activity-item-positive"
                          }`}
                        >
                          <p className="activity-item-title">
                            {finding.code} · {finding.severity}
                          </p>
                          <p className="activity-item-note">{finding.message}</p>
                          <p className="activity-item-time">
                            {finding.file}
                            {finding.line ? `:${finding.line}` : ""}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-body-sm text-mute">{content.scanEmpty}</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-body-sm text-mute">{content.noFindings}</p>
              )}
            </div>
          </div>
          <div className="flex-col" style={{ gap: 24 }}>
            {officialPlugin ? (
              <div className="card-feature-sage" style={{ padding: 24 }}>
                <p className="text-eyebrow">{content.verification}</p>
                <p className="text-body-sm" style={{ marginTop: 8 }}>
                  {content.officialExempt}
                </p>
              </div>
            ) : verificationProfile ? (
              canManage ? (
                <VerificationRunner
                  slug={slug}
                  version={version}
                  requiredConfigKeys={verificationProfile.requiredConfigKeys}
                  labels={{
                    title: content.verification,
                    run: content.runVerification,
                    running: content.runningVerification,
                    config: content.verificationConfig,
                    latestResult: content.latestResult,
                    noRuns: content.noRuns,
                    statusPassed: content.statusPassed,
                    statusFailed: content.statusFailed,
                    failedGeneric: content.verificationFailedGeneric,
                    statusLabels: content.statusLabels,
                    stepLabels: content.stepLabels,
                  }}
                  initialSessions={sessions}
                />
              ) : (
                <div className="card-feature-sage" style={{ padding: 24 }}>
                  <p className="text-eyebrow">{content.verification}</p>
                  <p className="text-body-sm" style={{ marginTop: 8 }}>
                    {content.manageHint}
                  </p>
                </div>
              )
            ) : (
              <div className="card-feature-sage" style={{ padding: 24 }}>
                <p className="text-eyebrow">{content.verification}</p>
                <p className="text-body-sm" style={{ marginTop: 8 }}>
                  {content.missingVerificationProfile}
                </p>
                <p className="text-body-sm text-mute" style={{ marginTop: 8 }}>
                  {content.publisherSelfTest}
                </p>
              </div>
            )}

            <div className="card-feature-sage" style={{ padding: 24 }}>
              <p className="text-eyebrow">{content.metadata}</p>
              <dl style={{ display: "grid", gridTemplateColumns: "88px 1fr", rowGap: 10, columnGap: 16, marginTop: 16 }}>
              <dt className="text-body-sm text-mute">{content.reviewState}</dt>
              <dd className="text-body-sm">{versionRecord.reviewState}</dd>
              <dt className="text-body-sm text-mute">{content.sha256}</dt>
              <dd className="text-body-sm" style={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
                {bundle.pipelineResult.sha256}
              </dd>
              <dt className="text-body-sm text-mute">{content.signature}</dt>
              <dd className="text-body-sm" style={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
                {bundle.pipelineResult.signature}
              </dd>
              <dt className="text-body-sm text-mute">{content.keyId}</dt>
              <dd className="text-body-sm">{bundle.pipelineResult.signatureKeyId}</dd>
              <dt className="text-body-sm text-mute">{content.size}</dt>
                <dd className="text-body-sm">{Math.ceil(bundle.pipelineResult.sizeBytes / 1024)} KB</dd>
              </dl>
              {versionRecord.reviewState === "DRAFT" && canManage ? (
                <SubmitVersionButton
                  slug={slug}
                  version={version}
                  label={content.submit}
                  runningLabel={content.submitting}
                  successLabel={content.submitted}
                  failedLabel={content.submitFailed}
                />
              ) : !canManage ? (
                <div style={{ marginTop: 16 }}>
                  <span className="badge badge-neutral">{content.viewOnly}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
