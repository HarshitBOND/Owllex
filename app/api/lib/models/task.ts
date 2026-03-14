import mongoose from "mongoose";

const TASK_PRIORITY_FIELD = {
  type: String,
  enum: ["low", "medium", "high", "urgent"],
  default: "medium",
} as const

const TASK_CATEGORY_FIELD = {
  type: String,
  enum: ["hearing", "filing", "deposition", "client-meeting", "research", "case-review", "motion", "discovery"],
  default: "case-review",
} as const

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
    priority: TASK_PRIORITY_FIELD,
    category: TASK_CATEGORY_FIELD,
    status: { type: String },
    taskCompletedRemarks: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }
)

const existingTaskModel = mongoose.models["Task"] as mongoose.Model<any> | undefined

if (existingTaskModel) {
  if (!existingTaskModel.schema.path("priority")) {
    existingTaskModel.schema.add({ priority: TASK_PRIORITY_FIELD })
  }

  if (!existingTaskModel.schema.path("category")) {
    existingTaskModel.schema.add({ category: TASK_CATEGORY_FIELD })
  }
}

const Task = existingTaskModel || mongoose.model("Task", TaskSchema);

export default Task;
