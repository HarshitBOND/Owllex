/**
 * API Route: GET /api/scraper/causelist-status
 * Returns the last import info, checkpoint, and current running session.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/lib/adminAuth";
import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth";

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const res = await fetch(`${BACKEND_API}/api/v1/scraper/causelist-status`, {
      method: "GET",
      headers: getBackendInternalHeaders(),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Causelist status error:", error);
    const isConnErr = error?.cause?.code === "ECONNREFUSED" || error?.message?.includes("fetch failed");
    const missingToken = error instanceof Error && error.message.includes("BACKEND_INTERNAL_TOKEN");
    return NextResponse.json(
      {
        success: false,
        error: missingToken
          ? "Server configuration error. Missing BACKEND_INTERNAL_TOKEN."
          : isConnErr
          ? "Python backend is not running. Start it with: cd backend && python run.py"
          : "Failed to fetch causelist status",
      },
      { status: isConnErr ? 503 : 500 }
    );
  }
}
