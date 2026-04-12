import { IdempotencyStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { getPrismaClient } from "@/lib/prisma";
import { getSystemConfig } from "@/lib/system-config";

const DEFAULT_IDEMPOTENCY_LEASE_SECONDS = 30;
const DEFAULT_IDEMPOTENCY_RETENTION_DAYS = 7;

function parsePositiveInteger(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const numeric = Number(raw);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

async function getIdempotencyRuntimeConfig() {
  const [leaseSecondsRaw, retentionDaysRaw] = await Promise.all([
    getSystemConfig("IDEMPOTENCY_LEASE_SECONDS"),
    getSystemConfig("IDEMPOTENCY_RETENTION_DAYS"),
  ]);

  return {
    leaseSeconds: parsePositiveInteger(leaseSecondsRaw, DEFAULT_IDEMPOTENCY_LEASE_SECONDS),
    retentionDays: parsePositiveInteger(retentionDaysRaw, DEFAULT_IDEMPOTENCY_RETENTION_DAYS),
  };
}

function toJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue | undefined;
}

function isPrismaUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export function readIdempotencyKey(request: Request) {
  const rawKey = request.headers.get("Idempotency-Key");

  if (rawKey === null) {
    return null;
  }

  const key = rawKey.trim();

  if (!key) {
    throw new AppError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key must not be empty when provided.",
      400,
    );
  }

  if (key.length > 255) {
    throw new AppError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key must be 255 characters or fewer.",
      400,
    );
  }

  return key;
}

type IdempotencyBeginResult =
  | { kind: "disabled" }
  | { kind: "started"; key: string; recordId: string }
  | { kind: "replay"; key: string; recordId: string; httpStatus: number; responseBody: unknown }
  | { kind: "conflict"; key: string }
  | { kind: "in_progress"; key: string };

export async function beginMerchantIdempotencyCommand(input: {
  merchantId: string;
  apiCredentialId?: string | null;
  scope: string;
  idempotencyKey: string | null;
  requestHash: string;
  requestSummary?: Record<string, unknown>;
}): Promise<IdempotencyBeginResult> {
  if (!input.idempotencyKey) {
    return { kind: "disabled" };
  }

  const prisma = getPrismaClient();
  const config = await getIdempotencyRuntimeConfig();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + config.leaseSeconds * 1000);
  const retentionExpiresAt = new Date(now.getTime() + config.retentionDays * 24 * 60 * 60 * 1000);

  while (true) {
    const existing = await prisma.merchantIdempotencyRecord.findUnique({
      where: {
        merchantId_scope_idempotencyKey: {
          merchantId: input.merchantId,
          scope: input.scope,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: {
        id: true,
        idempotencyKey: true,
        requestHash: true,
        status: true,
        httpStatus: true,
        responseBody: true,
        leaseExpiresAt: true,
        apiCredentialId: true,
      },
    });

    if (!existing) {
      try {
        const created = await prisma.merchantIdempotencyRecord.create({
          data: {
            merchantId: input.merchantId,
            apiCredentialId: input.apiCredentialId ?? null,
            scope: input.scope,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            requestSummary: toJsonValue(input.requestSummary),
            status: IdempotencyStatus.PROCESSING,
            leaseExpiresAt,
            expiresAt: retentionExpiresAt,
            lastSeenAt: now,
          },
          select: {
            id: true,
          },
        });

        return {
          kind: "started",
          key: input.idempotencyKey,
          recordId: created.id,
        };
      } catch (error) {
        if (isPrismaUniqueConstraintError(error)) {
          continue;
        }

        throw error;
      }
    }

    if (existing.requestHash !== input.requestHash) {
      await prisma.merchantIdempotencyRecord.update({
        where: {
          id: existing.id,
        },
        data: {
          lastSeenAt: now,
        },
      });

      return {
        kind: "conflict",
        key: input.idempotencyKey,
      };
    }

    if (
      existing.status === IdempotencyStatus.SUCCEEDED ||
      existing.status === IdempotencyStatus.FAILED_FINAL
    ) {
      const replayed = await prisma.merchantIdempotencyRecord.update({
        where: {
          id: existing.id,
        },
        data: {
          replayCount: {
            increment: 1,
          },
          lastSeenAt: now,
          expiresAt: retentionExpiresAt,
        },
        select: {
          id: true,
          httpStatus: true,
          responseBody: true,
        },
      });

      return {
        kind: "replay",
        key: input.idempotencyKey,
        recordId: replayed.id,
        httpStatus: replayed.httpStatus ?? 200,
        responseBody: replayed.responseBody ?? {},
      };
    }

    const claimed = await prisma.merchantIdempotencyRecord.updateMany({
      where: {
        id: existing.id,
        requestHash: input.requestHash,
        OR: [
          {
            status: IdempotencyStatus.FAILED_RETRYABLE,
          },
          {
            status: IdempotencyStatus.PROCESSING,
            OR: [
              {
                leaseExpiresAt: {
                  lte: now,
                },
              },
              {
                leaseExpiresAt: null,
              },
            ],
          },
        ],
      },
      data: {
        status: IdempotencyStatus.PROCESSING,
        apiCredentialId: input.apiCredentialId ?? existing.apiCredentialId ?? null,
        requestSummary: toJsonValue(input.requestSummary),
        httpStatus: null,
        responseBody: Prisma.JsonNull,
        errorCode: null,
        errorMessage: null,
        resourceType: null,
        resourceId: null,
        leaseExpiresAt,
        completedAt: null,
        lastSeenAt: now,
        expiresAt: retentionExpiresAt,
      },
    });

    if (claimed.count === 1) {
      return {
        kind: "started",
        key: input.idempotencyKey,
        recordId: existing.id,
      };
    }

    await prisma.merchantIdempotencyRecord.update({
      where: {
        id: existing.id,
      },
      data: {
        lastSeenAt: now,
      },
    });

    return {
      kind: "in_progress",
      key: input.idempotencyKey,
    };
  }
}

export async function finishMerchantIdempotencySuccess(input: {
  recordId?: string | null;
  httpStatus: number;
  responseBody: unknown;
  resourceType?: string | null;
  resourceId?: string | null;
}) {
  if (!input.recordId) {
    return;
  }

  await getPrismaClient().merchantIdempotencyRecord.update({
    where: {
      id: input.recordId,
    },
    data: {
      status: IdempotencyStatus.SUCCEEDED,
      httpStatus: input.httpStatus,
      responseBody: toJsonValue(input.responseBody),
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      errorCode: null,
      errorMessage: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
    },
  });
}

export async function finishMerchantIdempotencyFinalError(input: {
  recordId?: string | null;
  httpStatus: number;
  responseBody: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  if (!input.recordId) {
    return;
  }

  await getPrismaClient().merchantIdempotencyRecord.update({
    where: {
      id: input.recordId,
    },
    data: {
      status: IdempotencyStatus.FAILED_FINAL,
      httpStatus: input.httpStatus,
      responseBody: toJsonValue(input.responseBody),
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      leaseExpiresAt: null,
      completedAt: new Date(),
    },
  });
}

export async function finishMerchantIdempotencyRetryableError(input: {
  recordId?: string | null;
  httpStatus?: number | null;
  responseBody?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  if (!input.recordId) {
    return;
  }

  await getPrismaClient().merchantIdempotencyRecord.update({
    where: {
      id: input.recordId,
    },
    data: {
      status: IdempotencyStatus.FAILED_RETRYABLE,
      httpStatus: input.httpStatus ?? 500,
      responseBody: toJsonValue(input.responseBody),
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      leaseExpiresAt: null,
      completedAt: new Date(),
    },
  });
}
