import { NextResponse } from "next/server";
import { MerchantStatus } from "@/generated/prisma/enums";
import { ensureAdminApiPermission } from "@/lib/admin-route-auth";
import { getPrismaClient } from "@/lib/prisma";
import { maskStoredSecret, migrateStoredSecret, sealStoredSecret } from "@/lib/secret-box";

function readOptionalString(body: Record<string, unknown>, key: string) {
  return typeof body[key] === "string" && body[key].trim() ? body[key].trim() : null;
}

function readMerchantStatus(body: Record<string, unknown>) {
  if (typeof body.status !== "string" || !body.status.trim()) {
    return null;
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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminApiPermission("merchant:read");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const prisma = getPrismaClient();
  const merchant = await prisma.merchant.findUnique({
    where: {
      id,
    },
    include: {
      channelBindings: {
        include: {
          merchantChannelAccount: {
            select: {
              id: true,
              displayName: true,
              channelCode: true,
              callbackToken: true,
              enabled: true,
            },
          },
        },
      },
      channelAccounts: {
        orderBy: [{ channelCode: "asc" }, { updatedAt: "desc" }],
      },
      _count: {
        select: {
          paymentOrders: true,
        },
      },
    },
  });

  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }

  return NextResponse.json(serializeMerchantForAdmin(merchant));
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminApiPermission("merchant:write");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;
  const prisma = getPrismaClient();

  const existing = await prisma.merchant.findUnique({
    where: {
      id,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }

  let nextStatus: MerchantStatus | null = null;

  try {
    nextStatus = readMerchantStatus(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "status is invalid." },
      { status: 400 },
    );
  }

  const merchantProfile = {
    name:
      typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name,
    legalName:
      body.legalName !== undefined ? readOptionalString(body, "legalName") : existing.legalName,
    contactName:
      body.contactName !== undefined ? readOptionalString(body, "contactName") : existing.contactName,
    contactPhone:
      body.contactPhone !== undefined ? readOptionalString(body, "contactPhone") : existing.contactPhone,
    companyRegistrationId:
      body.companyRegistrationId !== undefined
        ? readOptionalString(body, "companyRegistrationId")
        : existing.companyRegistrationId,
  };

  const merchant = await prisma.merchant.update({
    where: {
      id,
    },
    data: {
      ...(typeof body.name === "string" && body.name.trim() ? { name: merchantProfile.name } : {}),
      ...(typeof body.code === "string" && body.code.trim() ? { code: body.code.trim() } : {}),
      ...(body.legalName !== undefined ? { legalName: merchantProfile.legalName } : {}),
      ...(body.contactName !== undefined ? { contactName: merchantProfile.contactName } : {}),
      ...(body.contactEmail !== undefined ? { contactEmail: readOptionalString(body, "contactEmail") } : {}),
      ...(body.contactPhone !== undefined ? { contactPhone: merchantProfile.contactPhone } : {}),
      ...(body.website !== undefined ? { website: readOptionalString(body, "website") } : {}),
      ...(body.companyRegistrationId !== undefined
        ? { companyRegistrationId: merchantProfile.companyRegistrationId }
        : {}),
      ...(body.onboardingNote !== undefined
        ? { onboardingNote: readOptionalString(body, "onboardingNote") }
        : {}),
      ...(body.reviewNote !== undefined ? { reviewNote: readOptionalString(body, "reviewNote") } : {}),
      ...(nextStatus
        ? {
            status: nextStatus,
            statusChangedAt: new Date(),
            approvedAt: nextStatus === "APPROVED" ? existing.approvedAt ?? new Date() : existing.approvedAt,
            approvedBy: nextStatus === "APPROVED" ? auth.session.adminUser.email : existing.approvedBy,
          }
        : {}),
      ...(body.callbackBase !== undefined
        ? {
            callbackBase:
              typeof body.callbackBase === "string" && body.callbackBase.trim()
                ? body.callbackBase.trim()
                : null,
          }
        : {}),
      ...(body.apiIpWhitelist !== undefined
        ? {
            apiIpWhitelist: readOptionalString(body, "apiIpWhitelist"),
          }
        : {}),
      ...(body.notifySecret !== undefined
        ? {
            notifySecret:
              typeof body.notifySecret === "string" && body.notifySecret.trim()
                ? existing.notifySecret &&
                  body.notifySecret.trim() === maskStoredSecret(existing.notifySecret)
                  ? migrateStoredSecret(existing.notifySecret)
                  : sealStoredSecret(body.notifySecret.trim())
                : null,
          }
        : {}),
      ...(body.callbackEnabled !== undefined
        ? {
            callbackEnabled: body.callbackEnabled !== false,
          }
        : {}),
    },
  });

  return NextResponse.json(serializeMerchantForAdmin(merchant));
}
