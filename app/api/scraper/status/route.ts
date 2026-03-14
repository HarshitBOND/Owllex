/**
 * API Route: GET /api/scraper/status
 * Returns scraper stats, recent logs, and recent PDFs.
 */

import { NextResponse } from "next/server";
import connectMongo from "@/app/api/lib/db/connectMongo";
import DownloadedPDF from "@/app/api/lib/models/downloaded-pdf";
import ScrapedCase from "@/app/api/lib/models/scraped-case";
import ScraperLog from "@/app/api/lib/models/scraper-log";
import { requireAdmin } from "@/app/api/lib/adminAuth";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    await connectMongo();

    const [
      totalPdfs,
      completedPdfs,
      failedPdfs,
      totalCases,
      recentLogs,
      recentPdfs,
    ] = await Promise.all([
      DownloadedPDF.countDocuments(),
      DownloadedPDF.countDocuments({ parse_status: "completed" }),
      DownloadedPDF.countDocuments({ parse_status: "failed" }),
      ScrapedCase.countDocuments(),
      ScraperLog.find({})
        .sort({ run_date: -1 })
        .limit(10)
        .lean(),
      DownloadedPDF.find({})
        .sort({ downloaded_at: -1 })
        .limit(20)
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        total_pdfs_processed: totalPdfs,
        completed: completedPdfs,
        failed: failedPdfs,
        total_cases_extracted: totalCases,
      },
      recent_logs: recentLogs,
      recent_pdfs: recentPdfs,
    });
  } catch (error) {
    console.error("Scraper status error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch scraper status" },
      { status: 500 }
    );
  }
}
