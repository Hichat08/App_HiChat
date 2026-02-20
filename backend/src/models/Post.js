import mongoose from "mongoose";

const reactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["like", "love", "care", "haha", "wow", "sad", "angry"],
      required: true,
      default: "like",
    },
  },
  { _id: false },
);

const postSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },
    media: [
      {
        url: { type: String, required: true },
        type: {
          type: String,
          enum: ["image", "video"],
          required: true,
        },
      },
    ],
    visibility: {
      type: String,
      enum: ["public", "custom", "only_me"],
      default: "public",
      required: true,
      index: true,
    },
    allowedViewerIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    reactions: {
      type: [reactionSchema],
      default: [],
    },
    sharedPostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

postSchema.index({ createdAt: -1 });
postSchema.index({ authorId: 1, createdAt: -1 });
postSchema.index({ allowedViewerIds: 1 });
postSchema.index({ likedBy: 1 });
postSchema.index({ "reactions.userId": 1 });

const Post = mongoose.model("Post", postSchema);

export default Post;
