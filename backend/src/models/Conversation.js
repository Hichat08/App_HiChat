import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  },
);

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    avatarId: {
      type: String,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const lastMessageSchema = new mongoose.Schema(
  {
    _id: { type: String },
    content: {
      type: String,
      default: null,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["direct", "group"],
      required: true,
    },
    participants: {
      type: [participantSchema],
      required: true,
    },
    group: {
      type: groupSchema,
    },
    lastMessageAt: {
      type: Date,
    },
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    lastMessage: {
      type: lastMessageSchema,
      default: null,
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    // streak: consecutive days two participants both interacted
    streak: {
      count: { type: Number, default: 0 },
      // ISO date string (YYYY-MM-DD) of the last day the streak was counted
      lastCountedDay: { type: String, default: null },
      // 0 = normal, 1 = first-miss (free restore), 2 = second-miss (-1 restore)
      missLevel: { type: Number, default: 0 },
    },
    // map userId -> ISO date string (YYYY-MM-DD) of last message day for that user
    lastMessageDayBy: {
      type: Map,
      of: String,
      default: {},
    },
    directRequest: {
      status: {
        type: String,
        enum: ["none", "pending", "accepted", "rejected"],
        default: "none",
      },
      requesterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      responderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      requesterMessageCount: {
        type: Number,
        default: 0,
      },
      respondedAt: {
        type: Date,
        default: null,
      },
      respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
    // shared direct-chat theme (both participants see same)
    directThemeId: {
      type: String,
      default: "violet",
      trim: true,
    },
    // per-user nickname (key: "viewerId:targetId" -> nickname)
    nicknames: {
      type: Map,
      of: String,
      default: {},
    },
    // per-user mute flag
    mutedBy: {
      type: Map,
      of: Boolean,
      default: {},
    },
    // per-user read receipt flag (default true if missing)
    readReceiptBy: {
      type: Map,
      of: Boolean,
      default: {},
    },
    // per-user archive flag
    archivedBy: {
      type: Map,
      of: Boolean,
      default: {},
    },
    // per-user end-to-end encryption preference
    e2eeEnabledBy: {
      type: Map,
      of: Boolean,
      default: {},
    },
    // active only when all participants enable
    e2eeActive: {
      type: Boolean,
      default: false,
    },
    // direct streak mode requires both participants to accept before active
    streakMode: {
      type: {
        type: String,
        enum: ["love", "dating", "friends", null],
        default: null,
      },
      status: {
        type: String,
        enum: ["none", "pending", "active"],
        default: "none",
      },
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      requestedAt: {
        type: Date,
        default: null,
      },
      acceptedUserIds: {
        type: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
        ],
        default: [],
      },
      activatedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  },
);

conversationSchema.index({
  "participant.userId": 1,
  lastMessageAt: -1,
});

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
