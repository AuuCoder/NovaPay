import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const configured = Boolean(process.env.DATABASE_URL);

  if (!configured) {
    return NextResponse.json({
      status: "degraded",
      database: {
        configured: false,
        reachable: false,
      },
      message: "DATABASE_URL is not configured yet.",
    });
  }

  try {
    const prisma = getPrismaClient();

    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      database: {
        configured: true,
        reachable: true,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        database: {
          configured: true,
          reachable: false,
        },
        message: error instanceof Error ? error.message : "Unknown database error",
      },
      { status: 500 },
    );
  }
}
