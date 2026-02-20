import mongoose from "mongoose";

const userRestrictionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    restrictedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

userRestrictionSchema.index({ userId: 1, restrictedUserId: 1 }, { unique: true });

const UserRestriction = mongoose.model("UserRestriction", userRestrictionSchema);

export default UserRestriction;
