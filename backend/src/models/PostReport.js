import mongoose from "mongoose";

const postReportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
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
    isResolved: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isHidden: {
      type: Boolean,
      default: false,
      index: true,
    },
    hiddenAt: {
      type: Date,
      default: null,
    },
    hiddenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const PostReport = mongoose.model("PostReport", postReportSchema);

export default PostReport;
