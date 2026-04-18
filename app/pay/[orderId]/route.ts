import QRCode from "qrcode";
import { PaymentStatus } from "@/generated/prisma/enums";
import { getMerchantPaymentOrder } from "@/lib/orders/service";
import { isTerminalPaymentStatus } from "@/lib/orders/status";
import { isWxpayNativeChannelCode } from "@/lib/payments/channel-codes";
import { buildHostedPaymentReturnUrl } from "@/lib/payments/hosted-pages";
import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAmount(amount: string, currency: string) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

function normalizeHostedOrder(order: {
  id: string;
  externalOrderId: string;
  channelCode: string;
  checkoutUrl: string | null;
  status: PaymentStatus;
  subject: string;
  amount: { toString(): string };
  currency: string;
  expireAt: Date | null;
  merchant: { code: string };
}) {
  return {
    id: order.id,
    externalOrderId: order.externalOrderId,
    channelCode: order.channelCode,
    checkoutUrl: order.checkoutUrl,
    status: order.status,
    subject: order.subject,
    amount: order.amount.toString(),
    currency: order.currency,
    expireAt: order.expireAt,
    merchant: {
      code: order.merchant.code,
    },
  };
}

async function renderWxpayCheckoutPage(input: {
  orderId: string;
  externalOrderId: string;
  subject: string;
  amount: string;
  currency: string;
  checkoutUrl: string;
  expireAt: Date | null;
}) {
  const qrDataUrl = await QRCode.toDataURL(input.checkoutUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
  const canOpenWechatApp = input.checkoutUrl.startsWith("weixin://");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>微信支付测试</title>
    <style>
      :root {
        color-scheme: light;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        background:
          radial-gradient(circle at top, rgba(52, 199, 89, 0.15), transparent 38%),
          linear-gradient(180deg, #f4fbf5 0%, #edf7ef 100%);
        color: #163024;
      }

      main {
        width: min(100%, 920px);
        border-radius: 32px;
        border: 1px solid rgba(22, 48, 36, 0.08);
        background: rgba(255, 255, 255, 0.95);
        box-shadow: 0 28px 90px rgba(22, 48, 36, 0.12);
        overflow: hidden;
      }

      .layout {
        display: grid;
        gap: 0;
      }

      @media (min-width: 860px) {
        .layout {
          grid-template-columns: 380px 1fr;
        }
      }

      .qr-panel {
        padding: 32px 28px;
        background: linear-gradient(180deg, #1f7a3e 0%, #155a2e 100%);
        color: white;
      }

      .content-panel {
        padding: 32px 28px;
      }

      .eyebrow {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        opacity: 0.78;
      }

      h1 {
        margin: 12px 0 0;
        font-size: 34px;
        line-height: 1.15;
      }

      .lead {
        margin: 14px 0 0;
        font-size: 15px;
        line-height: 1.8;
        color: rgba(255, 255, 255, 0.84);
      }

      .qr-card {
        margin-top: 28px;
        border-radius: 28px;
        padding: 20px;
        background: rgba(255, 255, 255, 0.12);
        backdrop-filter: blur(10px);
      }

      .qr-frame {
        border-radius: 22px;
        padding: 14px;
        background: white;
      }

      .qr-frame img {
        display: block;
        width: 100%;
        height: auto;
      }

      .qr-tip {
        margin: 16px 0 0;
        font-size: 13px;
        line-height: 1.8;
        color: rgba(255, 255, 255, 0.9);
      }

      .meta-grid {
        display: grid;
        gap: 14px;
        margin-top: 20px;
      }

      @media (min-width: 560px) {
        .meta-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      .meta-item {
        border-radius: 22px;
        border: 1px solid rgba(22, 48, 36, 0.08);
        background: #f6faf7;
        padding: 16px 18px;
      }

      .meta-label {
        margin: 0;
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #5d7666;
      }

      .meta-value {
        margin: 10px 0 0;
        color: #163024;
        line-height: 1.75;
        word-break: break-all;
      }

      .amount {
        font-size: 32px;
        font-weight: 700;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 24px;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0 18px;
        border-radius: 999px;
        border: 1px solid #d3e4d8;
        background: white;
        color: #163024;
        font-size: 14px;
        font-weight: 600;
        text-decoration: none;
      }

      .button.primary {
        border-color: #1f7a3e;
        background: #1f7a3e;
        color: white;
      }

      .hint {
        margin: 18px 0 0;
        font-size: 13px;
        line-height: 1.8;
        color: #5d7666;
      }

      .code {
        margin-top: 18px;
        border-radius: 22px;
        background: #f7f9f8;
        padding: 14px 16px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px;
        line-height: 1.8;
        color: #365343;
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="layout">
        <section class="qr-panel">
          <p class="eyebrow">NovaPay</p>
          <h1>请使用微信扫码支付</h1>
          <p class="lead">这是平台托管的微信 Native 收银页。请使用微信扫一扫完成 0.01 元支付测试，支付成功后页面会自动刷新状态。</p>
          <div class="qr-card">
            <div class="qr-frame">
              <img src="${escapeHtml(qrDataUrl)}" alt="微信支付二维码" />
            </div>
            <p class="qr-tip">扫码后请在微信内完成支付确认。若已支付成功但页面未更新，可点击右侧“刷新支付状态”。</p>
          </div>
        </section>

        <section class="content-panel">
          <p class="eyebrow" style="color:#5d7666;">Payment Test</p>
          <h1 style="color:#163024;">${escapeHtml(input.subject)}</h1>

          <div class="meta-grid">
            <article class="meta-item">
              <p class="meta-label">测试金额</p>
              <p class="meta-value amount">${escapeHtml(formatAmount(input.amount, input.currency))}</p>
            </article>
            <article class="meta-item">
              <p class="meta-label">订单号</p>
              <p class="meta-value">${escapeHtml(input.externalOrderId)}</p>
            </article>
            <article class="meta-item">
              <p class="meta-label">系统订单 ID</p>
              <p class="meta-value">${escapeHtml(input.orderId)}</p>
            </article>
            <article class="meta-item">
              <p class="meta-label">失效时间</p>
              <p class="meta-value">${escapeHtml(input.expireAt ? input.expireAt.toLocaleString("zh-CN", { hour12: false }) : "按通道默认时效")}</p>
            </article>
          </div>

          <div class="actions">
            <a class="button primary" href="/pay/${escapeHtml(input.orderId)}/return">刷新支付状态</a>
            <a class="button" href="/merchant/orders">查看订单列表</a>
            ${
              canOpenWechatApp
                ? `<a class="button" href="${escapeHtml(input.checkoutUrl)}">尝试直接拉起微信</a>`
                : ""
            }
          </div>

          <p class="hint">行业默认做法是平台展示二维码，由微信客户端扫码完成支付。商户不需要自己拼二维码，也不需要自己处理微信上游回调地址。</p>
          <div class="code">${escapeHtml(input.checkoutUrl)}</div>
        </section>
      </div>
    </main>
    <script>
      window.setTimeout(() => {
        window.location.reload();
      }, 6000);
    </script>
  </body>
</html>`;
}

function renderAlipayCheckoutPage(input: {
  orderId: string;
  externalOrderId: string;
  subject: string;
  amount: string;
  currency: string;
  checkoutUrl: string;
  expireAt: Date | null;
}) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>支付宝支付</title>
    <style>
      :root {
        color-scheme: light;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        background:
          radial-gradient(circle at top, rgba(22, 119, 255, 0.16), transparent 38%),
          linear-gradient(180deg, #f6f9ff 0%, #eef3fb 100%);
        color: #17314f;
      }

      main {
        width: min(100%, 980px);
        border-radius: 32px;
        border: 1px solid rgba(23, 49, 79, 0.08);
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 28px 90px rgba(23, 49, 79, 0.12);
        overflow: hidden;
      }

      .layout {
        display: grid;
      }

      @media (min-width: 900px) {
        .layout {
          grid-template-columns: 400px 1fr;
        }
      }

      .hero-panel {
        padding: 34px 30px;
        background: linear-gradient(180deg, #1677ff 0%, #0f5ed6 100%);
        color: white;
      }

      .content-panel {
        padding: 34px 30px;
      }

      .eyebrow {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        opacity: 0.82;
      }

      h1 {
        margin: 12px 0 0;
        font-size: 34px;
        line-height: 1.15;
      }

      .lead {
        margin: 14px 0 0;
        font-size: 15px;
        line-height: 1.9;
      }

      .hero-card {
        margin-top: 28px;
        border-radius: 28px;
        padding: 22px;
        background: rgba(255, 255, 255, 0.12);
        backdrop-filter: blur(10px);
      }

      .hero-card h2 {
        margin: 0;
        font-size: 18px;
      }

      .hero-card p {
        margin: 12px 0 0;
        font-size: 14px;
        line-height: 1.9;
        color: rgba(255, 255, 255, 0.9);
      }

      .amount-box {
        margin-top: 18px;
        border-radius: 22px;
        background: rgba(9, 33, 71, 0.18);
        padding: 16px 18px;
      }

      .amount-label {
        margin: 0;
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.72);
      }

      .amount-value {
        margin: 10px 0 0;
        font-size: 34px;
        font-weight: 700;
        line-height: 1.2;
      }

      .notice {
        border-radius: 24px;
        border: 1px solid #d6e4ff;
        background: #f5f9ff;
        padding: 18px 20px;
      }

      .notice h2 {
        margin: 0;
        font-size: 17px;
        color: #17314f;
      }

      .notice p {
        margin: 10px 0 0;
        font-size: 14px;
        line-height: 1.9;
        color: #4a6481;
      }

      .meta-grid {
        display: grid;
        gap: 14px;
        margin-top: 22px;
      }

      @media (min-width: 560px) {
        .meta-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      .meta-item {
        border-radius: 22px;
        border: 1px solid rgba(23, 49, 79, 0.08);
        background: #fbfcff;
        padding: 16px 18px;
      }

      .meta-label {
        margin: 0;
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #69829f;
      }

      .meta-value {
        margin: 10px 0 0;
        color: #17314f;
        line-height: 1.8;
        word-break: break-all;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 26px;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 0 20px;
        border-radius: 999px;
        border: 1px solid #d6e4ff;
        background: white;
        color: #17314f;
        font-size: 14px;
        font-weight: 600;
        text-decoration: none;
        transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
      }

      .button:hover {
        transform: translateY(-1px);
        border-color: #1677ff;
      }

      .button.primary {
        border-color: #1677ff;
        background: #1677ff;
        color: white;
        box-shadow: 0 18px 40px rgba(22, 119, 255, 0.24);
      }

      .tip-list {
        margin: 22px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 12px;
      }

      .tip-list li {
        border-radius: 20px;
        background: #f8fafc;
        padding: 14px 16px;
        font-size: 13px;
        line-height: 1.9;
        color: #516b88;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="layout">
        <section class="hero-panel">
          <p class="eyebrow">NovaPay</p>
          <h1>请前往支付宝完成支付</h1>
          <p class="lead">NovaPay 已为当前订单准备好支付宝收银台。为避免直接暴露上游地址，本页只提供统一的支付入口和状态刷新动作。</p>

          <div class="hero-card">
            <h2>支付说明</h2>
            <p>点击“前往支付宝支付”后，会在新窗口打开支付宝收银台。支付完成后，请返回当前页面刷新结果。</p>
            <div class="amount-box">
              <p class="amount-label">当前支付金额</p>
              <p class="amount-value">${escapeHtml(formatAmount(input.amount, input.currency))}</p>
            </div>
          </div>
        </section>

        <section class="content-panel">
          <div class="notice">
            <h2>${escapeHtml(input.subject)}</h2>
            <p>如果支付宝打开后提示异常、风控或系统错误，这通常是上游收银台对该笔订单的状态校验结果，不代表 NovaPay 当前页面样式异常。你可以返回本页刷新支付状态，确认该订单是否已支付、已关闭或已失效。</p>
          </div>

          <div class="meta-grid">
            <article class="meta-item">
              <p class="meta-label">商户订单号</p>
              <p class="meta-value">${escapeHtml(input.externalOrderId)}</p>
            </article>
            <article class="meta-item">
              <p class="meta-label">系统订单 ID</p>
              <p class="meta-value">${escapeHtml(input.orderId)}</p>
            </article>
            <article class="meta-item">
              <p class="meta-label">支付金额</p>
              <p class="meta-value">${escapeHtml(formatAmount(input.amount, input.currency))}</p>
            </article>
            <article class="meta-item">
              <p class="meta-label">失效时间</p>
              <p class="meta-value">${escapeHtml(input.expireAt ? input.expireAt.toLocaleString("zh-CN", { hour12: false }) : "按通道默认时效")}</p>
            </article>
          </div>

          <div class="actions">
            <a
              class="button primary"
              href="${escapeHtml(input.checkoutUrl)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              前往支付宝支付
            </a>
            <a class="button" href="/pay/${escapeHtml(input.orderId)}/return">刷新支付状态</a>
          </div>

          <ul class="tip-list">
            <li>支付成功后，支付宝通常会自动回跳或关闭支付窗口；如果没有，请手动返回当前页查看结果。</li>
            <li>如果支付宝提示订单异常或风险拦截，优先先点“刷新支付状态”，不要仅凭上游错误页判断订单失败。</li>
            <li>如果订单仍为未支付状态，建议关闭当前订单后重新创建一笔新的支付单再测试。</li>
          </ul>
        </section>
      </div>
    </main>
  </body>
</html>`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  const prisma = getPrismaClient();
  const orderSeed = await prisma.paymentOrder.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      externalOrderId: true,
      channelCode: true,
      checkoutUrl: true,
      status: true,
      subject: true,
      amount: true,
      currency: true,
      expireAt: true,
      merchant: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!orderSeed) {
    return new Response("Order not found.", { status: 404 });
  }

  let order = normalizeHostedOrder(orderSeed);

  if ((isWxpayNativeChannelCode(order.channelCode) || order.channelCode === "alipay.page") && !isTerminalPaymentStatus(order.status)) {
    try {
      const synced = await getMerchantPaymentOrder({
        merchantCode: order.merchant.code,
        orderReference: order.id,
        syncWithProvider: true,
      });

      order = normalizeHostedOrder(synced);
    } catch {}
  }

  if (!order.checkoutUrl) {
    return new Response("Checkout URL is not ready yet.", { status: 409 });
  }

  if (isWxpayNativeChannelCode(order.channelCode)) {
    if (isTerminalPaymentStatus(order.status)) {
      return Response.redirect(buildHostedPaymentReturnUrl(order.id), 302);
    }

    const html = await renderWxpayCheckoutPage({
      orderId: order.id,
      externalOrderId: order.externalOrderId,
      subject: order.subject,
      amount: order.amount,
      currency: order.currency,
      checkoutUrl: order.checkoutUrl,
      expireAt: order.expireAt,
    });

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (order.channelCode === "alipay.page") {
    if (isTerminalPaymentStatus(order.status)) {
      return Response.redirect(buildHostedPaymentReturnUrl(order.id), 302);
    }

    const html = renderAlipayCheckoutPage({
      orderId: order.id,
      externalOrderId: order.externalOrderId,
      subject: order.subject,
      amount: order.amount,
      currency: order.currency,
      checkoutUrl: order.checkoutUrl,
      expireAt: order.expireAt,
    });

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: order.checkoutUrl,
      "cache-control": "no-store",
    },
  });
}
