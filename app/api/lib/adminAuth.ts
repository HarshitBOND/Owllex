import { NextRequest, NextResponse } from "next/server"
import { requireAdmin as requireAdminFromMiddleware } from "@/app/api/lib/adminMiddleware"

export interface AdminUser {
  userId: string
  email: string
  role: string
}

export async function requireAdmin(request?: NextRequest): Promise<AdminUser | NextResponse> {
  const result = await requireAdminFromMiddleware(request)

  if (result instanceof NextResponse) {
    return result
  }

  return {
    userId: result.userId,
    email: result.email,
    role: result.role,
  }
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const result = await requireAdmin()
  return !(result instanceof NextResponse)
}
