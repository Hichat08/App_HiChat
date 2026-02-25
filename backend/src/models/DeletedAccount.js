import mongoose from "mongoose";

const deletedAccountSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    displayName: {
      type: String,
      trim: true,
      default: "",
    },
    deletedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const DeletedAccount = mongoose.model("DeletedAccount", deletedAccountSchema);

export default DeletedAccount;
