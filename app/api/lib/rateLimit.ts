import { NextRequest } from "next/server"

type RateLimitStoreEntry = {
  count: number
  resetAt: number
}

type RateLimitStore = Map<string, RateLimitStoreEntry>

type GlobalRateLimitState = typeof globalThis & {
  __lexvertRateLimitStore?: RateLimitStore
}

export type RateLimitInput = {
  request: NextRequest
  key: string
  max: number
  windowMs: number
}

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

const globalState = globalThis as GlobalRateLimitState
const store = globalState.__lexvertRateLimitStore || new Map<string, RateLimitStoreEntry>()

globalState.__lexvertRateLimitStore = store

const getRequestIp = (request: NextRequest) => {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    const [firstIp] = forwardedFor.split(",")
    if (firstIp?.trim()) {
      return firstIp.trim()
    }
  }

  const realIp = request.headers.get("x-real-ip")
  if (realIp?.trim()) {
    return realIp.trim()
  }

  return "unknown"
}

export const getRateLimitIdentity = (request: NextRequest, fallback: string) => {
  const ip = getRequestIp(request)
  const userAgent = request.headers.get("user-agent") || "unknown-agent"
  return `${fallback}:${ip}:${userAgent.slice(0, 128)}`
}

export function applyRateLimit({ request, key, max, windowMs }: RateLimitInput): RateLimitResult {
  const now = Date.now()
  const identity = getRateLimitIdentity(request, key)
  const existing = store.get(identity)

  if (!existing || now > existing.resetAt) {
    store.set(identity, {
      count: 1,
      resetAt: now + windowMs,
    })

    return {
      allowed: true,
      limit: max,
      remaining: Math.max(max - 1, 0),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    }
  }

  if (existing.count >= max) {
    return {
      allowed: false,
      limit: max,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
    }
  }

  existing.count += 1
  store.set(identity, existing)

  return {
    allowed: true,
    limit: max,
    remaining: Math.max(max - existing.count, 0),
    retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
  }
}
