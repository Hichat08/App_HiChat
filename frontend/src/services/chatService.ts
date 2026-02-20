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
};
