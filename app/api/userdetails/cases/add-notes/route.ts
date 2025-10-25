import { NextResponse, NextRequest } from "next/server";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import Case from "@/app/api/lib/models/case";
import Note from "@/app/api/lib/models/note";

export async function GET(request: NextRequest) {
  try {
    await connectMongoWithRetry()
    const caseId = request.nextUrl.searchParams.get("id")
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
    const body = await request.json();
    const { clientId, content, contentJson, title, visibility } = body;

    if (!content && !contentJson) {
      return NextResponse.json(
        { error: "No content provided" },
        { status: 400 }
      );
    }

    await connectMongoWithRetry();

    const note = new Note({
      title: title || "Untitled Document",
      visibility,
      content: content,           
      contentJson: contentJson,   
      createdAt: new Date(),
      updatedAt: new Date(),
    }); 
    await note.save();

    const caseFound = await Case.findById(clientId);
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
    const noteId = request.nextUrl.searchParams.get("id");
    const caseId = request.nextUrl.searchParams.get("caseId");
    if (!noteId || !caseId) {
      return NextResponse.json(
        { error: "Note ID or Case ID not provided" },
        { status: 400 }
      );
    }
    await connectMongoWithRetry();
    const note = await Note.findByIdAndDelete(noteId);
    const caseFound = await Case.findById(caseId);
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
