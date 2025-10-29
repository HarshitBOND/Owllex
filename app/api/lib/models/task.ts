import mongoose from "mongoose";

const ReminderSchema = new mongoose.Schema(
  {
    reminderTime: { type: String, required: true },
    reminderTimeUnit: { type: String, required: true },
  }
)

export const FieldsSchema = new mongoose.Schema(
  {
    caseInfo: { type: Boolean, required: true },
    caseNo: { type: Boolean, required: true },
  }
)

const TaskSchema = new mongoose.Schema(
  {
    clerkUid: { type: String, required: true },
    task: { type: String, required: true },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case", default: null },
    dueDate: { type: String, required: true },
    dueTime: { type: String },
    reminder: { type: ReminderSchema },
    resourceType: { type: String, required: true },
    resourceName: { type: String },
    fieldToShow: { type: FieldsSchema },
    referenceFiles: { type: [String], default: [] },
    status: { type: String },
    taskCompletedRemarks: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }
)

const Task = mongoose.models["Task"] || mongoose.model("Task", TaskSchema);

export default Task;
