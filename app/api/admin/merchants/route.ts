import { NextResponse } from "next/server";
import { MerchantStatus } from "@/generated/prisma/enums";
import { ensureAdminApiPermission } from "@/lib/admin-route-auth";
import { getPrismaClient } from "@/lib/prisma";
import { maskStoredSecret, sealStoredSecret } from "@/lib/secret-box";

function readOptionalString(body: Record<string, unknown>, key: string) {
  return typeof body[key] === "string" && body[key].trim() ? body[key].trim() : null;
}

function readMerchantStatus(body: Record<string, unknown>) {
  if (typeof body.status !== "string" || !body.status.trim()) {
    return "APPROVED" as const;
  }

  if (body.status in MerchantStatus) {
    return body.status as MerchantStatus;
  }

  throw new Error("status is invalid.");
}

function serializeMerchantForAdmin<T extends { notifySecret: string | null }>(merchant: T) {
  return {
    ...merchant,
    notifySecret: maskStoredSecret(merchant.notifySecret),
  };
}

export async function GET(request: Request) {
  const auth = await ensureAdminApiPermission("merchant:read");

  if (!auth.ok) {
    return auth.response;
  }

  const prisma = getPrismaClient();
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();

  const merchants = await prisma.merchant.findMany({
    where: code
      ? {
          code,
        }
      : undefined,
    orderBy: [{ createdAt: "asc" }],
    include: {
      _count: {
        select: {
          paymentOrders: true,
          channelBindings: true,
        },
      },
    },
  });

  return NextResponse.json({
    merchants: merchants.map((merchant) => serializeMerchantForAdmin(merchant)),
  });
}

export async function POST(request: Request) {
  const auth = await ensureAdminApiPermission("merchant:write");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as Record<string, unknown>;

  if (typeof body.code !== "string" || !body.code.trim()) {
    return NextResponse.json({ error: "code is required." }, { status: 400 });
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  const prisma = getPrismaClient();
  let status: MerchantStatus;

  try {
    status = readMerchantStatus(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "status is invalid." },
      { status: 400 },
    );
  }

  const merchantProfile = {
    name: body.name.trim(),
    legalName: readOptionalString(body, "legalName"),
    contactName: readOptionalString(body, "contactName"),
    contactPhone: readOptionalString(body, "contactPhone"),
    companyRegistrationId: readOptionalString(body, "companyRegistrationId"),
  };

  const merchant = await prisma.merchant.create({
    data: {
      code: body.code.trim(),
      name: merchantProfile.name,
      status,
      legalName: merchantProfile.legalName,
      contactName: merchantProfile.contactName,
      contactEmail: readOptionalString(body, "contactEmail"),
      contactPhone: merchantProfile.contactPhone,
      website: readOptionalString(body, "website"),
      companyRegistrationId: merchantProfile.companyRegistrationId,
      onboardingNote: readOptionalString(body, "onboardingNote"),
      reviewNote: readOptionalString(body, "reviewNote"),
      approvedAt: status === "APPROVED" ? new Date() : null,
      approvedBy: status === "APPROVED" ? auth.session.adminUser.email : null,
      statusChangedAt: new Date(),
      callbackBase:
        typeof body.callbackBase === "string" && body.callbackBase.trim()
          ? body.callbackBase.trim()
          : null,
      apiIpWhitelist:
        typeof body.apiIpWhitelist === "string" && body.apiIpWhitelist.trim()
          ? body.apiIpWhitelist.trim()
          : null,
      notifySecret:
        typeof body.notifySecret === "string" && body.notifySecret.trim()
          ? sealStoredSecret(body.notifySecret.trim())
          : null,
      callbackEnabled: body.callbackEnabled !== false,
    },
  });

  return NextResponse.json(
    serializeMerchantForAdmin(merchant),
    { status: 201 },
  );
}
