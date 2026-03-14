/**
 * API Route: POST /api/scraper/parse-causelist-bulk
 * Triggers the bulk cause list import on the Python backend.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/lib/adminAuth";

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();

    const res = await fetch(`${BACKEND_API}/api/v1/scraper/parse-causelist-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        days_back: body.days_back ?? 3,
        auto_delete_pdfs: body.auto_delete_pdfs ?? true,
        start_from_checkpoint: body.start_from_checkpoint ?? true,
      }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Bulk causelist trigger error:", error);
    const isConnErr = error?.cause?.code === "ECONNREFUSED" || error?.message?.includes("fetch failed");
    return NextResponse.json(
      {
        success: false,
        error: isConnErr
          ? "Python backend is not running. Start it with: cd backend && python run.py"
          : "Failed to trigger bulk import",
      },
      { status: isConnErr ? 503 : 500 }
    );
  }
}
