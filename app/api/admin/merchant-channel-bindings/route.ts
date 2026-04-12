import { NextResponse } from "next/server";
import { ensureAdminApiPermission } from "@/lib/admin-route-auth";
import { getPrismaClient } from "@/lib/prisma";

function toDecimalValue(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("Amount values must be valid positive numbers.");
  }

  return numeric.toFixed(2);
}

function toFeeRateValue(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("feeRate must be a valid positive number.");
  }

  return numeric.toFixed(4);
}

export async function GET(request: Request) {
  const auth = await ensureAdminApiPermission("binding:read");

  if (!auth.ok) {
    return auth.response;
  }

  const prisma = getPrismaClient();
  const url = new URL(request.url);
  const merchantCode = url.searchParams.get("merchantCode")?.trim();

  const bindings = await prisma.merchantChannelBinding.findMany({
    where: merchantCode
      ? {
          merchant: {
            code: merchantCode,
          },
        }
      : undefined,
    include: {
      merchant: {
        select: {
          code: true,
          name: true,
        },
      },
      merchantChannelAccount: {
        select: {
          id: true,
          displayName: true,
          channelCode: true,
          callbackToken: true,
          enabled: true,
        },
      },
      providerAccount: {
        select: {
          id: true,
          displayName: true,
          channelCode: true,
          providerKey: true,
          enabled: true,
        },
      },
    },
    orderBy: [{ channelCode: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    bindings,
  });
}

export async function POST(request: Request) {
  const auth = await ensureAdminApiPermission("binding:write");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as Record<string, unknown>;

  if (typeof body.merchantCode !== "string" || !body.merchantCode.trim()) {
    return NextResponse.json({ error: "merchantCode is required." }, { status: 400 });
  }

  if (typeof body.channelCode !== "string" || !body.channelCode.trim()) {
    return NextResponse.json({ error: "channelCode is required." }, { status: 400 });
  }

  const prisma = getPrismaClient();
  const merchant = await prisma.merchant.findUnique({
    where: {
      code: body.merchantCode.trim(),
    },
  });

  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }

  if (body.providerAccountId !== undefined && body.providerAccountId !== null) {
    return NextResponse.json(
      {
        error:
          "providerAccountId is no longer supported. Bind the merchant to its own merchantChannelAccountId instead.",
      },
      { status: 410 },
    );
  }

  if (body.merchantChannelAccountId !== undefined && body.merchantChannelAccountId !== null) {
    if (
      typeof body.merchantChannelAccountId !== "string" ||
      !body.merchantChannelAccountId.trim()
    ) {
      return NextResponse.json(
        { error: "merchantChannelAccountId must be a string." },
        { status: 400 },
      );
    }

    const merchantChannelAccount = await prisma.merchantChannelAccount.findUnique({
      where: {
        id: body.merchantChannelAccountId.trim(),
      },
      select: {
        id: true,
        merchantId: true,
        channelCode: true,
      },
    });

    if (!merchantChannelAccount) {
      return NextResponse.json({ error: "Merchant channel account not found." }, { status: 404 });
    }

    if (merchantChannelAccount.merchantId !== merchant.id) {
      return NextResponse.json(
        { error: "Merchant channel account does not belong to this merchant." },
        { status: 422 },
      );
    }

    if (merchantChannelAccount.channelCode !== body.channelCode.trim()) {
      return NextResponse.json(
        { error: "Merchant channel account channelCode does not match binding channelCode." },
        { status: 422 },
      );
    }
  }

  try {
    const binding = await prisma.merchantChannelBinding.upsert({
      where: {
        merchantId_channelCode: {
          merchantId: merchant.id,
          channelCode: body.channelCode.trim(),
        },
      },
      update: {
        enabled: body.enabled !== false,
        providerAccountId: null,
        merchantChannelAccountId:
          typeof body.merchantChannelAccountId === "string"
            ? body.merchantChannelAccountId.trim()
            : null,
        minAmount: toDecimalValue(body.minAmount),
        maxAmount: toDecimalValue(body.maxAmount),
        feeRate: toFeeRateValue(body.feeRate),
      },
      create: {
        merchantId: merchant.id,
        channelCode: body.channelCode.trim(),
        enabled: body.enabled !== false,
        providerAccountId: null,
        merchantChannelAccountId:
          typeof body.merchantChannelAccountId === "string"
            ? body.merchantChannelAccountId.trim()
            : null,
        minAmount: toDecimalValue(body.minAmount),
        maxAmount: toDecimalValue(body.maxAmount),
        feeRate: toFeeRateValue(body.feeRate),
      },
      include: {
        merchant: {
          select: {
            code: true,
            name: true,
          },
        },
        merchantChannelAccount: {
          select: {
            id: true,
            displayName: true,
            channelCode: true,
            callbackToken: true,
            enabled: true,
          },
        },
        providerAccount: {
          select: {
            id: true,
            displayName: true,
            channelCode: true,
            providerKey: true,
            enabled: true,
          },
        },
      },
    });

    return NextResponse.json(binding, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save merchant binding.",
      },
      { status: 400 },
    );
  }
}
