import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import { applyPaymentNotification } from "@/lib/orders/service";
import { getMerchantChannelAccountBySecureRoute } from "@/lib/payments/provider-accounts";
import { wxpayNativeProvider } from "@/lib/payments/providers/wxpay-native";
import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";

function successResponse() {
  return new NextResponse(null, {
    status: 204,
  });
}

function failureResponse(status: number, message: string) {
  return NextResponse.json(
    {
      code: "FAIL",
      message,
    },
    { status },
  );
}

function toHeaderRecord(headers: Headers) {
  return Object.fromEntries(Array.from(headers.entries()));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string; token: string }> },
) {
  try {
    const routeParams = await context.params;
    const runtimeAccount = await getMerchantChannelAccountBySecureRoute({
      accountId: routeParams.accountId,
      callbackToken: routeParams.token,
    });

    if (!runtimeAccount) {
      return failureResponse(404, "merchant channel account not found");
    }

    const rawBody = await request.text();
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const notification = wxpayNativeProvider.parseNotification?.(
      {
        rawBody,
        body,
        headers: toHeaderRecord(request.headers),
      },
      runtimeAccount,
    );

    if (!notification) {
      throw new Error("WeChat Pay notification parser is unavailable.");
    }

    const order = await getPrismaClient().paymentOrder.findUnique({
      where: {
        id: notification.orderId,
      },
      select: {
        merchantChannelAccountId: true,
      },
    });

    if (!order || order.merchantChannelAccountId !== routeParams.accountId) {
      return failureResponse(404, "order not found");
    }

    await applyPaymentNotification(notification);

    return successResponse();
  } catch (error) {
    return failureResponse(
      isAppError(error) ? error.status : 400,
      error instanceof Error ? error.message : "invalid notification",
    );
  }
}
