import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import { applyPaymentNotification } from "@/lib/orders/service";
import { alipayPageProvider } from "@/lib/payments/providers/alipay-page";
import { getMerchantChannelAccountBySecureRoute } from "@/lib/payments/provider-accounts";
import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";

function parseSearchParams(input: URLSearchParams) {
  const params: Record<string, string> = {};

  for (const [key, value] of input.entries()) {
    params[key] = value;
  }

  return params;
}

function successText() {
  return new NextResponse("success", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function failureText(status: number, message: string) {
  return new NextResponse(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

async function handleNotification(
  params: Record<string, string>,
  routeParams: { accountId: string; token: string },
) {
  const prisma = getPrismaClient();
  const runtimeAccount = await getMerchantChannelAccountBySecureRoute({
    accountId: routeParams.accountId,
    callbackToken: routeParams.token,
  });

  if (!runtimeAccount) {
    return failureText(404, "merchant channel account not found");
  }

  const orderId = params.out_trade_no;

  if (!orderId) {
    throw new Error("Alipay notification is missing out_trade_no.");
  }

  const order = await prisma.paymentOrder.findUnique({
    where: {
      id: orderId,
    },
    select: {
      merchantChannelAccountId: true,
    },
  });

  if (!order || order.merchantChannelAccountId !== routeParams.accountId) {
    return failureText(404, "order not found");
  }

  const notification = alipayPageProvider.parseNotification?.(params, runtimeAccount);

  if (!notification) {
    throw new Error("Alipay notification parser is unavailable.");
  }

  await applyPaymentNotification(notification);

  return successText();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string; token: string }> },
) {
  try {
    const body = await request.text();
    return await handleNotification(parseSearchParams(new URLSearchParams(body)), await context.params);
  } catch (error) {
    return failureText(
      isAppError(error) ? error.status : 400,
      error instanceof Error ? error.message : "invalid notification",
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ accountId: string; token: string }> },
) {
  try {
    const url = new URL(request.url);
    return await handleNotification(parseSearchParams(url.searchParams), await context.params);
  } catch (error) {
    return failureText(
      isAppError(error) ? error.status : 400,
      error instanceof Error ? error.message : "invalid notification",
    );
  }
}
