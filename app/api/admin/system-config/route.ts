import { NextResponse } from "next/server";
import { ensureAdminApiPermission } from "@/lib/admin-route-auth";
import {
  getAllSystemConfigs,
  setSystemConfigs,
} from "@/lib/system-config";

export async function GET() {
  const auth = await ensureAdminApiPermission("system_config:read");

  if (!auth.ok) {
    return auth.response;
  }

  const configs = await getAllSystemConfigs();

  return NextResponse.json({
    configs,
  });
}

export async function PUT(request: Request) {
  const auth = await ensureAdminApiPermission("system_config:write");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as {
    configs?: Array<{ key?: unknown; value?: unknown; group?: unknown; label?: unknown }>;
  };

  if (!Array.isArray(body.configs) || body.configs.length === 0) {
    return NextResponse.json({ error: "configs must be a non-empty array." }, { status: 400 });
  }

  let normalized: Array<{ key: string; value: string; group?: string; label?: string }>;

  try {
    normalized = body.configs.map((config) => {
      if (typeof config.key !== "string" || !config.key.trim()) {
        throw new Error("config.key is required.");
      }

      if (typeof config.value !== "string") {
        throw new Error(`config.value for ${config.key} must be a string.`);
      }

      return {
        key: config.key.trim(),
        value: config.value,
        group: typeof config.group === "string" ? config.group.trim() : undefined,
        label: typeof config.label === "string" ? config.label : undefined,
      };
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid config payload.",
      },
      { status: 400 },
    );
  }

  await setSystemConfigs(normalized);

  return NextResponse.json({
    success: true,
    updated: normalized.length,
  });
}
