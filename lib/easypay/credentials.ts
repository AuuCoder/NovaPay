import { randomBytes, randomInt } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import {
  DEFAULT_EASYPAY_TYPE_MAPPING,
  parseTypeMapping,
  type EasyPayTypeMapping,
} from "@/lib/easypay/mapping";
import { getPrismaClient } from "@/lib/prisma";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secret-box";

/**
 * 易支付凭证的生成与读取。
 *
 * - pid:6 位数字起步的随机数字串(易支付客户端通常把 pid 当数字处理)。
 * - KEY:随机串,加密存 `keyCiphertext`,展示用 `keyPreview`。
 * 仿 lib/merchant-credentials.ts 的生成 + 唯一冲突重试模式。
 */

type EasyPayCredentialWriter = Pick<PrismaClient, "easyPayCredential">;

function generatePid() {
  // 10 位数字 pid,首位非 0。
  return `${randomInt(1, 10)}${randomInt(0, 1_000_000_000).toString().padStart(9, "0")}`;
}

function generateKey() {
  return randomBytes(16).toString("hex");
}

export function generateEasyPayCredentialMaterial() {
  const pid = generatePid();
  const key = generateKey();

  return {
    pid,
    key,
    keyPreview: maskSecret(key) ?? "********",
    keyCiphertext: encryptSecret(key),
  };
}

export function revealEasyPayKey(credential: { keyCiphertext: string }) {
  return decryptSecret(credential.keyCiphertext);
}

export interface CreateEasyPayCredentialInput {
  merchantId: string;
  label: string;
  typeMapping?: EasyPayTypeMapping;
}

/**
 * 创建一条易支付凭证,pid 唯一冲突时重试。返回记录与一次性明文材料。
 */
export async function createEasyPayCredentialRecord(
  prisma: EasyPayCredentialWriter,
  input: CreateEasyPayCredentialInput,
) {
  const typeMapping = input.typeMapping ?? DEFAULT_EASYPAY_TYPE_MAPPING;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const material = generateEasyPayCredentialMaterial();

    try {
      const credential = await prisma.easyPayCredential.create({
        data: {
          merchantId: input.merchantId,
          label: input.label,
          pid: material.pid,
          keyCiphertext: material.keyCiphertext,
          keyPreview: material.keyPreview,
          typeMapping: typeMapping as Prisma.InputJsonValue,
          enabled: true,
        },
      });

      return { credential, material };
    } catch (error) {
      if (isPidUniqueConstraintError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new AppError(
    "EASYPAY_CREDENTIAL_GENERATION_FAILED",
    "系统生成易支付凭证失败,请稍后重试。",
    500,
  );
}

function isPidUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * 按 pid 查凭证(连带 merchant 的鉴权/状态字段)。
 * 出站 notify 也用它,因此**不**在这里过滤 enabled —— 由调用方按场景决定。
 */
export async function loadEasyPayCredentialByPid(pid: string) {
  const prisma = getPrismaClient();
  return prisma.easyPayCredential.findUnique({
    where: { pid },
    include: {
      merchant: {
        select: {
          id: true,
          code: true,
          status: true,
          apiIpWhitelist: true,
          callbackEnabled: true,
        },
      },
    },
  });
}

export function getCredentialTypeMapping(credential: { typeMapping: unknown }) {
  return parseTypeMapping(credential.typeMapping);
}
