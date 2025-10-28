import mongoose from "mongoose";

export const FieldsSchema = new mongoose.Schema(
  {
    caseInfo: { type: Boolean, required: true },
    caseNo: { type: Boolean, required: true },
  }
)

const TaskSchema = new mongoose.Schema(
  {
    task: { type: String, required: true },
    case: { type: mongoose.Schema.Types.ObjectId, ref: "Case" },
    dueDate: { type: String, required: true },
    dueTime: { type: String, required: true },
    reminder: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceName: { type: String },
    fieldToShow: { type: FieldsSchema },
    referenceFile: { type: String },
    status: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }
)

const Task = mongoose.models["Task"] || mongoose.model("Task", TaskSchema);

export default Task;
