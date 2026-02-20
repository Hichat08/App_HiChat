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
  } | null;
  contactInfoVisibility?: "only_me" | "public" | "friends";
  displayNameUpdatedAt?: string;
  emailUpdatedAt?: string;
  phoneUpdatedAt?: string;
  showOnlineStatus?: boolean;
  notificationSettings?: {
    messageAlerts: boolean;
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
  };
  to?: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
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
}

export interface FriendRequest {
  _id: string;
  from?: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  to?: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  message: string;
  createdAt: string;
  updatedAt: string;
}
