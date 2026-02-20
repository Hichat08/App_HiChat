import mongoose from "mongoose";

const userReportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 300,
      required: true,
    },
    detail: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  },
);

const UserReport = mongoose.model("UserReport", userReportSchema);

export default UserReport;
