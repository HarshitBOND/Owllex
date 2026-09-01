import { NextRequest } from "next/server"

type SecurityEventLevel = "info" | "warn" | "error"

type SecurityEventType =
  | "auth_failed"
  | "admin_access_attempt"
  | "upload_failed"
  | "rate_limited"
  | "trial_expired_block"

const getClientIp = (request?: NextRequest) => {
  if (!request) return "unknown"

  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    const [firstIp] = forwardedFor.split(",")
    if (firstIp?.trim()) {
      return firstIp.trim()
    }
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown"
}

export function logSecurityEvent(input: {
  type: SecurityEventType
  level?: SecurityEventLevel
  message: string
  request?: NextRequest
  userId?: string
  details?: Record<string, unknown>
}) {
  const payload = {
    ts: new Date().toISOString(),
    type: input.type,
    message: input.message,
    userId: input.userId || "anonymous",
    ip: getClientIp(input.request),
    path: input.request?.nextUrl.pathname || "unknown",
    method: input.request?.method || "unknown",
    userAgent: input.request?.headers.get("user-agent") || "unknown",
    details: input.details || {},
  }

  const serialized = JSON.stringify(payload)

  if (input.level === "error") {
    console.error(`[security] ${serialized}`)
    return
  }

  if (input.level === "warn" || input.type !== "admin_access_attempt") {
    console.warn(`[security] ${serialized}`)
    return
  }

  console.info(`[security] ${serialized}`)
}
