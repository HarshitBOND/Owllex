/**
 * GET /api/admin/check
 * Returns whether the current user is an admin (role from DB only).
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/lib/adminMiddleware";

export async function GET() {
  const result = await requireAdmin();
  if (result instanceof NextResponse) return result;

  return NextResponse.json({
    success: true,
    isAdmin: true,
    email: result.email,
    role: result.role,
  });
}
