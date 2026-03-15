import mongoose from "mongoose";

const FilingSchema = new mongoose.Schema(
  {
    srlNo: { type: String },
    date: { type: String },
    filingDetails: { type: String },
  }
)

const ListingSchema = new mongoose.Schema(
  {
    srlNo: { type: String },
    date: { type: String },
    listingDetails: { type: String },
  }
)

const HearingHistorySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["created", "listing-added", "rescheduled", "updated"],
      default: "updated",
    },
    hearingDate: { type: String, required: true },
    previousCourtDate: { type: String, default: null },
    listingDetails: { type: String, default: "" },
    reason: { type: String, default: "" },
    source: {
      type: String,
      enum: ["case-create", "listing", "reschedule", "manual"],
      default: "manual",
    },
    changedByClerkUid: { type: String, default: null },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const CourtDateAuditEntrySchema = new mongoose.Schema(
  {
    previousCourtDate: { type: String, default: null },
    nextCourtDate: { type: String, required: true },
    reason: { type: String, default: "" },
    source: {
      type: String,
      enum: ["case-create", "listing", "reschedule", "manual"],
      default: "manual",
    },
    changedByClerkUid: { type: String, default: null },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const CaseSchema = new mongoose.Schema(
  {
    fileNo: { type: String },
    caseNo: { type: String, required: true },
    cnrNo: { type: String },
    caseTitle: {type: String, required: true},
    advocate: {type: String, required: true},
    caseStage: {type: String},
    remarks: { type: String, default: ""},
    links: {type: [String], default: []},
    documents: {type: [String], default: []},
    courtName: {type: String},
    courtValue: {type: String},
    courtRoom: {type: String},
    courtDate: {type: String},
    fillingAdvocate: {type: String},
    fillingDate: {type: String},
    status: {type: String},
    registrationDate: {type: String}, 
    filingDetails: {type: [FilingSchema], default: []},
    listingDetails: {type: [ListingSchema], default: []},
    hearingHistory: {type: [HearingHistorySchema], default: []},
    courtDateAuditTrail: {type: [CourtDateAuditEntrySchema], default: []},
    notes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Note", default: [] }],
    clients: [{type: mongoose.Schema.Types.ObjectId, ref: "Client", default: []}],
    tasks: [{type: mongoose.Schema.Types.ObjectId, ref: "Task", default: []}],
  }
);

const Case = mongoose.models["Case"] || mongoose.model("Case", CaseSchema);

export default Case;
