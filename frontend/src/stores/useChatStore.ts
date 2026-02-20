import { chatService } from "@/services/chatService";
import type { ChatState } from "@/types/store";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuthStore } from "./useAuthStore";
import { useSocketStore } from "./useSocketStore";

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      messages: {},
      activeConversationId: null,
      convoLoading: false, // convo loading
      messageLoading: false,
      loading: false,

      setActiveConversation: (id) => set({ activeConversationId: id }),
      reset: () => {
        set({
          conversations: [],
          messages: {},
          activeConversationId: null,
          convoLoading: false,
          messageLoading: false,
        });
      },
      fetchConversations: async () => {
        try {
          set({ convoLoading: true });
          const { conversations } = await chatService.fetchConversations();

          set({ conversations, convoLoading: false });
        } catch (error) {
          console.error("Lỗi xảy ra khi fetchConversations:", error);
          set({ convoLoading: false });
        }
      },
      fetchMessages: async (conversationId) => {
        const { activeConversationId, messages } = get();
        const { user } = useAuthStore.getState();

        const convoId = conversationId ?? activeConversationId;

        if (!convoId) return;

        const current = messages?.[convoId];
        const nextCursor =
          current?.nextCursor === undefined ? "" : current?.nextCursor;

        if (nextCursor === null) return;

        set({ messageLoading: true });

        try {
          const { messages: fetched, cursor } = await chatService.fetchMessages(
            convoId,
            nextCursor
          );

          const processed = fetched.map((m) => ({
            ...m,
            isOwn: m.senderId === user?._id,
          }));

          set((state) => {
            const prev = state.messages[convoId]?.items ?? [];
            const merged = prev.length > 0 ? [...processed, ...prev] : processed;

            return {
              messages: {
                ...state.messages,
                [convoId]: {
                  items: merged,
                  hasMore: !!cursor,
                  nextCursor: cursor ?? null,
                },
              },
            };
          });
        } catch (error) {
          console.error("Lỗi xảy ra khi fetchMessages:", error);
        } finally {
          set({ messageLoading: false });
        }
      },
      sendDirectMessage: async (recipientId, content, imgUrl, audioUrl, videoUrl) => {
        try {
          const { activeConversationId } = get();
          await chatService.sendDirectMessage(
            recipientId,
            content,
            imgUrl,
            activeConversationId || undefined,
            audioUrl,
            videoUrl
          );
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === activeConversationId ? { ...c, seenBy: [] } : c
            ),
          }));
        } catch (error) {
          console.error("Lỗi xảy ra khi gửi direct message", error);
          throw error;
        }
      },
      sendGroupMessage: async (conversationId, content, imgUrl, audioUrl, videoUrl) => {
        try {
          await chatService.sendGroupMessage(conversationId, content, imgUrl, audioUrl, videoUrl);
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === get().activeConversationId ? { ...c, seenBy: [] } : c
            ),
          }));
        } catch (error) {
          console.error("Lỗi xảy ra gửi group message", error);
          throw error;
        }
      },
      addMessage: async (message) => {
        try {
          const { user } = useAuthStore.getState();
          const { fetchMessages } = get();

          message.isOwn = message.senderId === user?._id;

          const convoId = message.conversationId;

          let prevItems = get().messages[convoId]?.items ?? [];

          if (prevItems.length === 0) {
            await fetchMessages(message.conversationId);
            prevItems = get().messages[convoId]?.items ?? [];
          }

          set((state) => {
            if (prevItems.some((m) => m._id === message._id)) {
              return state;
            }

            return {
              messages: {
                ...state.messages,
                [convoId]: {
                  items: [...prevItems, message],
                  hasMore: state.messages[convoId].hasMore,
                  nextCursor: state.messages[convoId].nextCursor ?? undefined,
                },
              },
            };
          });
        } catch (error) {
          console.error("Lỗi xảy khi ra add message:", error);
        }
      },
      markMessagesDelivered: (conversationId, messageIds, deliveredAt) => {
        if (!messageIds?.length) return;

        set((state) => {
          const existing = state.messages[conversationId];
          if (!existing) return state;

          const idSet = new Set(messageIds);
          const items = existing.items.map((m) =>
            idSet.has(m._id) ? { ...m, deliveredAt } : m
          );

          return {
            messages: {
              ...state.messages,
              [conversationId]: {
                ...existing,
                items,
              },
            },
          };
        });
      },
      markMessagesSeen: (conversationId, messageIds, seenAt) => {
        if (!messageIds?.length) return;

        set((state) => {
          const existing = state.messages[conversationId];
          if (!existing) return state;

          const idSet = new Set(messageIds);
          const items = existing.items.map((m) =>
            idSet.has(m._id)
              ? { ...m, seenAt, deliveredAt: m.deliveredAt ?? seenAt }
              : m
          );

          return {
            messages: {
              ...state.messages,
              [conversationId]: {
                ...existing,
                items,
              },
            },
          };
        });
      },
      updateConversation: (conversation) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c._id === conversation._id ? { ...c, ...conversation } : c
          ),
        }));
      },
      applyConversationCleared: (conversation) => {
        set((state) => {
          const exists = state.conversations.some((c) => c._id === conversation._id);
          const nextMessages = {
            ...state.messages,
            [conversation._id]: {
              items: [],
              hasMore: false,
              nextCursor: null,
            },
          };

          return {
            conversations: exists
              ? state.conversations.map((c) =>
                  c._id === conversation._id ? { ...c, ...conversation } : c
                )
              : [conversation, ...state.conversations],
            messages: nextMessages,
          };
        });
      },
      removeConversation: (conversationId) => {
        set((state) => {
          const nextMessages = { ...state.messages };
          delete nextMessages[conversationId];

          return {
            conversations: state.conversations.filter((c) => c._id !== conversationId),
            messages: nextMessages,
            activeConversationId:
              state.activeConversationId === conversationId
                ? null
                : state.activeConversationId,
          };
        });
      },
      markAsSeen: async () => {
        try {
          const { user } = useAuthStore.getState();
          const { activeConversationId, conversations } = get();

          if (!activeConversationId || !user) {
            return;
          }

          const convo = conversations.find((c) => c._id === activeConversationId);

          if (!convo) {
            return;
          }

          if ((convo.unreadCounts?.[user._id] ?? 0) === 0) {
            return;
          }

          await chatService.markAsSeen(activeConversationId);

          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === activeConversationId && c.lastMessage
                ? {
                    ...c,
                    unreadCounts: {
                      ...c.unreadCounts,
                      [user._id]: 0,
                    },
                  }
                : c
            ),
          }));
        } catch (error) {
          console.error("Lỗi xảy ra khi gọi markAsSeen trong store", error);
        }
      },
      addConvo: (convo) => {
        set((state) => {
          const exists = state.conversations.some(
            (c) => c._id.toString() === convo._id.toString()
          );

          return {
            conversations: exists
              ? state.conversations
              : [convo, ...state.conversations],
            activeConversationId: convo._id,
          };
        });
      },
      createConversation: async (type, name, memberIds) => {
        try {
          set({ loading: true });
          const conversation = await chatService.createConversation(
            type,
            name,
            memberIds
          );

          get().addConvo(conversation);

          useSocketStore
            .getState()
            .socket?.emit("join-conversation", conversation._id);

          return conversation._id;
        } catch (error) {
          console.error("Lỗi xảy ra khi gọi createConversation trong store", error);
          return null;
        } finally {
          set({ loading: false });
        }
      },
      openDirectConversation: async (targetUserId) => {
        try {
          const { conversations, messages, fetchMessages, setActiveConversation } = get();
          const { user } = useAuthStore.getState();

          if (!user?._id || user._id === targetUserId) return null;

          const existing = conversations.find((convo) => {
            if (convo.type !== "direct") return false;
            const participantIds = convo.participants.map((p) => p._id);
            return (
              participantIds.includes(user._id) &&
              participantIds.includes(targetUserId)
            );
          });

          const conversationId =
            existing?._id ??
            (await get().createConversation("direct", "", [targetUserId]));

          if (!conversationId) return null;

          setActiveConversation(conversationId);

          if (!messages[conversationId]) {
            await fetchMessages(conversationId);
          }

          return conversationId;
        } catch (error) {
          console.error("Lỗi khi mở cuộc trò chuyện trực tiếp", error);
          return null;
        }
      },
      acceptDirectRequest: async (conversationId) => {
        try {
          const res = await chatService.acceptDirectRequest(conversationId);
          set((state) => ({
            conversations: state.conversations.map((convo) =>
              convo._id === conversationId
                ? { ...convo, directRequest: res.directRequest }
                : convo
            ),
          }));
        } catch (error) {
          console.error("Lỗi khi chấp nhận yêu cầu tin nhắn", error);
          throw error;
        }
      },
      rejectDirectRequest: async (conversationId) => {
        try {
          await chatService.rejectDirectRequest(conversationId);
          get().removeConversation(conversationId);
        } catch (error) {
          console.error("Lỗi khi từ chối yêu cầu tin nhắn", error);
          throw error;
        }
      },
      clearConversationMessages: async (conversationId) => {
        try {
          const res = await chatService.clearConversationMessages(conversationId);
          if (res.removedConversationId) {
            get().removeConversation(res.removedConversationId);
            return;
          }
          if (res.conversation) {
            get().applyConversationCleared(res.conversation);
          }
        } catch (error) {
          console.error("Lỗi khi xoá toàn bộ tin nhắn cuộc trò chuyện", error);
          throw error;
        }
      },
      toggleBlockConversationUser: async (conversationId) => {
        try {
          const res = await chatService.toggleBlockConversationUser(conversationId);
          get().updateConversation({
            _id: conversationId,
            blockedByMe: res.blockedByMe,
          });
          return res.blockedByMe;
        } catch (error) {
          console.error("Lỗi khi cập nhật trạng thái chặn", error);
          throw error;
        }
      },
      toggleRestrictConversationUser: async (conversationId) => {
        try {
          const res = await chatService.toggleRestrictConversationUser(conversationId);
          get().updateConversation({
            _id: conversationId,
            restrictedByMe: res.restrictedByMe,
          });
          return res.restrictedByMe;
        } catch (error) {
          console.error("Lỗi khi cập nhật trạng thái hạn chế", error);
          throw error;
        }
      },
    }),
    {
      name: "chat-storage",
      partialize: (state) => ({ conversations: state.conversations }),
    }
  )
);
