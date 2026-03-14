import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message } = await req.json();

    // Store complaint data (in production, save to database or send email)
    const complaintData = { name, email, subject, message, receivedAt: new Date().toISOString() };
    // TODO: Save to MongoDB when Complaint model is added

    // Respond with success
    return NextResponse.json({ message: 'Complaint submitted successfully' });
  } catch {
    return NextResponse.json(
      { message: 'Failed to process complaint' },
      { status: 500 }
    );
  }
}
