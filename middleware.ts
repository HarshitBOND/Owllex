// middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const shouldSkipCsrfCheck = (pathname: string) => {
  return (
    pathname.startsWith("/api/webhook/") ||
    pathname.startsWith("/api/internal/")
  );
};

const shouldEnforceCsrf = () => {
  const explicit = process.env.STRICT_CSRF_PROTECTION;
  if (explicit !== undefined) {
    return explicit.toLowerCase() === "true";
  }

  return process.env.NODE_ENV === "production";
};

const isAllowedOrigin = (originHeader: string, request: NextRequest) => {
  const allowedOrigins = new Set<string>();

  allowedOrigins.add(request.nextUrl.origin);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      allowedOrigins.add(new URL(appUrl).origin);
    } catch {
      // ignore invalid env value
    }
  }

  return allowedOrigins.has(originHeader);
};

const buildCspHeader = (nonce: string, isDevelopment: boolean) => {
  const scriptSrc = isDevelopment
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.com https://*.clerk.accounts.dev https://clerk.browser.com https://challenges.cloudflare.com"
    : `script-src 'self' 'nonce-${nonce}' https://*.clerk.com https://*.clerk.accounts.dev https://clerk.browser.com https://challenges.cloudflare.com`;

  const styleSrc = isDevelopment
    ? "style-src 'self' 'unsafe-inline' https://*.clerk.com"
    : `style-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://*.clerk.com`;

  const connectSrc = isDevelopment
    ? "connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://clerk.browser.com https://challenges.cloudflare.com wss://*.clerk.com wss://*.clerk.accounts.dev ws://localhost:* http://localhost:*"
    : "connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://clerk.browser.com https://challenges.cloudflare.com wss://*.clerk.com wss://*.clerk.accounts.dev";

  const parts = [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "img-src 'self' data: blob: https://img.clerk.com https:",
    "font-src 'self' https://*.clerk.com https:",
    connectSrc,
    "frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://clerk.browser.com https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (!isDevelopment) {
    parts.push("upgrade-insecure-requests");
  }

  return parts.join("; ");
};

export default clerkMiddleware(async (auth, req) => {
  const isDevelopment = process.env.NODE_ENV !== "production";

  if (
    shouldEnforceCsrf() &&
    req.nextUrl.pathname.startsWith("/api/") &&
    MUTATING_METHODS.has(req.method) &&
    !shouldSkipCsrfCheck(req.nextUrl.pathname)
  ) {
    const origin = req.headers.get("origin")?.trim();
    if (!origin || !isAllowedOrigin(origin, req)) {
      return NextResponse.json(
        { success: false, error: "Invalid request origin" },
        { status: 403 },
      );
    }
  }

  const nonce = btoa(globalThis.crypto.randomUUID());
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  // Add cache headers for static assets
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  
  // Cache static assets for 1 year
  if (
    req.nextUrl.pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|woff|woff2|ttf|eot)$/i)
  ) {
    response.headers.set(
      "Cache-Control",
      "public, max-age=31536000, immutable"
    );
  }
  
  // Disable caching for API responses (user-specific authenticated data)
  if (req.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate"
    );
  }

  // Add performance optimization headers
  response.headers.set("Content-Security-Policy", buildCspHeader(nonce, isDevelopment));
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "0");
  
  return response;
});

export const config = {
  matcher: [
    // Protect everything except static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
