/**
 * API Route: GET /api/scraper/cases
 * Returns scraped cases with pagination and search.
 */

import { NextRequest, NextResponse } from "next/server";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import ScrapedCase from "@/app/api/lib/models/scraped-case";
import { requireAdmin } from "@/app/api/lib/adminAuth";

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    await connectMongoWithRetry();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const source_pdf = searchParams.get("source_pdf") || "";
    const search = searchParams.get("search") || "";

    const query: Record<string, unknown> = {};
    if (source_pdf && typeof source_pdf === "string" && !source_pdf.startsWith("$")) {
      query.source_pdf = source_pdf;
    }
    if (search) {
      const safeSearch = escapeRegexLiteral(search).slice(0, 200);
      query.$or = [
        { main_case_no: { $regex: safeSearch, $options: "i" } },
        { petitioner: { $regex: safeSearch, $options: "i" } },
        { respondent: { $regex: safeSearch, $options: "i" } },
        { judge: { $regex: safeSearch, $options: "i" } },
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
