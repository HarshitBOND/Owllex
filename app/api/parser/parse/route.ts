/**
 * API Route: Parse PDF Files
 * Proxy to backend parser service
 * 
 * Usage: POST /api/parser/parse
 * Body: FormData with 'file' field containing PDF
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ensureUser } from '@/app/api/lib/ensureUser';
import { getUserSubscriptionSummary } from '@/app/api/lib/services/subscription';

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await ensureUser(userId);
    const subscription = await getUserSubscriptionSummary(userId);

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

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
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
