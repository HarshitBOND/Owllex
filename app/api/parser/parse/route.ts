/**
 * API Route: Parse PDF Files
 * Proxy to backend parser service
 * 
 * Usage: POST /api/parser/parse
 * Body: FormData with 'file' field containing PDF
 */

import { NextRequest, NextResponse } from 'next/server';
import { ensureUser } from '@/app/api/lib/ensureUser';
import { getUserSubscriptionSummary } from '@/app/api/lib/services/subscription';
import { enforceRateLimit, requireUserContext } from '@/app/api/lib/routeGuards';

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const userContext = await requireUserContext();
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    const { blockedResponse } = enforceRateLimit(req, {
      key: `parser:${userContext.clerkUid}`,
      max: 30,
      windowMs: 10 * 60 * 1000,
    });

    if (blockedResponse) {
      return blockedResponse;
    }

    await ensureUser(userContext.clerkUid);
    const subscription = await getUserSubscriptionSummary(userContext.clerkUid);

    if (!subscription?.features.parserUpload) {
      return NextResponse.json(
        {
          success: false,
          error: 'PDF parser access is available on paid plans only. Please upgrade your plan.',
          subscription,
        },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.pdf') || file.type !== 'application/pdf') {
      return NextResponse.json(
        { success: false, error: 'Only PDF files are supported' },
        { status: 400 }
      );
    }

    const maxFileSizeBytes = 50 * 1024 * 1024;
    if (file.size > maxFileSizeBytes) {
      return NextResponse.json(
        { success: false, error: 'PDF exceeds 50MB upload limit' },
        { status: 400 }
      );
    }

    // Forward to backend parser
    const response = await fetch(`${BACKEND_API}/api/v1/parse`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Parser API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Parser service unavailable'
      },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};
