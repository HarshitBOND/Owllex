import { NextResponse, NextRequest } from "next/server";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import Client from "@/app/api/lib/models/client";
import Note from "@/app/api/lib/models/note";
import { requireOwnedClient, requireUserContext } from "@/app/api/lib/routeGuards";
import { createNoteSchema } from "@/app/api/lib/validators/userdetails";

export async function GET(request: NextRequest) {
  try {
    const userContext = await requireUserContext();
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    await connectMongoWithRetry()
    const clientId = request.nextUrl.searchParams.get("id")
    if (!clientId) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
    }

    const isOwnedClient = await requireOwnedClient(userContext.clerkUid, clientId)
    if (!isOwnedClient) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const client = await Client.findById(clientId).populate("notes")
    
    return NextResponse.json({ client })

  } catch (error: any) {
    console.error("Fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch content", message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const userContext = await requireUserContext();
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsedBody = createNoteSchema.safeParse(body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || "Invalid note payload";
      return NextResponse.json({ error: issue }, { status: 400 });
    }

    const clientId = parsedBody.data.clientId;
    if (!clientId) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
    }

    const hasContent =
      (typeof parsedBody.data.content === "string" && parsedBody.data.content.trim().length > 0) ||
      typeof parsedBody.data.contentJson !== "undefined";

    if (!hasContent) {
      return NextResponse.json({ error: "No content provided" }, { status: 400 });
    }

    const isOwnedClient = await requireOwnedClient(userContext.clerkUid, clientId);
    if (!isOwnedClient) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    await connectMongoWithRetry();

    const note = new Note({
      title: parsedBody.data.title || "Untitled Document",
      visibility: parsedBody.data.visibility,
      content: parsedBody.data.content,
      contentJson: parsedBody.data.contentJson,
      createdAt: new Date(),
      updatedAt: new Date(),
    }); 
    await note.save();

    const client = await Client.findById(clientId);
    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }
    client.notes.push(note._id);
    await client.save();

    return NextResponse.json({
      success: true,
      id: note._id.toString(),
      message: "Content saved successfully",
    });

  } catch (error: any) {
    console.error("Save error:", error);
    return NextResponse.json(
      { error: "Failed to save content", message: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userContext = await requireUserContext();
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    const noteId = request.nextUrl.searchParams.get("id");
    const clientId = request.nextUrl.searchParams.get("clientId");
    if (!noteId || !clientId) {
      return NextResponse.json(
        { error: "Note ID or Client ID not provided" },
        { status: 400 }
      );
    }

    const isOwnedClient = await requireOwnedClient(userContext.clerkUid, clientId)
    if (!isOwnedClient) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    await connectMongoWithRetry();
    const note = await Note.findByIdAndDelete(noteId);
    const client = await Client.findById(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    client.notes.pull(noteId);
    await client.save();
    if (!note) {
      return NextResponse.json(
        { error: "Note not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, message: "Note deleted successfully" });
  } catch (error: any) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete note", message: error.message },
      { status: 500 }
    );
  }
}
