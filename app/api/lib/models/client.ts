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

const ClientSchema = new mongoose.Schema(
  {
    salutation: { type: String, required: true },
    cases: { type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Case",
    }], default: [] },
    name: { type: String, required: true },
    company: { type: String },
    email: { type: String, required: true },
    contact: { type: String, required: true },
    alternateContact: { type: String },
    gstin: { type: String },
    address: { type: [AddressSchema], default: [] },
    customFields: { type: [CustomFieldSchema], default: [] },
  }
);

const Client = mongoose.model("Client", ClientSchema);

export default Client;
