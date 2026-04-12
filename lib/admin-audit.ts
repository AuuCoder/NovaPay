import type { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";

interface AdminAuditInput {
  actor?: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}

export async function writeAdminAuditLog(input: AdminAuditInput) {
  const prisma = getPrismaClient();

  try {
    await prisma.adminAuditLog.create({
      data: {
        actor: input.actor ?? "system",
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        summary: input.summary,
        metadata: input.metadata,
      },
    });
  } catch (error) {
    console.error("Failed to write admin audit log", error);
  }
}
