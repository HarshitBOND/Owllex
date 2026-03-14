/**
 * API Route: POST /api/scraper/promote-admin
 * DISABLED - Admin role should only be set via ADMIN_EMAILS in .env.local for security.
 * This endpoint is no longer used.
 */

import { NextResponse } from "next/server";

export async function POST() {
  // Disabled for security reasons
  // Admin roles must be configured via ADMIN_EMAILS in .env.local
  return NextResponse.json(
    { 
      error: "This endpoint has been disabled for security reasons.",
      info: "To gain admin access, contact your system administrator to add your email to ADMIN_EMAILS in .env.local"
    },
    { status: 403 }
  );
}
