/**
 * API Route: GET /api/scraper/logs
 * Returns scraper run logs.
 */

import { NextRequest, NextResponse } from "next/server";
import connectMongo from "@/app/api/lib/db/connectMongo";
import ScraperLog from "@/app/api/lib/models/scraper-log";
import { requireAdmin } from "@/app/api/lib/adminAuth";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    await connectMongo();

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    const logs = await ScraperLog.find({})
      .sort({ run_date: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ success: true, logs });
  } catch (error) {
    console.error("Scraper logs error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch scraper logs" },
      { status: 500 }
    );
  }
}
