import mongoose from "mongoose";

/**
 * The workflow a matter runs on.
 *
 * Until now the canvas opened on a hardcoded starter graph and had nowhere to
 * save to, so a workflow built for a matter -- by hand or by the assistant --
 * was gone on reload. One per corpus: the workflow belongs to the matter, not
 * to a browser tab.
 *
 * Nodes are stored in the shape the workflow chat tool already emits
 * (app/api/ai/workflow/route.ts), so an AI proposal persists without
 * translation. Positions are left out deliberately -- the canvas lays the chain
 * out itself, and storing stale coordinates would fight it.
 */

const WorkflowNodeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ["trigger", "action", "condition"], required: true },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    icon: { type: String, default: "" },
    color: { type: String, default: "" },
  },
  { _id: false }
);

const WorkflowConnectionSchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  { _id: false }
);

const CorpusWorkflowSchema = new mongoose.Schema(
  {
    clerkUid: { type: String, required: true, index: true },
    corpusId: { type: String, required: true, index: true },
    title: { type: String, default: "Matter workflow", maxlength: 120 },
    nodes: { type: [WorkflowNodeSchema], default: [] },
    connections: { type: [WorkflowConnectionSchema], default: [] },
  },
  { timestamps: true }
);

CorpusWorkflowSchema.index({ clerkUid: 1, corpusId: 1 }, { unique: true });

const CorpusWorkflow =
  mongoose.models["CorpusWorkflow"] || mongoose.model("CorpusWorkflow", CorpusWorkflowSchema);

export default CorpusWorkflow;
