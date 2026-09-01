/**
 * POST /api/admin/rag/search
 * Admin-only: run a retrieval query against the RAG vector store, so an admin
 * can confirm an ingested document is actually searchable.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/lib/adminMiddleware";
import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth";

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000";

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const k = Number.isFinite(body?.k) ? Math.min(Math.max(Math.trunc(body.k), 1), 20) : 5;

  if (!query) {
    return NextResponse.json({ success: false, error: "A search query is required" }, { status: 400 });
  }

  try {
    const response = await fetch(`${BACKEND_API}/api/v1/rag/search`, {
      method: "POST",
      headers: { ...getBackendInternalHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ query, k }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.detail || "Search failed" },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("RAG search proxy error:", error);
    return NextResponse.json(
      { success: false, error: "Backend unreachable is the FastAPI server running?" },
      { status: 503 }
    );
  }
}
