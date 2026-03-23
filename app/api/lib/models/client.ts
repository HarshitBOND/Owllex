import mongoose from "mongoose";

const AddressSchema = new mongoose.Schema(
  {
    building: { type: String },
    street: { type: String },
    city: { type: String },
    district: { type: String },
    state: { type: String },
    pincode: { type: String },
    country: { type: String },
  }
);

const CustomFieldSchema = new mongoose.Schema(
  {
    name: { type: String },
    value: { type: String },
  }
);

export const ClientSchema = new mongoose.Schema(
  {
    firmId: { type: mongoose.Schema.Types.ObjectId, ref: "Firm", default: null, index: true },
    salutation: { type: String, required: true },
    cases: [{ type: mongoose.Schema.Types.ObjectId, ref: "Case", default: [] }],
    name: { type: String, required: true },
    company: { type: String },
    email: { type: String, required: true },
    contact: { type: String, required: true },
    alternateContact: { type: String },
    gstin: { type: String },
    address: { type: AddressSchema, default: {} },
    customFields: { type: [CustomFieldSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    notes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Note", default: [] }]
  }
);

ClientSchema.index({ email: 1 })
ClientSchema.index({ name: 1 })
ClientSchema.index({ createdAt: -1 })
ClientSchema.index({ firmId: 1, email: 1 })

const Client = mongoose.models["Client"] || mongoose.model("Client", ClientSchema);

export default Client;
