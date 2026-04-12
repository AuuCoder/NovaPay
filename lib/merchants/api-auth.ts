import { AppError } from "@/lib/errors";
import { assertMerchantRequestIpAllowed } from "@/lib/merchants/security";
import { verifyMerchantRequestSignature } from "@/lib/merchants/signature";
import { getPrismaClient } from "@/lib/prisma";
import { getRequestClientIp } from "@/lib/request-ip";

export async function authenticateMerchantApiRequest(input: {
  request: Request;
  rawBody: string;
  merchantCode: string;
}) {
  const prisma = getPrismaClient();
  const merchant = await prisma.merchant.findUnique({
    where: {
      code: input.merchantCode,
    },
    select: {
      id: true,
      code: true,
      apiIpWhitelist: true,
      apiCredentials: {
        select: {
          id: true,
          keyId: true,
          secretCiphertext: true,
          enabled: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!merchant) {
    throw new AppError("MERCHANT_NOT_FOUND", `Merchant ${input.merchantCode} was not found.`, 404);
  }

  assertMerchantRequestIpAllowed({
    merchantCode: merchant.code,
    clientIp: getRequestClientIp(input.request),
    apiIpWhitelist: merchant.apiIpWhitelist,
  });

  const auth = await verifyMerchantRequestSignature({
    request: input.request,
    rawBody: input.rawBody,
    merchant,
  });

  if (auth.credentialId) {
    await prisma.merchantApiCredential.update({
      where: {
        id: auth.credentialId,
      },
      data: {
        lastUsedAt: new Date(),
      },
    });
  }

  return {
    merchant,
    auth,
  };
}
