/**
 * API Route: POST /api/scraper/parse-causelist-bulk
 * Triggers the bulk cause list import on the Python backend.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/lib/adminAuth";
import { z } from "zod";
import { enforceRateLimit } from "@/app/api/lib/routeGuards";
import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth";

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000";

const bulkParseSchema = z.object({
  days_back: z.number().int().min(1).max(30).optional(),
  auto_delete_pdfs: z.boolean().optional(),
  start_from_checkpoint: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  try {
    const { blockedResponse } = await enforceRateLimit(req, {
      key: `scraper:bulk:${admin.userId}`,
      max: 20,
      windowMs: 10 * 60 * 1000,
    });

    if (blockedResponse) {
      return blockedResponse;
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = bulkParseSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid import payload";
      return NextResponse.json({ success: false, error: issue }, { status: 400 });
    }

    const res = await fetch(`${BACKEND_API}/api/v1/scraper/parse-causelist-bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getBackendInternalHeaders(),
      },
      body: JSON.stringify({
        days_back: parsed.data.days_back ?? 3,
        auto_delete_pdfs: parsed.data.auto_delete_pdfs ?? true,
        start_from_checkpoint: parsed.data.start_from_checkpoint ?? true,
      }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Bulk causelist trigger error:", error);
    const isConnErr = error?.cause?.code === "ECONNREFUSED" || error?.message?.includes("fetch failed");
    const missingToken = error instanceof Error && error.message.includes("BACKEND_INTERNAL_TOKEN");
    return NextResponse.json(
      {
        success: false,
        error: missingToken
          ? "Server configuration error"
          : isConnErr
          ? "Backend service unavailable"
          : "Failed to trigger bulk import",
      },
      { status: isConnErr ? 503 : 500 }
    );
  }
}
