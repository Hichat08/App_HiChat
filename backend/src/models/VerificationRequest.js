import mongoose from "mongoose";

const verificationRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    requestedTier: {
      type: String,
      enum: ["basic", "creator", "business"],
      default: "basic",
    },
    requestMethod: {
      type: String,
      enum: ["manual", "id", "subscription"],
      default: "manual",
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

const VerificationRequest = mongoose.model(
  "VerificationRequest",
  verificationRequestSchema,
);

export default VerificationRequest;
