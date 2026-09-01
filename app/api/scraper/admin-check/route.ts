/**
 * API Route: GET /api/scraper/admin-check
 * Returns whether the current user is an admin.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/lib/adminAuth";

export async function GET() {
  const result = await requireAdmin();
  if (result instanceof NextResponse) {
    // Not admin return the status from the guard
    return result;
  }

  return NextResponse.json({
    success: true,
    isAdmin: true,
    email: result.email,
  });
}
