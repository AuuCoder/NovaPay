import Link from "next/link";
import { CaptureLabClient } from "./capture-lab-client";
import { getCurrentLocale } from "@/lib/i18n-server";

export default async function CtfCaptureLabPage() {
  const locale = await getCurrentLocale();
  const content =
    locale === "en"
      ? {
          eyebrow: "CTF Capture Lab",
          title: "Packet-capturable sandbox payment app",
          intro:
            "This lab app creates signed app-like traffic, emits encoded bill envelopes, and lets the collector replay decoded bill rows into NovaPay's CTF bill-capture gateway.",
          backHome: "Back home",
          docs: "API docs",
          flowTitle: "Training flow",
          flow: [
            "Start a session and observe session/device material in app traffic.",
            "Simulate a payment; the app signs POST /api/ctf/capture-lab/pay with HMAC-SHA256.",
            "Capture POST /api/ctf/capture-lab/bills and decode the base64url JSON envelope.",
            "Submit rows[0] to /api/ctf/bill-capture/{accountId}/{token} to match a NovaPay order.",
          ],
          signatureTitle: "Signature target",
          signatureBody:
            "x-lab-signature = hex(hmac_sha256(deviceSecret, METHOD + '\\n' + PATH + '\\n' + TIMESTAMP_MS + '\\n' + NONCE + '\\n' + RAW_BODY))",
          startSession: "Start sandbox app session",
          sessionReady: "Session ready. Now trigger pay/bills requests and capture them.",
          hiddenSecretHint:
            "The sandbox intentionally exposes this secret to the frontend so CTF players can recover signing material through packet capture, Hook, or reverse analysis.",
          deviceId: "Device ID",
          sessionId: "Session ID",
          deviceSecret: "Device Secret",
          channel: "Channel",
          amount: "Amount",
          remark: "Remark / order hint",
          payer: "Payer account",
          simulatePayment: "Simulate payment",
          fetchBills: "Fetch bill envelope",
          decodedRows: "Decoded rows",
          envelope: "Captured envelope",
          signedRequest: "Signed request",
          canonical: "Canonical string + headers",
          response: "Latest response",
          collectorTitle: "Replay into NovaPay collector",
          collectorIntro:
            "Paste the merchant channel accountId/token from the CTF monitor channel, then replay the decoded first row.",
          accountPlaceholder: "accountId",
          tokenPlaceholder: "token",
          collectorSecretPlaceholder: "collectorSecret required",
          buildCurl: "Build curl",
          copyPayload: "Copy payload",
          noRows: "No bill rows yet. Simulate payment, then fetch bills.",
          errorPrefix: "Error: ",
        }
      : {
          eyebrow: "CTF 抓包实验 App",
          title: "可抓包的沙箱收款 App",
          intro:
            "这个实验 App 会产生类似移动端的签名请求、生成编码账单 envelope，并把解码后的账单行接到 NovaPay 的 CTF 账单捕获网关。",
          backHome: "返回首页",
          docs: "接口文档",
          flowTitle: "训练流程",
          flow: [
            "启动 session，在 App 流量里观察 session/device 材料。",
            "模拟支付；前端会用 HMAC-SHA256 签名 POST /api/ctf/capture-lab/pay。",
            "抓 POST /api/ctf/capture-lab/bills，解码 base64url JSON envelope。",
            "把 rows[0] 投递到 /api/ctf/bill-capture/{accountId}/{token}，匹配 NovaPay 订单。",
          ],
          signatureTitle: "签名目标",
          signatureBody:
            "x-lab-signature = hex(hmac_sha256(deviceSecret, METHOD + '\\n' + PATH + '\\n' + TIMESTAMP_MS + '\\n' + NONCE + '\\n' + RAW_BODY))",
          startSession: "启动沙箱 App 会话",
          sessionReady: "会话已启动。现在可以触发 pay/bills 请求并抓包。",
          hiddenSecretHint:
            "这里故意把 secret 放在前端沙箱 App 中，方便 CTF 训练者通过抓包、Hook 或逆向前端逻辑恢复签名材料。",
          deviceId: "设备 ID",
          sessionId: "会话 ID",
          deviceSecret: "设备 Secret",
          channel: "通道",
          amount: "金额",
          remark: "备注 / 订单提示",
          payer: "付款账号",
          simulatePayment: "模拟支付",
          fetchBills: "拉取账单 envelope",
          decodedRows: "解码账单行",
          envelope: "抓到的 envelope",
          signedRequest: "签名请求",
          canonical: "待签名串 + 请求头",
          response: "最近响应",
          collectorTitle: "回放到 NovaPay 采集端",
          collectorIntro:
            "填入商户 CTF 监控通道里的 accountId/token，再把解码出的第一条账单回放到平台。",
          accountPlaceholder: "accountId",
          tokenPlaceholder: "token",
          collectorSecretPlaceholder: "collectorSecret 必填",
          buildCurl: "生成 curl",
          copyPayload: "复制载荷",
          noRows: "还没有账单。先模拟支付，再拉取账单。",
          errorPrefix: "错误：",
        };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-line bg-panel-strong p-8 shadow-[var(--shadow)] sm:p-12">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-secondary via-accent to-secondary" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-secondary">
              {content.eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {content.title}
            </h1>
            <p className="mt-4 text-base leading-8 text-muted sm:text-lg">{content.intro}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-2xl border border-line bg-white/85 px-4 py-3 text-sm font-medium text-foreground"
            >
              {content.backHome}
            </Link>
            <Link
              href="/docs"
              className="rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-white"
            >
              {content.docs}
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.75rem] border border-line bg-panel p-6 shadow-[0_16px_50px_rgba(79,46,17,0.08)]">
          <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.flowTitle}</p>
          <ol className="mt-4 space-y-3 text-sm leading-7 text-muted">
            {content.flow.map((item, index) => (
              <li key={item} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-[1.75rem] border border-line bg-[#1e1812] p-6 text-[#f7efe5] shadow-[0_18px_60px_rgba(20,15,10,0.24)]">
          <p className="text-xs uppercase tracking-[0.22em] text-[#d6c0a6]">
            {content.signatureTitle}
          </p>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-black/20 p-4 text-xs leading-7 text-[#f7efe5]">
            {content.signatureBody}
          </pre>
        </div>
      </section>

      <CaptureLabClient content={content} />
    </main>
  );
}
