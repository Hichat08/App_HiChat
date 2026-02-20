import api from "@/lib/axios";
import type { Friend, RelationshipRequest, User } from "@/types/user";

export const userService = {
  updateProfile: async (payload: {
    displayName?: string;
    username?: string;
    email?: string;
    phone?: string;
    bio?: string;
    currentCity?: string;
    hometown?: string;
    birthday?: string;
    relationshipStatus?: "single" | "in_relationship" | "married" | "";
    contactInfoVisibility?: "only_me" | "public" | "friends";
  }): Promise<{ message: string; user: User }> => {
    const res = await api.patch("/users/profile", payload);
    return res.data;
  },
  uploadAvatar: async (formData: FormData) => {
    const res = await api.post("/users/uploadAvatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    if (res.status === 400) {
      throw new Error(res.data.message);
    }

    return res.data;
  },
  uploadCover: async (formData: FormData) => {
    const res = await api.post("/users/uploadCover", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    if (res.status === 400) {
      throw new Error(res.data.message);
    }

    return res.data;
  },
  getUserProfileById: async (userId: string): Promise<{
    user: User;
    isMe: boolean;
    isFriend: boolean;
  }> => {
    const res = await api.get(`/users/${userId}`);
    return res.data;
  },
  getUserFriendsById: async (userId: string): Promise<Friend[]> => {
    const res = await api.get(`/users/${userId}/friends`);
    return res.data?.friends || [];
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await api.patch("/users/password", { currentPassword, newPassword });
    return res.data;
  },
  updateNotificationSettings: async (payload: {
    messageAlerts: boolean;
    friendRequestAlerts: boolean;
    securityAlerts: boolean;
  }) => {
    const res = await api.patch("/users/notifications", payload);
    return res.data;
  },
  blockAndReportUser: async (payload: {
    username: string;
    reason: string;
    detail?: string;
    blockUser?: boolean;
  }) => {
    const res = await api.post("/users/block-report", payload);
    return res.data;
  },
  deleteMyAccount: async (password: string) => {
    const res = await api.delete("/users/me", { data: { password } });
    return res.data;
  },
  updateOnlineVisibility: async (showOnlineStatus: boolean) => {
    const res = await api.patch("/users/online-visibility", { showOnlineStatus });
    return res.data;
  },
  sendRelationshipRequest: async (toUserId: string) => {
    const res = await api.post("/users/relationship-requests", { toUserId });
    return res.data;
  },
  getRelationshipRequests: async (): Promise<{
    received: RelationshipRequest[];
    sent: RelationshipRequest[];
  }> => {
    const res = await api.get("/users/relationship-requests");
    return {
      received: res.data?.received || [],
      sent: res.data?.sent || [],
    };
  },
  acceptRelationshipRequest: async (requestId: string): Promise<{ message: string; user: User }> => {
    const res = await api.post(`/users/relationship-requests/${requestId}/accept`);
    return res.data;
  },
  declineRelationshipRequest: async (requestId: string): Promise<{ message: string }> => {
    const res = await api.post(`/users/relationship-requests/${requestId}/decline`);
    return res.data;
  },
};
