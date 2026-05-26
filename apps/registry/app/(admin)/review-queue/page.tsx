import Link from "next/link";
import { requireRegistryAdminSession } from "../../../lib/auth/session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { isOfficialPluginSlug } from "../../../lib/plugins/official";
import {
  getRegistryRuntime,
  listAllPluginVersionRecords,
  listPluginVersionTestSessions,
} from "../../../lib/runtime/state";
import {
  getVerificationRiskRank,
  summarizeVerificationSession,
  type VerificationReviewStatus,
} from "../verification-summary";
import { governancePath } from "../../../lib/governance-paths";

function getStatusTone(status: VerificationReviewStatus) {
  switch (status) {
    case "MISSING_PROFILE":
      return {
        label: { en: "Missing profile", zh: "缺少验证配置" },
        className: "badge badge-negative",
      };
    case "NO_TEST":
      return { label: { en: "No test", zh: "未自测" }, className: "badge badge-warning" };
    case "FAILED":
      return { label: { en: "Failed", zh: "自测失败" }, className: "badge badge-negative" };
    case "PASSED":
      return { label: { en: "Passed", zh: "已通过" }, className: "badge badge-positive" };
    case "OFFICIAL_EXEMPT":
      return { label: { en: "Exempt", zh: "官方豁免" }, className: "badge badge-ink" };
    case "OTHER":
    default:
      return { label: { en: "In progress", zh: "进行中" }, className: "badge badge-neutral" };
  }
}

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRegistryAdminSession();
  const locale = (await getCurrentLocale()) as "zh" | "en";
  const state = await getRegistryRuntime();
  const params = (await searchParams) ?? {};
  const riskFilter =
    typeof params.risk === "string"
      ? params.risk
      : Array.isArray(params.risk)
        ? params.risk[0]
        : "";
  const keywordValue =
    typeof params.q === "string"
      ? params.q
      : Array.isArray(params.q)
        ? params.q[0] ?? ""
        : "";
  const keyword = keywordValue.trim().toLowerCase();

  const records = listAllPluginVersionRecords(state).filter(
    (record) => record.reviewState === "SUBMITTED" || record.reviewState === "APPROVED",
  );

  const items = records
    .map((record) => {
      const bundle = state.demoBundles.get(`${record.slug}@${record.version}`) ?? null;
      const latestSession = summarizeVerificationSession({
        session:
          listPluginVersionTestSessions({
            state,
            pluginSlug: record.slug,
            version: record.version,
          })[0] ?? null,
        manifest: bundle?.pipelineResult.manifest ?? null,
        officialPlugin: isOfficialPluginSlug(record.slug),
      });

      return {
        record,
        latestSession,
        riskRank: latestSession ? getVerificationRiskRank(latestSession.reviewStatus) : 99,
      };
    })
    .filter((item) => {
      if (riskFilter && item.latestSession?.reviewStatus !== riskFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [item.record.slug, item.record.version]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    })
    .sort((left, right) => {
      if (left.riskRank !== right.riskRank) {
        return left.riskRank - right.riskRank;
      }

      return right.record.updatedAt.getTime() - left.record.updatedAt.getTime();
    });

  return (
    <section className="admin-shell">
      <div className="container admin-page">
        <div className="admin-header">
          <div className="admin-header-copy">
            <p className="text-eyebrow">{locale === "en" ? "Governance Review" : "治理审核"}</p>
            <h1 className="admin-title">{locale === "en" ? "Review queue" : "审核队列"}</h1>
            <p className="admin-subtitle">
              {locale === "en"
                ? "A quieter queue view for triage. Focus on risk state, current review state, and the latest publisher self-test signal."
                : "使用更克制的队列视图做审核分诊，优先关注风险状态、审核状态和最近一次发布者自测信号。"}
            </p>
          </div>
        </div>

        <div className="enterprise-panel">
          <div className="admin-header" style={{ marginBottom: 12 }}>
            <div className="console-filterbar">
              <Link href={governancePath("/review-queue")} className={riskFilter === "" ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}>{locale === "en" ? "All" : "全部"}</Link>
              <Link href={`${governancePath("/review-queue")}?risk=MISSING_PROFILE`} className={riskFilter === "MISSING_PROFILE" ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}>{locale === "en" ? "Missing profile" : "缺少验证配置"}</Link>
              <Link href={`${governancePath("/review-queue")}?risk=NO_TEST`} className={riskFilter === "NO_TEST" ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}>{locale === "en" ? "No test" : "未自测"}</Link>
              <Link href={`${governancePath("/review-queue")}?risk=FAILED`} className={riskFilter === "FAILED" ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}>{locale === "en" ? "Failed" : "自测失败"}</Link>
              <Link href={`${governancePath("/review-queue")}?risk=PASSED`} className={riskFilter === "PASSED" ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}>{locale === "en" ? "Passed" : "已通过"}</Link>
            </div>

            <form action={governancePath("/review-queue")} className="console-filterbar">
              {riskFilter ? <input type="hidden" name="risk" value={riskFilter} /> : null}
              <input
                type="search"
                name="q"
                defaultValue={keywordValue}
                className="input console-search"
                placeholder={locale === "en" ? "Search slug or version" : "搜索 slug 或版本"}
              />
              <button type="submit" className="btn btn-tertiary btn-sm">{locale === "en" ? "Search" : "搜索"}</button>
            </form>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{locale === "en" ? "Plugin" : "插件"}</th>
                  <th>{locale === "en" ? "Risk" : "风险"}</th>
                  <th>{locale === "en" ? "Review" : "审核"}</th>
                  <th>{locale === "en" ? "Self-test" : "自测"}</th>
                  <th>{locale === "en" ? "Mode" : "模式"}</th>
                  <th>{locale === "en" ? "Version" : "版本"}</th>
                  <th style={{ textAlign: "right" }}>{locale === "en" ? "Action" : "操作"}</th>
                </tr>
              </thead>
              <tbody>
                {items.map(({ record, latestSession }) => {
                  const tone = getStatusTone(latestSession?.reviewStatus ?? "OTHER");

                  return (
                    <tr key={`${record.slug}@${record.version}`}>
                      <td>
                        <div style={{ display: "grid", gap: 4 }}>
                          <p className="text-body-md-strong">{record.slug}</p>
                          <p className="text-caption">{locale === "en" ? "Updated" : "更新于"} {record.updatedAt.toISOString()}</p>
                        </div>
                      </td>
                      <td>
                        <span className={tone.className}>{tone.label[locale]}</span>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{record.reviewState}</span>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{latestSession?.status ?? "UNKNOWN"}</span>
                      </td>
                      <td className="text-body-sm text-body-color">{latestSession?.createPaymentMode ?? "—"}</td>
                      <td className="text-body-sm text-body-color">v{record.version}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link href={`/plugins/${record.slug}`} className="btn btn-tertiary btn-sm">
                        {locale === "en" ? "Open" : "打开"}
                      </Link>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
