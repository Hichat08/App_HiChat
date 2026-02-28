import api from "@/lib/axios";
import type { Friend, RelationshipRequest, User } from "@/types/user";

export const userService = {
  createExamAttempt: async (payload: {
    subjectId: string;
    subjectName: string;
    mode:
      | "normal"
      | "mediumHard"
      | "hard"
      | "wrongOnly"
      | "custom"
      | "sprint15"
      | "lesson"
      | "python45";
    score: number;
    total: number;
    correct: number;
    incorrect: number;
    blank: number;
    durationMinutes: number;
    lessonAccuracy: Record<string, { total: number; correct: number }>;
  }) => {
    const res = await api.post("/users/exams/attempts", payload);
    return res.data;
  },
  listAdminExamAttempts: async (params?: {
    limit?: number;
    keyword?: string;
    subjectId?: string;
    mode?: string;
  }) => {
    const res = await api.get("/users/admin/exams/attempts", { params });
    return res.data as {
      attempts: Array<{
        _id: string;
        createdAt: string;
        userId: string;
        username: string;
        displayName: string;
        subjectId: string;
        subjectName: string;
        mode:
          | "normal"
          | "mediumHard"
          | "hard"
          | "wrongOnly"
          | "custom"
          | "sprint15"
          | "lesson"
          | "python45";
        score: number;
        total: number;
        correct: number;
        incorrect: number;
        blank: number;
        durationMinutes: number;
        lessonAccuracy: Record<string, { total: number; correct: number }>;
      }>;
    };
  },
  listMyExamAttempts: async (params?: { subjectId?: string; limit?: number }) => {
    const res = await api.get("/users/exams/attempts/me", { params });
    return res.data as {
      attempts: Array<{
        _id: string;
        createdAt: string;
        mode:
          | "normal"
          | "mediumHard"
          | "hard"
          | "wrongOnly"
          | "custom"
          | "sprint15"
          | "lesson"
          | "python45";
        score: number;
        total: number;
        correct: number;
        durationMinutes: number;
        lessonAccuracy: Record<string, { total: number; correct: number }>;
      }>;
    };
  },
  getMyExamState: async (subjectId: string) => {
    const res = await api.get("/users/exams/state", { params: { subjectId } });
    return res.data as {
      subjectId: string;
      wrongQuestionSet: string[];
      noteMap: Record<string, string>;
      updatedAt?: string | null;
    };
  },
  upsertMyExamState: async (payload: {
    subjectId: string;
    wrongQuestionSet: string[];
    noteMap: Record<string, string>;
  }) => {
    const res = await api.put("/users/exams/state", payload);
    return res.data;
  },
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
  getUserProfileById: async (
    userId: string,
  ): Promise<{
    user: User;
    isMe: boolean;
    isFriend: boolean;
    friendCount?: number;
    mutualCount?: number;
    mutualFriends?: Array<{ avatarUrl?: string | null }>;
    followerCount?: number;
    followingCount?: number;
    isFollowing?: boolean;
  }> => {
    const res = await api.get(`/users/${userId}`);
    return res.data;
  },
  followUser: async (userId: string) => {
    const res = await api.post(`/users/${userId}/follow`);
    return res.data;
  },
  unfollowUser: async (userId: string) => {
    const res = await api.delete(`/users/${userId}/follow`);
    return res.data;
  },
  getUserFriendsById: async (userId: string): Promise<Friend[]> => {
    const res = await api.get(`/users/${userId}/friends`);
    return res.data?.friends || [];
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await api.patch("/users/password", {
      currentPassword,
      newPassword,
    });
    return res.data;
  },
  updateNotificationSettings: async (payload: {
    messageAlerts?: boolean;
    callSoundEnabled?: boolean;
    messageSoundEnabled?: boolean;
    friendRequestAlerts?: boolean;
    securityAlerts?: boolean;
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
    const res = await api.patch("/users/online-visibility", {
      showOnlineStatus,
    });
    return res.data;
  },
  submitVerificationRequest: async (payload?: {
    requestedTier?: "basic" | "creator" | "business";
    requestMethod?: "manual" | "id" | "subscription";
  }) => {
    const res = await api.post("/users/verification-request", payload || {});
    return res.data;
  },
  getMyVerificationRequest: async (): Promise<{
    isVerified: boolean;
    verifiedAt?: string | null;
    request?: {
      _id: string;
      status: "pending" | "approved" | "rejected";
      requestedTier?: "basic" | "creator" | "business";
      requestMethod?: "manual" | "id" | "subscription";
      note?: string;
      reviewedAt?: string | null;
      createdAt?: string;
      updatedAt?: string;
    } | null;
    verificationTier?: "none" | "basic" | "creator" | "business";
    verificationSource?: "none" | "manual" | "id" | "subscription";
    privileges?: Record<string, boolean | string>;
  }> => {
    const res = await api.get("/users/verification-request/me");
    return res.data;
  },
  getMyVerifiedPrivileges: async () => {
    const res = await api.get("/users/verification/privileges");
    return res.data;
  },
  getAdminDashboard: async () => {
    const res = await api.get("/users/admin/dashboard");
    return res.data;
  },
  listAdminUsers: async (params?: {
    keyword?: string;
    status?: "all" | "active" | "banned";
    limit?: number;
    cursor?: string | null;
  }) => {
    const res = await api.get("/users/admin/users/list", { params });
    return res.data;
  },
  listVerificationRequestsAdmin: async (params?: {
    status?: "all" | "pending" | "approved" | "rejected";
    limit?: number;
  }) => {
    const res = await api.get("/users/admin/verification-requests", { params });
    return res.data;
  },
  resolveVerificationRequestAdmin: async (
    requestId: string,
    approved: boolean,
    note?: string,
    approvedTier?: "basic" | "creator" | "business",
  ) => {
    const res = await api.patch(`/users/admin/verification-requests/${requestId}/resolve`, {
      approved,
      note,
      approvedTier,
    });
    return res.data;
  },
  toggleUserVerification: async (userId: string, verified: boolean) => {
    const res = await api.patch(`/users/admin/users/${userId}/verify`, { verified });
    return res.data;
  },
  resetUserPassword: async (userId: string, newPassword?: string) => {
    const res = await api.patch(`/users/admin/users/${userId}/reset-password`, {
      newPassword,
    });
    return res.data;
  },
  transferAdminRole: async (newAdminId: string) => {
    const res = await api.post("/users/admin/transfer", { newAdminId });
    return res.data;
  },
  updateUserRole: async (
    userId: string,
    role: "user" | "admin",
    reason?: string,
  ) => {
    const res = await api.patch(`/users/admin/users/${userId}/role`, {
      role,
      reason,
    });
    return res.data;
  },
  searchUserByUsername: async (keyword: string) => {
    const res = await api.get("/users/search", { params: { keyword } });
    return res.data?.user || null;
  },
  listAdmins: async () => {
    const res = await api.get("/users/admin/users");
    return res.data?.admins || [];
  },
  getSupportAdmin: async () => {
    const res = await api.get("/users/support/admin");
    return res.data?.admin || null;
  },
  sendSupportMessage: async (message: string) => {
    const res = await api.post("/users/support/message", { message });
    return res.data;
  },
  sendSupportMessagePublic: async (payload: {
    message: string;
    displayName?: string;
    username?: string;
  }) => {
    try {
      const res = await api.post("/auth/support/message-public", payload);
      return res.data;
    } catch (error: any) {
      const status = error?.response?.status;
      if (status !== 401 && status !== 404) {
        throw error;
      }
      const fallbackRes = await api.post("/users/support/message-public", payload);
      return fallbackRes.data;
    }
  },
  listSupportRequests: async (limit: number = 50, cursor?: string | null) => {
    // support-related endpoints are bundled under /users/support
    const res = await api.get("/users/support/admin/support-requests", {
      params: { limit, cursor: cursor || undefined },
    });
    return res.data;
  },
  updateSupportRequestStatus: async (
    requestId: string,
    status: "open" | "closed",
  ) => {
    const res = await api.patch(
      `/users/support/admin/support-requests/${requestId}/status`,
      {
        status,
      },
    );
    return res.data;
  },
  replySupportRequest: async (requestId: string, message: string) => {
    const res = await api.patch(
      `/users/support/admin/support-requests/${requestId}/reply`,
      { message },
    );
    return res.data;
  },
  listSupportRequestsPublic: async (username: string) => {
    const normalized = username?.trim?.().toLowerCase?.();
    if (!normalized) {
      return { requests: [] };
    }
    try {
      const res = await api.get("/auth/support/messages-public", {
        params: { username: normalized },
      });
      return res.data;
    } catch (error: any) {
      const status = error?.response?.status;
      if (status !== 401 && status !== 404) {
        throw error;
      }
      const fallbackRes = await api.get("/users/support/messages-public", {
        params: { username: normalized },
      });
      return fallbackRes.data;
    }
  },
  listAdminAuditLogs: async (limit: number = 50, cursor?: string | null) => {
    const res = await api.get("/users/admin/audit-logs", {
      params: { limit, cursor: cursor || undefined },
    });
    return res.data;
  },
  listUserReports: async (
    limit: number = 50,
    cursor?: string | null,
    status: "all" | "pending" | "resolved" = "all",
    includeHidden: boolean = false,
  ) => {
    const res = await api.get("/users/admin/reports", {
      params: {
        limit,
        cursor: cursor || undefined,
        status,
        includeHidden: includeHidden ? "true" : "false",
      },
    });
    return res.data;
  },
  resolveUserReport: async (reportId: string, resolved: boolean = true) => {
    const res = await api.patch(`/users/admin/reports/${reportId}/resolve`, {
      resolved,
    });
    return res.data;
  },
  hideUserReport: async (reportId: string, hidden: boolean = true) => {
    const res = await api.patch(`/users/admin/reports/${reportId}/hide`, {
      hidden,
    });
    return res.data;
  },
  deleteUserReport: async (reportId: string) => {
    const res = await api.delete(`/users/admin/reports/${reportId}`);
    return res.data;
  },
  warnUser: async (userId: string, reason: string) => {
    const res = await api.patch(`/users/admin/users/${userId}/warn`, {
      reason,
    });
    return res.data;
  },
  lockUser: async (userId: string, locked: boolean, reason?: string) => {
    const res = await api.patch(`/users/admin/users/${userId}/lock`, {
      locked,
      reason,
    });
    return res.data;
  },
  deleteUserByAdmin: async (userId: string) => {
    const res = await api.delete(`/users/admin/users/${userId}`);
    return res.data;
  },
  adjustConversationStreakAdmin: async (
    conversationId: string,
    payload: {
      action: "increase" | "decrease" | "reset";
      amount?: number;
      reason?: string;
    },
  ) => {
    const res = await api.patch(
      `/users/admin/conversations/${conversationId}/streak`,
      payload,
    );
    return res.data;
  },
  resolveDirectConversationByDisplayNamesAdmin: async (
    displayNameA: string,
    displayNameB: string,
  ) => {
    const res = await api.post(
      "/users/admin/conversations/resolve-direct-by-display-name",
      {
        displayNameA,
        displayNameB,
      },
    );
    return res.data;
  },
  sendAdminNotification: async (payload: {
    title: string;
    description: string;
    mode: "all" | "selected";
    targetUserIds?: string[];
  }) => {
    const res = await api.post("/users/admin/notify", payload);
    return res.data;
  },
  getBanner: async (): Promise<{ bannerUrl: string }> => {
    const res = await api.get("/users/banner");
    return { bannerUrl: res.data?.bannerUrl || "" };
  },
  updateBanner: async (payload: {
    file?: File;
    bannerUrl?: string;
    clear?: boolean;
  }) => {
    if (payload.file) {
      const formData = new FormData();
      formData.append("file", payload.file);
      const res = await api.post("/users/admin/banner", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    }
    const res = await api.post("/users/admin/banner", {
      bannerUrl: payload.bannerUrl,
      clear: payload.clear,
    });
    return res.data;
  },
  listGroupReports: async (
    limit: number = 50,
    cursor?: string | null,
    status: "all" | "pending" | "resolved" = "all",
    includeHidden: boolean = false,
  ) => {
    const res = await api.get("/conversations/admin/group-reports", {
      params: {
        limit,
        cursor: cursor || undefined,
        status,
        includeHidden: includeHidden ? "true" : "false",
      },
    });
    return res.data;
  },
  resolveGroupReport: async (reportId: string, resolved: boolean = true) => {
    const res = await api.patch(`/conversations/admin/group-reports/${reportId}/resolve`, {
      resolved,
    });
    return res.data;
  },
  hideGroupReport: async (reportId: string, hidden: boolean = true) => {
    const res = await api.patch(`/conversations/admin/group-reports/${reportId}/hide`, {
      hidden,
    });
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
  acceptRelationshipRequest: async (
    requestId: string,
  ): Promise<{ message: string; user: User }> => {
    const res = await api.post(
      `/users/relationship-requests/${requestId}/accept`,
    );
    return res.data;
  },
  declineRelationshipRequest: async (
    requestId: string,
  ): Promise<{ message: string }> => {
    const res = await api.post(
      `/users/relationship-requests/${requestId}/decline`,
    );
    return res.data;
  },
};
