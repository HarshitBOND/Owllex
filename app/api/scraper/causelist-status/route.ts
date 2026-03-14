/**
 * API Route: GET /api/scraper/causelist-status
 * Returns the last import info, checkpoint, and current running session.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/lib/adminAuth";

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const res = await fetch(`${BACKEND_API}/api/v1/scraper/causelist-status`, {
      method: "GET",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Causelist status error:", error);
    const isConnErr = error?.cause?.code === "ECONNREFUSED" || error?.message?.includes("fetch failed");
    return NextResponse.json(
      {
        success: false,
        error: isConnErr
          ? "Python backend is not running. Start it with: cd backend && python run.py"
          : "Failed to fetch causelist status",
      },
      { status: isConnErr ? 503 : 500 }
    );
  }
}
