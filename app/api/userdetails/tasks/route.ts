import { NextResponse, NextRequest } from "next/server";
import Task from "@/app/api/lib/models/task";
import Case from "@/app/api/lib/models/case";
import { auth } from "@clerk/nextjs/server";


export async function GET(request: NextRequest) {
    try {
        const { userId } = await auth();
        const status = request.nextUrl.searchParams.get("status") || "pending";

        if (!userId) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
        }

        const tasks = await Task.find({clerkUid: userId, status}).populate("caseId")

        return NextResponse.json({ success: true, tasks });
    } catch (error) {
        console.error("Error fetching tasks:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch tasks" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
        }

        const formData = await request.json()
        const caseId = formData.caseId as string;

        const newTask = new Task({clerkUid: userId, ...formData})

        await newTask.save()

        if (caseId) {
            const caseFound = await Case.findById(caseId)
            if (!caseFound) {
                return NextResponse.json({ success: false, message: "Case not found" }, { status: 404 })
            }
            caseFound.tasks.push(newTask._id)
            await caseFound.save()
        }

        return NextResponse.json({ success: true, message: "Task added successfully" });
    } catch (error) {
        console.error("Error adding task:", error);
        return NextResponse.json({ success: false, message: "Failed to add task" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
        }

        const formData = await request.json()

        const task = await Task.findById(formData._id);

        if (!task) {
            return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
        }

        await task.updateOne({clerkUid: userId, ...formData})

        return NextResponse.json({ success: true, message: "Task added successfully" });
    } catch (error) {
        console.error("Error adding task:", error);
        return NextResponse.json({ success: false, message: "Failed to add task" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
        }

        const formData = await request.json()

        const task = await Task.findById(formData._id);
        const caseId = task?.caseId;

        if (caseId) {
            const caseFound = await Case.findById(caseId)
            if (!caseFound) {
                return NextResponse.json({ success: false, message: "Case not found" }, { status: 404 })
            }
            caseFound.tasks.pull(task._id)
            await caseFound.save()
        }

        if (!task) {
            return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
        }

        await task.deleteOne({clerkUid: userId})


        return NextResponse.json({ success: true, message: "Task deleted successfully" });
    } catch (error) {
        console.error("Error deleting task:", error);
        return NextResponse.json({ success: false, message: "Failed to delete task" }, { status: 500 });
    }
}
