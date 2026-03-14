import { Webhook } from "svix";
import { headers } from "next/headers";
import { UserJSON, WebhookEvent } from "@clerk/nextjs/server";
import connectMongoWithRetry from "../../lib/db/connectMongo";
import { NextRequest } from "next/server";
import User from "../../lib/models/user";

export async function POST(req: NextRequest) {
  console.log("[WEBHOOK] Clerk webhook received");
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error("[WEBHOOK] Missing CLERK_WEBHOOK_SECRET in env");
    throw new Error("Missing CLERK_WEBHOOK_SECRET");
  }
  console.log("[WEBHOOK] CLERK_WEBHOOK_SECRET found, validating...");

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_signature = headerPayload.get("svix-signature");
  const svix_timestamp = headerPayload.get("svix-timestamp");

  if (!svix_id || !svix_signature || !svix_timestamp) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await req.text();

  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
    console.log("[WEBHOOK] Signature verified. Event type:", evt.type, "User ID:", (evt.data as any).id);
  } catch (err) {
    console.error("[WEBHOOK] Signature verification failed:", (err as Error).message);
    return new Response("Invalid svix payload", { status: 400 });
  }

  const { id, email_addresses, first_name, last_name } = evt.data as UserJSON;

  if (evt.type === "user.created") {
    console.log("[WEBHOOK] Processing user.created event for", id);
    try {
      await connectMongoWithRetry();
      console.log("[WEBHOOK] MongoDB connected");

      const result = await User.findOneAndUpdate(
        { clerkUid: id },
        {
          $setOnInsert: {
            clerkUid: id,
            firstName: first_name,
            lastName: last_name,
            email: email_addresses?.[0]?.email_address || null,
            cases: [],
            clients: [],
          },
        },
        { upsert: true, new: true }
      );
      console.log("[WEBHOOK] User created/updated in MongoDB:", result?._id, "Email:", result?.email);
      return new Response("User created", { status: 200 });
    } catch (error) {
      console.error("[WEBHOOK] Error creating user:", error);
      return new Response("Error creating user", { status: 500 });
    }
  }

  if (evt.type === "user.deleted") {
    await connectMongoWithRetry();

    const user = await User.findOne({ clerkUid: id });

    if (!user) {
      return new Response("User not found", { status: 404 });
    }

    await User.deleteOne({ clerkUid: id });

    return new Response("User deleted", { status: 200 });
  }

  if (evt.type === "user.updated") {
    await connectMongoWithRetry();

    const user = await User.findOne({ clerkUid: id });

    if (!user) {
      return new Response("User not found", { status: 404 });
    }

    const { email_addresses, first_name, last_name } = evt.data as UserJSON;

    await User.updateOne({ clerkUid: id }, { firstName: first_name, lastName: last_name, email: email_addresses[0].email_address });

    return new Response("User updated", { status: 200 });
  }
}
