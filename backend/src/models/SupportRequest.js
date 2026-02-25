import mongoose from "mongoose";

const supportRequestSchema = new mongoose.Schema(
  {
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    requesterName: { type: String, default: "" },
    requesterUsername: { type: String, default: "" },
    message: { type: String, required: true },
    adminReply: {
      message: { type: String, default: "" },
      adminName: { type: String, default: "" },
      createdAt: { type: Date, default: null },
    },
    status: { type: String, enum: ["open", "closed"], default: "open" },
  },
  { timestamps: true }
);

const SupportRequest = mongoose.model("SupportRequest", supportRequestSchema);

export default SupportRequest;
