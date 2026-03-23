import { NextResponse, NextRequest } from "next/server";
import Task from "@/app/api/lib/models/task";
import Case from "@/app/api/lib/models/case";
import User from "@/app/api/lib/models/user";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import { syncCalendarEventsForUser } from "@/app/api/lib/services/calendar";
import { deleteTaskSchema, upsertTaskSchema } from "@/app/api/lib/validators/userdetails";
import { requireOwnedCase, requireUserContext } from "@/app/api/lib/routeGuards";

const TaskModel: any = Task

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
        const userContext = await requireUserContext();
        if (userContext instanceof NextResponse) {
            return userContext;
        }

        await connectMongoWithRetry();
        const userId = userContext.clerkUid;
        const status = request.nextUrl.searchParams.get("status") || "pending";

        if (!["pending", "completed"].includes(status)) {
            return NextResponse.json({ success: false, message: "Invalid task status" }, { status: 400 })
        }

        // Add lean() for faster queries and select only needed fields
        const tasks = await TaskModel.find({clerkUid: userId, status})
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
        const userContext = await requireUserContext();
        if (userContext instanceof NextResponse) {
            return userContext;
        }

        await connectMongoWithRetry();
        const userId = userContext.clerkUid;

        const rawBody = (await request.json().catch(() => null)) as Record<string, unknown> | null
        if (!rawBody) {
            return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 })
        }

        const parsed = upsertTaskSchema.safeParse(rawBody)
        if (!parsed.success) {
            const issue = parsed.error.issues[0]?.message || "Invalid task payload"
            return NextResponse.json({ success: false, message: issue }, { status: 400 })
        }

        const payload = normalizeTaskPayload(parsed.data)
        const caseId = payload.caseId as string | null;

        if (caseId) {
            const isOwnedCase = await requireOwnedCase(userId, caseId)
            if (!isOwnedCase) {
                return NextResponse.json({ success: false, message: "Case not found" }, { status: 404 })
            }
        }

        const caseFound = caseId ? await Case.findById(caseId) : null
        const ownerUser = await User.findOne({ clerkUid: userId }).select("primaryFirmId").lean().exec()

        if (caseId && !caseFound) {
            return NextResponse.json({ success: false, message: "Case not found" }, { status: 404 })
        }

        const newTask = new TaskModel({
            clerkUid: userId,
            firmId: (caseFound as any)?.firmId || (ownerUser as any)?.primaryFirmId || null,
            ...payload,
        })

        await newTask.save()

        if (caseFound) {
            caseFound.tasks.push(newTask._id)
            await caseFound.save()
        }

        await syncCalendarEventsForUser(userId)

        return NextResponse.json({ success: true, message: "Task added successfully" });
    } catch (error) {
        console.error("Error adding task:", error);
        return NextResponse.json({ success: false, message: "Failed to add task" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const userContext = await requireUserContext();
        if (userContext instanceof NextResponse) {
            return userContext;
        }

        await connectMongoWithRetry();
        const userId = userContext.clerkUid;

        const rawBody = (await request.json().catch(() => null)) as Record<string, unknown> | null
        if (!rawBody) {
            return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 })
        }

        const parsed = upsertTaskSchema.safeParse(rawBody)
        if (!parsed.success) {
            const issue = parsed.error.issues[0]?.message || "Invalid task payload"
            return NextResponse.json({ success: false, message: issue }, { status: 400 })
        }

        if (!parsed.data._id) {
            return NextResponse.json({ success: false, message: "Task ID is required" }, { status: 400 })
        }

        if (parsed.data.caseId) {
            const isOwnedCase = await requireOwnedCase(userId, parsed.data.caseId)
            if (!isOwnedCase) {
                return NextResponse.json({ success: false, message: "Case not found" }, { status: 404 })
            }
        }

        const payload = normalizeTaskPayload(parsed.data)

        // Use findByIdAndUpdate for atomic operation
        const task = await TaskModel.findByIdAndUpdate(
            parsed.data._id,
            { clerkUid: userId, ...payload },
            { new: false }
        );

        if (!task) {
            return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
        }

        await syncCalendarEventsForUser(userId)

        return NextResponse.json({ success: true, message: "Task updated successfully" });
    } catch (error) {
        console.error("Error adding task:", error);
        return NextResponse.json({ success: false, message: "Failed to add task" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const userContext = await requireUserContext();
        if (userContext instanceof NextResponse) {
            return userContext;
        }

        await connectMongoWithRetry();
        const userId = userContext.clerkUid;

        const rawBody = (await request.json().catch(() => null)) as Record<string, unknown> | null
        if (!rawBody) {
            return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 })
        }

        const parsed = deleteTaskSchema.safeParse(rawBody)
        if (!parsed.success) {
            const issue = parsed.error.issues[0]?.message || "Invalid delete payload"
            return NextResponse.json({ success: false, message: issue }, { status: 400 })
        }

        const task = await TaskModel.findOne({ _id: parsed.data._id, clerkUid: userId });
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
        await syncCalendarEventsForUser(userId)

        return NextResponse.json({ success: true, message: "Task deleted successfully" });
    } catch (error) {
        console.error("Error deleting task:", error);
        return NextResponse.json({ success: false, message: "Failed to delete task" }, { status: 500 });
    }
}
