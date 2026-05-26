import { NextResponse } from "next/server";
import { finalizeMarketplacePluginPurchaseAction } from "@/app/admin/actions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string; registryOrderId?: string };
    if (!body.slug || !body.registryOrderId) {
      return NextResponse.json(
        {
          success: false,
          message: "slug and registryOrderId are required.",
        },
        { status: 400 },
      );
    }

    const result = await finalizeMarketplacePluginPurchaseAction({
      slug: body.slug,
      registryOrderId: body.registryOrderId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
