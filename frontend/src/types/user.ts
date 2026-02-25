export interface User {
  _id: string;
  username: string;
  email?: string;
  displayName: string;
  avatarUrl?: string;
  coverUrl?: string;
  bio?: string;
  phone?: string;
  currentCity?: string;
  hometown?: string;
  birthday?: string;
  relationshipStatus?: "single" | "in_relationship" | "married" | "";
  relationshipPartner?: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
    isVerified?: boolean;
  } | null;
  contactInfoVisibility?: "only_me" | "public" | "friends";
  displayNameUpdatedAt?: string;
  emailUpdatedAt?: string;
  phoneUpdatedAt?: string;
  showOnlineStatus?: boolean;
  role?: "user" | "admin";
  isVerified?: boolean;
  verifiedAt?: string | null;
  verificationTier?: "none" | "basic" | "creator" | "business";
  verificationSource?: "none" | "manual" | "id" | "subscription";
  isLocked?: boolean;
  lockReason?: string;
  lockedAt?: string | null;
  lastLoginAt?: string | null;
  warningCount?: number;
  lastWarningAt?: string | null;
  lastWarningReason?: string;
  notificationSettings?: {
    messageAlerts: boolean;
    callSoundEnabled?: boolean;
    messageSoundEnabled?: boolean;
    friendRequestAlerts: boolean;
    securityAlerts: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface RelationshipRequest {
  _id: string;
  from?: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    isVerified?: boolean;
  };
  to?: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    isVerified?: boolean;
  };
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  updatedAt: string;
}

export interface Friend {
  _id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isVerified?: boolean;
  isLocked?: boolean;
  lockReason?: string;
  lockedAt?: string | null;
  lockIncident?: {
    active: boolean;
    lockedAt?: string | null;
    lockReason?: string;
    hasVoted: boolean;
    myVote?: "safe" | "suspicious" | null;
    counts: {
      safe: number;
      suspicious: number;
      total: number;
    };
  };
}

export interface FriendRequest {
  _id: string;
  from?: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    isVerified?: boolean;
  };
  to?: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    isVerified?: boolean;
  };
  message: string;
  createdAt: string;
  updatedAt: string;
}
