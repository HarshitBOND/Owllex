/**
 * API Route: GET /api/scraper/cases
 * Returns scraped cases with pagination and search.
 */

import { NextRequest, NextResponse } from "next/server";
import connectMongo from "@/app/api/lib/db/connectMongo";
import ScrapedCase from "@/app/api/lib/models/scraped-case";
import { requireAdmin } from "@/app/api/lib/adminAuth";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    await connectMongo();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const source_pdf = searchParams.get("source_pdf") || "";
    const search = searchParams.get("search") || "";

    const query: Record<string, unknown> = {};
    if (source_pdf) {
      query.source_pdf = source_pdf;
    }
    if (search) {
      query.$or = [
        { main_case_no: { $regex: search, $options: "i" } },
        { petitioner: { $regex: search, $options: "i" } },
        { respondent: { $regex: search, $options: "i" } },
        { judge: { $regex: search, $options: "i" } },
      ];
    }

    const [total, cases] = await Promise.all([
      ScrapedCase.countDocuments(query),
      ScrapedCase.find(query)
        .sort({ parsed_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
      cases,
    });
  } catch (error) {
    console.error("Scraper cases error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch scraped cases" },
      { status: 500 }
    );
  }
}
