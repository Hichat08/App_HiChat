import mongoose from "mongoose";

const userArchiveItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      required: true,
      maxlength: 120,
    },
    content: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
  },
  { timestamps: true }
);

userArchiveItemSchema.index({ userId: 1, createdAt: -1 });

const UserArchiveItem = mongoose.model("UserArchiveItem", userArchiveItemSchema);
export default UserArchiveItem;
