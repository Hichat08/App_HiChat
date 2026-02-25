export interface Participant {
  _id: string;
  displayName: string;
  avatarUrl?: string | null;
  joinedAt: string;
  isVerified?: boolean;
  isLocked?: boolean;
  lockReason?: string;
  lockedAt?: string | null;
}

export interface SeenUser {
  _id: string;
  displayName?: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
}

export interface Group {
  name: string;
  createdBy: string;
  avatarUrl?: string | null;
  avatarId?: string | null;
}

export interface LastMessage {
  _id: string;
  content: string;
  createdAt: string;
  sender: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
    isVerified?: boolean;
  };
}

export interface Conversation {
  _id: string;
  type: "direct" | "group";
  group: Group;
  participants: Participant[];
  lastMessageAt: string;
  seenBy: SeenUser[];
  lastMessage: LastMessage | null;
  unreadCounts: Record<string, number>; // key = userId, value = unread count
  createdAt: string;
  updatedAt: string;
  // optional streak count (consecutive days both users interacted)
  streakCount?: number;
  streakMissLevel?: number;
  streakCompletedToday?: boolean;
  streakAtRisk?: boolean;
  streakExpiresAt?: string | null;
  streakRecoveryMode?: "free" | "minus_one" | null;
  streakLost?: boolean;
  streakMode?: {
    type: "love" | "dating" | "friends" | null;
    status: "none" | "pending" | "active";
    requestedBy?: string | null;
    requestedAt?: string | null;
    acceptedUserIds?: string[];
    activatedAt?: string | null;
  };
  directRequest?: {
    status: "none" | "pending" | "accepted" | "rejected";
    requesterId?: string | null;
    responderId?: string | null;
    requesterMessageCount?: number;
    respondedAt?: string | null;
    respondedBy?: string | null;
  };
  blockedByMe?: boolean;
  blockedByOther?: boolean;
  restrictedByMe?: boolean;
  restrictedByOther?: boolean;
  directThemeId?: string;
  nicknames?: Record<string, string>;
  nickname?: string;
  muted?: boolean;
  archived?: boolean;
  readReceiptEnabled?: boolean;
  e2eeEnabled?: boolean;
  e2eeActive?: boolean;
  lockIncidentVote?: {
    hasVoted: boolean;
    myVote?: "safe" | "suspicious" | null;
  };
}

export interface ConversationResponse {
  conversations: Conversation[];
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  imgUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  deliveredAt?: string | null;
  seenAt?: string | null;
  updatedAt?: string | null;
  createdAt: string;
  isOwn?: boolean;
}
