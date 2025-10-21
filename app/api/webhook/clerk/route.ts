import { Webhook } from "svix";
import { headers } from "next/headers";
import { UserJSON, WebhookEvent } from "@clerk/nextjs/server";
import connectMongoWithRetry from "../../lib/db/connectMongo";
import { NextRequest } from "next/server";
import User from "../../lib/models/user";

export async function POST(req: NextRequest) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error("Missing CLERK_WEBHOOK_SECRET");
  }

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
  } catch (err) {
    console.error((err as Error).message);
    return new Response("Invalid svix payload", { status: 400 });
  }

  const { id, email_addresses, first_name, last_name } = evt.data as UserJSON;

  if (evt.type === "user.created") {
    await connectMongoWithRetry();

    await User.create({
      clerkUid: id,
      firstName: first_name,
      lastName: last_name,
      email: email_addresses?.[0]?.email_address || null,
      cases: [],
      clients: [],
    });

    return new Response("User created", { status: 200 });
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
