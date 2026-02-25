import api from "@/lib/axios";
import type { Conversation, ConversationResponse, Message } from "@/types/chat";

interface FetchMessageProps {
  messages: Message[];
  cursor?: string;
}

const pageLimit = 50;

export const chatService = {
  async fetchConversations(): Promise<ConversationResponse> {
    const res = await api.get("/conversations");
    return res.data;
  },

  async fetchMessages(id: string, cursor?: string): Promise<FetchMessageProps> {
    const res = await api.get(
      `/conversations/${id}/messages?limit=${pageLimit}&cursor=${cursor}`
    );

    return { messages: res.data.messages, cursor: res.data.nextCursor };
  },

  async sendDirectMessage(
    recipientId: string,
    content: string = "",
    imgUrl?: string,
    conversationId?: string,
    audioUrl?: string,
    videoUrl?: string
  ) {
    const res = await api.post("/messages/direct", {
      recipientId,
      content,
      imgUrl,
      conversationId,
      audioUrl,
      videoUrl,
    });

    return res.data.message;
  },

  async sendGroupMessage(
    conversationId: string,
    content: string = "",
    imgUrl?: string,
    audioUrl?: string,
    videoUrl?: string
  ) {
    const res = await api.post("/messages/group", {
      conversationId,
      content,
      imgUrl,
      audioUrl,
      videoUrl,
    });
    return res.data.message;
  },

  async uploadChatMedia(file: File): Promise<{ url: string; mediaType: "image" | "audio" | "video" }> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post("/messages/upload-media", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async markAsSeen(conversationId: string) {
    const res = await api.patch(`/conversations/${conversationId}/seen`);
    return res.data;
  },

  async clearConversationMessages(
    conversationId: string
  ): Promise<{
    message: string;
    conversation?: Conversation;
    removedConversationId?: string;
    friendshipRemoved?: boolean;
  }> {
    const res = await api.delete(`/conversations/${conversationId}/messages`);
    return res.data;
  },

  async toggleBlockConversationUser(
    conversationId: string
  ): Promise<{ message: string; blockedByMe: boolean }> {
    const res = await api.patch(`/conversations/${conversationId}/block`);
    return res.data;
  },

  async toggleRestrictConversationUser(
    conversationId: string
  ): Promise<{ message: string; restrictedByMe: boolean }> {
    const res = await api.patch(`/conversations/${conversationId}/restrict`);
    return res.data;
  },

  async updateConversationTheme(
    conversationId: string,
    themeId: string
  ): Promise<{ message: string; directThemeId: string }> {
    const res = await api.patch(`/conversations/${conversationId}/theme`, {
      themeId,
    });
    return res.data;
  },

  async updateConversationNickname(
    conversationId: string,
    targetUserId: string,
    nickname: string
  ): Promise<{ message: string; nickname: string; nicknames?: Record<string, string> }> {
    const res = await api.patch(`/conversations/${conversationId}/nickname`, {
      targetUserId,
      nickname,
    });
    return res.data;
  },

  async updateGroupNickname(
    conversationId: string,
    nickname: string
  ): Promise<{ message: string; nickname: string; nicknames?: Record<string, string> }> {
    const res = await api.patch(`/conversations/${conversationId}/group-nickname`, {
      nickname,
    });
    return res.data;
  },

  async updateConversationMute(
    conversationId: string,
    muted: boolean
  ): Promise<{ message: string; muted: boolean }> {
    const res = await api.patch(`/conversations/${conversationId}/mute`, { muted });
    return res.data;
  },

  async updateConversationReadReceipt(
    conversationId: string,
    enabled: boolean
  ): Promise<{ message: string; readReceiptEnabled: boolean }> {
    const res = await api.patch(`/conversations/${conversationId}/read-receipt`, { enabled });
    return res.data;
  },

  async updateConversationArchive(
    conversationId: string,
    archived: boolean
  ): Promise<{ message: string; archived: boolean }> {
    const res = await api.patch(`/conversations/${conversationId}/archive`, { archived });
    return res.data;
  },

  async updateConversationE2EE(
    conversationId: string,
    enabled: boolean
  ): Promise<{ message: string; e2eeEnabled: boolean; e2eeActive: boolean }> {
    const res = await api.patch(`/conversations/${conversationId}/e2ee`, { enabled });
    return res.data;
  },

  async reportConversation(
    conversationId: string,
    reason: string,
    detail?: string
  ): Promise<{ message: string }> {
    const res = await api.post(`/conversations/${conversationId}/report`, { reason, detail });
    return res.data;
  },

  async createConversation(
    type: "direct" | "group",
    name: string,
    memberIds: string[]
  ) {
    const res = await api.post("/conversations", { type, name, memberIds });
    return res.data.conversation;
  },

  async acceptDirectRequest(conversationId: string) {
    const res = await api.patch(`/messages/direct/${conversationId}/accept`);
    return res.data;
  },

  async rejectDirectRequest(conversationId: string) {
    const res = await api.patch(`/messages/direct/${conversationId}/reject`);
    return res.data;
  },

  async requestDirectStreakMode(
    conversationId: string,
    type: "love" | "friends"
  ): Promise<{ message: string; streakMode: Conversation["streakMode"]; directThemeId?: string }> {
    const res = await api.patch(`/messages/direct/${conversationId}/streak-mode/request`, { type });
    return res.data;
  },

  async acceptDirectStreakMode(
    conversationId: string
  ): Promise<{
    message: string;
    streakMode: Conversation["streakMode"];
    directThemeId?: string;
    streakCount?: number;
  }> {
    const res = await api.patch(`/messages/direct/${conversationId}/streak-mode/accept`);
    return res.data;
  },

  async rejectDirectStreakMode(
    conversationId: string
  ): Promise<{
    message: string;
    streakMode: Conversation["streakMode"];
    directThemeId?: string;
    streakCount?: number;
  }> {
    const res = await api.patch(`/messages/direct/${conversationId}/streak-mode/reject`);
    return res.data;
  },

  async voteLockedRecipientIncident(
    targetUserId: string,
    vote: "safe" | "suspicious"
  ): Promise<{ message: string; hasVoted: boolean; myVote: "safe" | "suspicious" }> {
    const res = await api.post("/messages/direct/locked-recipient-vote", {
      targetUserId,
      vote,
    });
    return res.data;
  },

  async addGroupMembers(
    conversationId: string,
    memberIds: string[]
  ): Promise<Conversation> {
    const res = await api.post(`/conversations/${conversationId}/members`, {
      memberIds,
    });
    return res.data.conversation;
  },

  async updateGroupAvatar(
    conversationId: string,
    formData: FormData
  ): Promise<Conversation> {
    const res = await api.post(`/conversations/${conversationId}/avatar`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.conversation;
  },

  async updateGroupName(
    conversationId: string,
    name: string
  ): Promise<Conversation> {
    const res = await api.patch(`/conversations/${conversationId}/name`, { name });
    return res.data.conversation;
  },

  async leaveGroup(conversationId: string): Promise<{ removedConversationId?: string; conversation?: Conversation }> {
    const res = await api.patch(`/conversations/${conversationId}/leave`);
    return res.data;
  },
};
