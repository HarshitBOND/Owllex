import { NextResponse } from "next/server";
import { requireSupport } from "@/app/api/lib/supportMiddleware";

export async function GET() {
  const result = await requireSupport();
  if (result instanceof NextResponse) return result;

  return NextResponse.json({
    success: true,
    isSupport: true,
    email: result.email,
    role: result.role,
  });
}
