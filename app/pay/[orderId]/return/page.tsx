import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  formatDateTime,
  formatMoney,
  getPaymentStatusLabel,
  getPaymentStatusTone,
} from "@/app/admin/support";
import { StatusBadge } from "@/app/admin/ui";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMerchantDisplayName } from "@/lib/merchant-profile-completion";
import { getMerchantPaymentOrder } from "@/lib/orders/service";
import { isTerminalPaymentStatus } from "@/lib/orders/status";
import { isRecord } from "@/lib/payments/utils";
import { getPrismaClient } from "@/lib/prisma";

function getMetadataUrl(metadata: unknown, key: string) {
  if (!isRecord(metadata)) {
    return null;
  }

  const value = metadata[key];

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function HostedPaymentReturnPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const locale = await getCurrentLocale();
  const { orderId } = await params;
  const prisma = getPrismaClient();
  const orderSeed = await prisma.paymentOrder.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      status: true,
      merchant: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!orderSeed) {
    notFound();
  }

  const order = await (async () => {
    try {
      return await getMerchantPaymentOrder({
        merchantCode: orderSeed.merchant.code,
        orderReference: orderSeed.id,
        syncWithProvider: !isTerminalPaymentStatus(orderSeed.status),
      });
    } catch {
      return getMerchantPaymentOrder({
        merchantCode: orderSeed.merchant.code,
        orderReference: orderSeed.id,
        syncWithProvider: false,
      });
    }
  })();

  if (order.status === "SUCCEEDED" && order.returnUrl?.trim()) {
    redirect(order.returnUrl);
  }

  const productUrl = getMetadataUrl(order.metadata, "productUrl");
  const storefrontUrl = getMetadataUrl(order.metadata, "storefrontUrl");
  const backToStoreUrl = productUrl ?? storefrontUrl;
  const merchantName = getMerchantDisplayName(order.merchant.name, locale);
  const content =
    locale === "en"
      ? {
          title: "Payment Status",
          description:
            "NovaPay has received your browser return from the payment provider. This page shows the latest tracked order status.",
          orderId: "Order ID",
          merchant: "Merchant",
          amount: "Amount",
          updatedAt: "Last Updated",
          paidAt: "Paid At",
          pendingHint:
            "If the payment has just been completed, the final result may take a short moment to synchronize. If the provider page looked abnormal, refresh here first before treating the order as failed.",
          successHint: "The order payment has been confirmed successfully.",
          failedHint:
            "The payment is not completed yet or has been closed. If the provider page showed a risk or system message, confirm the latest tracked result here first, then return to the hosted cashier if needed.",
          refresh: "Refresh Status",
          retry: "Return to Cashier",
          backToProduct: "Back to Product",
          backToStore: "Back to Store",
        }
      : {
          title: "支付结果",
          description: "NovaPay 已接收到支付渠道的浏览器返回。本页展示当前订单的最新跟踪状态。",
          orderId: "订单号",
          merchant: "商户",
          amount: "金额",
          updatedAt: "最近更新",
          paidAt: "支付时间",
          pendingHint:
            "如果刚完成支付，最终结果可能还需要几秒钟同步。若刚才支付宝或微信页面提示异常，请先在这里刷新状态，不要直接判定支付失败。",
          successHint: "当前订单已确认支付成功。",
          failedHint:
            "当前支付尚未完成或已关闭。若上游支付页刚才提示风险或系统异常，请先以这里的跟踪结果为准，再决定是否返回收银台重新发起支付。",
          refresh: "刷新状态",
          retry: "返回收银台",
          backToProduct: "返回商品页",
          backToStore: "返回商铺",
        };

  const hint =
    order.status === "SUCCEEDED"
      ? content.successHint
      : order.status === "PENDING" || order.status === "PROCESSING"
        ? content.pendingHint
        : content.failedHint;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fffaf3,#f6efe4)] px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-3xl rounded-[2rem] border border-line bg-white/90 p-6 shadow-[0_24px_80px_rgba(79,46,17,0.12)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-secondary">NovaPay</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{content.title}</h1>
        <p className="mt-3 text-sm leading-7 text-muted sm:text-base">{content.description}</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <StatusBadge tone={getPaymentStatusTone(order.status)}>
            {getPaymentStatusLabel(order.status, locale)}
          </StatusBadge>
          <span className="text-sm leading-6 text-muted">{hint}</span>
        </div>

        <section className="mt-8 grid gap-4 rounded-[1.5rem] border border-line bg-[#faf7f1] p-5 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.orderId}</p>
            <p className="mt-2 break-all font-mono text-sm text-foreground">{order.externalOrderId}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.merchant}</p>
            <p className="mt-2 text-sm text-foreground">{merchantName}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.amount}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatMoney(order.amount.toString(), order.currency, locale)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.updatedAt}</p>
            <p className="mt-2 text-sm text-foreground">{formatDateTime(order.updatedAt, locale)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.paidAt}</p>
            <p className="mt-2 text-sm text-foreground">{formatDateTime(order.paidAt, locale)}</p>
          </div>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/pay/${order.id}/return`}
            className="inline-flex items-center justify-center rounded-2xl bg-foreground px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            {content.refresh}
          </Link>
          {(order.status === "PENDING" || order.status === "PROCESSING") && order.checkoutUrl ? (
            <Link
              href={`/pay/${order.id}`}
              className="inline-flex items-center justify-center rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
            >
              {content.retry}
            </Link>
          ) : null}
          {backToStoreUrl ? (
            <a
              href={backToStoreUrl}
              className="inline-flex items-center justify-center rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
            >
              {productUrl ? content.backToProduct : content.backToStore}
            </a>
          ) : null}
        </div>
      </div>
    </main>
  );
}
