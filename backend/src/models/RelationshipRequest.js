import mongoose from "mongoose";

const relationshipRequestSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

relationshipRequestSchema.index({ from: 1, to: 1, status: 1 }, { unique: true });

const RelationshipRequest = mongoose.model("RelationshipRequest", relationshipRequestSchema);

export default RelationshipRequest;
