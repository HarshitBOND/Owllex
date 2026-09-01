/**
 * GET /api/admin/rag/status
 * Admin-only: report whether the RAG pipeline is ready and how much is indexed.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/lib/adminMiddleware";
import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth";

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const response = await fetch(`${BACKEND_API}/api/v1/rag/status`, {
      headers: getBackendInternalHeaders(),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.detail || "Could not read RAG status" },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error("RAG status proxy error:", error);
    return NextResponse.json(
      { success: false, error: "Backend unreachable is the FastAPI server running?" },
      { status: 503 }
    );
  }
}
