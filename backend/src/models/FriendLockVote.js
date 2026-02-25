import mongoose from "mongoose";

const friendLockVoteSchema = new mongoose.Schema(
  {
    lockedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    voterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Snapshot thời điểm khóa để mỗi lần khóa mới là một đợt bình chọn mới.
    lockedAtSnapshot: {
      type: Date,
      required: true,
      index: true,
    },
    vote: {
      type: String,
      enum: ["safe", "suspicious"],
      required: true,
    },
  },
  { timestamps: true },
);

friendLockVoteSchema.index(
  { lockedUserId: 1, voterId: 1, lockedAtSnapshot: 1 },
  { unique: true },
);

const FriendLockVote = mongoose.model("FriendLockVote", friendLockVoteSchema);

export default FriendLockVote;
