import sgMail from "@sendgrid/mail";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import Complaint from "@/app/api/lib/models/complaint";
import { enforceRateLimit } from "@/app/api/lib/routeGuards";

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(10).max(4000),
});

async function notifySupportTeam(payload: {
  name: string;
  email: string;
  subject: string;
  message: string;
  messageId: string;
}) {
  const supportInbox = process.env.SUPPORT_TEAM_EMAIL?.trim();
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim();
  const fromName = process.env.NOTIFICATION_FROM_NAME?.trim() || "Ravenslaw";

  if (!supportInbox || !apiKey || !fromEmail) {
    return;
  }

  sgMail.setApiKey(apiKey);

  await sgMail.send({
    to: supportInbox,
    from: {
      email: fromEmail,
      name: fromName,
    },
    replyTo: payload.email,
    subject: `[Contact Us] ${payload.subject}`,
    text: [
      `New support message received in Ravenslaw.`,
      ``,
      `Message ID: ${payload.messageId}`,
      `From: ${payload.name} <${payload.email}>`,
      `Subject: ${payload.subject}`,
      ``,
      payload.message,
    ].join("\n"),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { blockedResponse } = await enforceRateLimit(req, {
      key: "public:contact-us",
      max: 20,
      windowMs: 10 * 60 * 1000,
    });

    if (blockedResponse) {
      return blockedResponse;
    }

    const parsed = contactSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid contact form payload",
          errors: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { userId } = await auth();

    await connectMongoWithRetry();

    const complaint = await Complaint.create({
      source: "contact-us",
      clerkUid: userId || null,
      ...parsed.data,
      status: "new",
    });

    try {
      await notifySupportTeam({
        name: parsed.data.name,
        email: parsed.data.email,
        subject: parsed.data.subject,
        message: parsed.data.message,
        messageId: complaint._id.toString(),
      });
    } catch (emailError) {
      console.error("Failed to send support email notification:", emailError);
    }

    return NextResponse.json({
      success: true,
      message: "Message submitted successfully",
      id: complaint._id,
    });
  } catch (error) {
    console.error("Complaint POST error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to process complaint" },
      { status: 500 },
    );
  }
}
