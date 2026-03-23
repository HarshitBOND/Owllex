import { NextRequest, NextResponse } from "next/server"
import { ACTS_DATASET } from "@/app/api/lib/data/acts"

export const revalidate = 21600

const clampNumber = (value: string | null, fallback: number, min: number, max: number) => {
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.trunc(parsedValue)))
}

export async function GET(request: NextRequest) {
  try {
    const skip = clampNumber(request.nextUrl.searchParams.get("skip"), 0, 0, 10000)
    const limit = clampNumber(request.nextUrl.searchParams.get("limit"), 50, 1, 100)

    const searchQuery = (request.nextUrl.searchParams.get("search") || "").trim().toLowerCase()
    const categoryQuery = (request.nextUrl.searchParams.get("category") || "").trim().toLowerCase()

    const filteredActs = ACTS_DATASET.filter((act) => {
      if (categoryQuery && act.category.toLowerCase() !== categoryQuery) {
        return false
      }

      if (!searchQuery) {
        return true
      }

      const searchableText = [act.actName, act.actNo, act.actYear, act.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return searchableText.includes(searchQuery)
    })

    const paginatedActs = filteredActs.slice(skip, skip + limit)

    return NextResponse.json({
      success: true,
      source: "internal-dataset",
      acts: paginatedActs,
      total: filteredActs.length,
      skip,
      limit,
      hasMore: skip + paginatedActs.length < filteredActs.length,
      availableCategories: [...new Set(ACTS_DATASET.map((act) => act.category))].sort(),
    })
  } catch (error) {
    console.error("Acts GET error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch acts" },
      { status: 500 },
    )
  }
}
