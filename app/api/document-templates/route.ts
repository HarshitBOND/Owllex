import { NextRequest, NextResponse } from "next/server";
import { requireUserContext } from "@/app/api/lib/routeGuards";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import DocumentTemplate from "@/app/api/lib/models/document-template";
import { DOCUMENT_CATEGORIES } from "@/lib/document-categories";

export async function GET(request: NextRequest) {
  const userContext = await requireUserContext(request);
  if (userContext instanceof NextResponse) return userContext;

  await connectMongoWithRetry();

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").replace(/[${}()\\]/g, "").trim().slice(0, 200);
  const category = (searchParams.get("category") || "").trim();
  const sort = searchParams.get("sort") === "az" ? "az" : "popular";

  let page = parseInt(searchParams.get("page") || "1", 10);
  let limit = parseInt(searchParams.get("limit") || "60", 10);
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 60;
  if (limit > 60) limit = 60;

  const query: Record<string, unknown> = { status: "published" };

  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { title: { $regex: safe, $options: "i" } },
      { description: { $regex: safe, $options: "i" } },
      { category: { $regex: safe, $options: "i" } },
    ];
  }
  if ((DOCUMENT_CATEGORIES as readonly string[]).includes(category)) {
    query.category = category;
  }

  const [rows, total, counts] = await Promise.all([
    DocumentTemplate.find(query)
      .select("title description category usageCount fields latestVersion")
      .sort(sort === "az" ? { title: 1 } : { usageCount: -1, title: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    DocumentTemplate.countDocuments(query),
    DocumentTemplate.aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
  ]);

  return NextResponse.json({
    success: true,
    templates: rows.map((t) => ({
      id: String(t._id),
      title: t.title,
      description: t.description,
      category: t.category,
      usageCount: t.usageCount,
      // Drives the "fill this in" affordance on the card. A template with no
      // fields is a plain body: it opens straight in the editor exactly as it
      // did before the wizard existed.
      fieldCount: Array.isArray(t.fields) ? t.fields.length : 0,
      version: t.latestVersion ?? 1,
    })),
    categories: counts.map((c: { _id: string; count: number }) => ({
      category: c._id,
      count: c.count,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
