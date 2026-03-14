// middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default clerkMiddleware(async (auth, req) => {
  // Add cache headers for static assets
  const response = NextResponse.next();
  
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
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  
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
