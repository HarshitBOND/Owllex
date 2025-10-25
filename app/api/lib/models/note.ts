import mongoose from "mongoose";

const noteSchema = new mongoose.Schema({
    title: {type: String},
    content: {type: String},
    contentJson: {type: mongoose.Schema.Types.Mixed},
    createdAt: {type: Date, default: Date.now},
    updatedAt: {type: Date, default: Date.now},
    visibility: {type: String},
});

const Note = mongoose.models["Note"] || mongoose.model("Note", noteSchema);

export default Note;
