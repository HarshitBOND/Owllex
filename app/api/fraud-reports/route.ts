import sgMail from "@sendgrid/mail";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectMongo from "@/app/api/lib/db/connectMongo";
import FraudReport from "@/app/api/lib/models/fraud-report";
import { ensureUser } from "@/app/api/lib/ensureUser";

const createFraudReportSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  incidentTitle: z.string().trim().min(5).max(200),
  incidentDetails: z.string().trim().min(20).max(6000),
  incidentDate: z.string().trim().optional(),
  caseReference: z.string().trim().max(120).optional(),
  amountInvolved: z.union([z.number().min(0), z.null()]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  evidenceUrls: z.array(z.string().url()).max(10).optional(),
});

function parseOptionalDate(rawValue?: string) {
  if (!rawValue) return null;

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

async function notifySupportTeam(payload: {
  reportId: string;
  name: string;
  email: string;
  incidentTitle: string;
  incidentDetails: string;
}) {
  const supportInbox = process.env.SUPPORT_TEAM_EMAIL?.trim();
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim();
  const fromName = process.env.NOTIFICATION_FROM_NAME?.trim() || "LexVert";

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
    subject: `[Fraud Report] ${payload.incidentTitle}`,
    text: [
      "New fraud report received in LexVert.",
      "",
      `Report ID: ${payload.reportId}`,
      `From: ${payload.name} <${payload.email}>`,
      `Title: ${payload.incidentTitle}`,
      "",
      payload.incidentDetails,
    ].join("\n"),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = createFraudReportSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid fraud report payload",
          errors: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    await connectMongo();
    await ensureUser(userId);

    const fraudReport = await FraudReport.create({
      clerkUid: userId,
      source: "report-fraud",
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || "",
      incidentTitle: parsed.data.incidentTitle,
      incidentDetails: parsed.data.incidentDetails,
      incidentDate: parseOptionalDate(parsed.data.incidentDate),
      caseReference: parsed.data.caseReference || "",
      amountInvolved:
        typeof parsed.data.amountInvolved === "number" ? parsed.data.amountInvolved : null,
      priority: parsed.data.priority || "medium",
      evidenceUrls: parsed.data.evidenceUrls || [],
      status: "new",
      resolutionNotes: "",
    });

    try {
      await notifySupportTeam({
        reportId: fraudReport._id.toString(),
        name: parsed.data.name,
        email: parsed.data.email,
        incidentTitle: parsed.data.incidentTitle,
        incidentDetails: parsed.data.incidentDetails,
      });
    } catch (emailError) {
      console.error("Failed to send fraud report notification email:", emailError);
    }

    return NextResponse.json({
      success: true,
      message: "Fraud report submitted successfully",
      id: fraudReport._id,
    });
  } catch (error) {
    console.error("Fraud report POST error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to process fraud report" },
      { status: 500 },
    );
  }
}
