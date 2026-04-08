import { NextResponse, NextRequest } from "next/server";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import Case from "@/app/api/lib/models/case";
import Note from "@/app/api/lib/models/note";
import { createNoteSchema } from "@/app/api/lib/validators/userdetails";
import { requireOwnedCase, requireUserContext } from "@/app/api/lib/routeGuards";

export async function GET(request: NextRequest) {
  try {
    const userContext = await requireUserContext(request);
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    await connectMongoWithRetry()
    const caseId = request.nextUrl.searchParams.get("id")
    if (!caseId) {
      return NextResponse.json({ error: "Case ID is required" }, { status: 400 });
    }

    const isOwnedCase = await requireOwnedCase(userContext.clerkUid, caseId)
    if (!isOwnedCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const caseFound = await Case.findById(caseId).populate("notes")
    
    return NextResponse.json({ caseFound })

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
    const userContext = await requireUserContext(request);
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

    const caseId = parsedBody.data.caseId || parsedBody.data.clientId;
    if (!caseId) {
      return NextResponse.json({ error: "Case ID is required" }, { status: 400 });
    }

    const hasContent =
      (typeof parsedBody.data.content === "string" && parsedBody.data.content.trim().length > 0) ||
      typeof parsedBody.data.contentJson !== "undefined";

    if (!hasContent) {
      return NextResponse.json({ error: "No content provided" }, { status: 400 });
    }

    const isOwnedCase = await requireOwnedCase(userContext.clerkUid, caseId)
    if (!isOwnedCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
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

    const caseFound = await Case.findById(caseId);
    if (!caseFound) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404 }
      );
    }
    caseFound.notes.push(note._id);
    await caseFound.save();

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
    const userContext = await requireUserContext(request);
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    const noteId = request.nextUrl.searchParams.get("id");
    const caseId = request.nextUrl.searchParams.get("caseId");
    if (!noteId || !caseId) {
      return NextResponse.json(
        { error: "Note ID or Case ID not provided" },
        { status: 400 }
      );
    }

    const isOwnedCase = await requireOwnedCase(userContext.clerkUid, caseId)
    if (!isOwnedCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    await connectMongoWithRetry();
    const note = await Note.findByIdAndDelete(noteId);
    const caseFound = await Case.findById(caseId);
    if (!caseFound) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }
    caseFound.notes.pull(noteId);
    await caseFound.save();
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
