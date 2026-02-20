import mongoose from "mongoose";

const userBlockSchema = new mongoose.Schema(
  {
    blockerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    blockedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  },
);

userBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

const UserBlock = mongoose.model("UserBlock", userBlockSchema);

export default UserBlock;
