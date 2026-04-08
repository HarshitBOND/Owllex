import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { ensureUser } from "@/app/api/lib/ensureUser"
import User from "@/app/api/lib/models/user"
import { applyRateLimit, type RateLimitResult } from "@/app/api/lib/rateLimit"
import { logSecurityEvent } from "@/app/api/lib/securityLogger"

export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Invalid id")

export type AuthenticatedUserContext = {
  clerkUid: string
}

export async function requireUserContext(request?: NextRequest): Promise<AuthenticatedUserContext | NextResponse> {
  try {
    const session = await auth()
    const { userId } = session || {}

    if (!userId) {
      logSecurityEvent({
        type: "auth_failed",
        level: "warn",
        message: "Authenticated endpoint access without valid session",
        request,
      })
      return NextResponse.json(
        { success: false, error: "Unauthorized", details: { message: "Missing session" } },
        { status: 401 },
      )
    }

    await ensureUser(userId)

    return {
      clerkUid: userId,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[ROUTE_GUARD] Auth error:", errorMessage)
    logSecurityEvent({
      type: "auth_failed",
      level: "error",
      message: "Auth function threw error",
      request,
      details: { message: errorMessage },
    })
    return NextResponse.json(
      { success: false, error: "Authentication service unavailable", details: { message: errorMessage } },
      { status: 503 }
    )
  }
}

export async function requireOwnedCase(clerkUid: string, caseId: string) {
  await connectMongoWithRetry()
  return Boolean(await User.exists({ clerkUid, cases: caseId }))
}

export async function requireOwnedClient(clerkUid: string, clientId: string) {
  await connectMongoWithRetry()
  return Boolean(await User.exists({ clerkUid, clients: clientId }))
}

export async function parseAndValidateJson<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T,
): Promise<{ success: true; data: z.infer<T> } | { success: false; response: NextResponse }> {
  const jsonBody = (await request.json().catch(() => null)) as unknown

  if (!jsonBody) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: "Invalid JSON body", details: { message: "Invalid JSON body" } },
        { status: 400 },
      ),
    }
  }

  const parsed = schema.safeParse(jsonBody)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message || "Invalid payload"
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: firstIssue, details: { message: firstIssue } },
        { status: 400 },
      ),
    }
  }

  return {
    success: true,
    data: parsed.data,
  }
}

export async function enforceRateLimit(
  request: NextRequest,
  options: {
    key: string
    max: number
    windowMs: number
  },
): Promise<{ blockedResponse: NextResponse | null; result: RateLimitResult }> {
  const result = await applyRateLimit({
    request,
    key: options.key,
    max: options.max,
    windowMs: options.windowMs,
  })

  if (!result.allowed) {
    logSecurityEvent({
      type: "rate_limited",
      level: "warn",
      message: "Rate limit exceeded",
      request,
      details: {
        key: options.key,
        limit: result.limit,
        retryAfterSeconds: result.retryAfterSeconds,
      },
    })
    return {
      blockedResponse: NextResponse.json(
        {
          success: false,
          error: "Too many requests. Please try again later.",
          details: { message: "Rate limit exceeded" },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfterSeconds),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": String(result.remaining),
          },
        },
      ),
      result,
    }
  }

  return {
    blockedResponse: null,
    result,
  }
}
