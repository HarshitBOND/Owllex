import { NextResponse, NextRequest } from "next/server";
import Task from "@/app/api/lib/models/task";
import Case from "@/app/api/lib/models/case";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import { auth } from "@clerk/nextjs/server";

const TASK_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const TASK_CATEGORIES = new Set([
    "hearing",
    "filing",
    "deposition",
    "client-meeting",
    "research",
    "case-review",
    "motion",
    "discovery",
]);

const normalizeTaskPayload = (formData: any) => {
    const rawFieldToShow = formData.fieldToShow || formData.fieldsToShow

    return {
        task: formData.task,
        caseId: formData.caseId || null,
        dueDate: typeof formData.dueDate === "string" ? formData.dueDate : new Date(formData.dueDate).toISOString(),
        dueTime: formData.dueTime || "",
        reminder: formData.reminder || undefined,
        resourceType: formData.resourceType || "None",
        resourceName: formData.resourceName ?? null,
        fieldToShow: (formData.resourceType || "None") === "Case"
            ? {
                caseInfo: Boolean(rawFieldToShow?.caseInfo ?? rawFieldToShow?.caseName),
                caseNo: Boolean(rawFieldToShow?.caseNo),
            }
            : undefined,
        referenceFiles: Array.isArray(formData.referenceFiles) ? formData.referenceFiles : [],
        status: formData.status || "pending",
        taskCompletedRemarks: typeof formData.taskCompletedRemarks === "string" ? formData.taskCompletedRemarks : "",
        priority: TASK_PRIORITIES.has(formData.priority) ? formData.priority : "medium",
        category: TASK_CATEGORIES.has(formData.category) ? formData.category : "case-review",
        updatedAt: new Date(),
    }
};


export async function GET(request: NextRequest) {
    try {
        await connectMongoWithRetry();
        const { userId } = await auth();
        const status = request.nextUrl.searchParams.get("status") || "pending";

        if (!userId) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
        }

        // Add lean() for faster queries and select only needed fields
        const tasks = await Task.find({clerkUid: userId, status})
            .populate("caseId", "_id title status")
            .lean()
            .exec()

        return NextResponse.json({ success: true, tasks });
    } catch (error) {
        console.error("Error fetching tasks:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch tasks" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        await connectMongoWithRetry();
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
        }

        const formData = await request.json()
        const payload = normalizeTaskPayload(formData)
        const caseId = payload.caseId as string | null;

        const newTask = new Task({ clerkUid: userId, ...payload })

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
        await connectMongoWithRetry();
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
        }

        const formData = await request.json()
        const payload = normalizeTaskPayload(formData)

        // Use findByIdAndUpdate for atomic operation
        const task = await Task.findByIdAndUpdate(
            formData._id,
            { clerkUid: userId, ...payload },
            { new: false }
        );

        if (!task) {
            return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
        }

        return NextResponse.json({ success: true, message: "Task updated successfully" });
    } catch (error) {
        console.error("Error adding task:", error);
        return NextResponse.json({ success: false, message: "Failed to add task" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        await connectMongoWithRetry();
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
        }

        const formData = await request.json()

        const task = await Task.findById(formData._id);
        if (!task) {
            return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
        }

        const caseId = task.caseId;

        if (caseId) {
            const caseFound = await Case.findById(caseId)
            if (caseFound) {
                caseFound.tasks.pull(task._id)
                await caseFound.save()
            }
        }

        await task.deleteOne()


        return NextResponse.json({ success: true, message: "Task deleted successfully" });
    } catch (error) {
        console.error("Error deleting task:", error);
        return NextResponse.json({ success: false, message: "Failed to delete task" }, { status: 500 });
    }
}
