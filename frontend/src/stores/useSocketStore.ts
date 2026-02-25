import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useFriendStore } from "./useFriendStore";
import { toast } from "sonner";
import { useNotificationStore } from "./useNotificationStore";

const baseURL = import.meta.env.VITE_SOCKET_URL;

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  onlineUsers: [],
  connectSocket: () => {
    const accessToken = useAuthStore.getState().accessToken;
    const existingSocket = get().socket;

    if (existingSocket) return; // tránh tạo nhiều socket

    const socket: Socket = io(baseURL, {
      auth: { token: accessToken },
      transports: ["websocket"],
    });

    set({ socket });

    socket.on("connect", () => {
      console.log("Đã kết nối với socket");

      const { user } = useAuthStore.getState();
      const messageAlertsEnabled = user?.notificationSettings?.messageAlerts ?? true;
      if (
        messageAlertsEnabled &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        Notification.requestPermission().catch(() => undefined);
      }
    });

    // online users
    socket.on("online-users", (userIds) => {
      set({ onlineUsers: userIds });
    });

    // new message
    socket.on("new-message", ({ message, conversation, unreadCounts }) => {
      const { user } = useAuthStore.getState();
      const chatState = useChatStore.getState();
      const existingConversation = chatState.conversations.find(
        (c) => c._id === message.conversationId
      );
      const senderParticipant = existingConversation?.participants?.find(
        (p) => p._id === message.senderId
      );

      useChatStore.getState().addMessage(message);

      const lastMessage = {
        _id: conversation.lastMessage._id,
        content: conversation.lastMessage.content,
        createdAt: conversation.lastMessage.createdAt,
        sender: {
          _id: conversation.lastMessage.senderId,
          displayName: senderParticipant?.displayName ?? "",
          avatarUrl: senderParticipant?.avatarUrl ?? null,
        },
      };

      const updatedConversation = {
        ...conversation,
        lastMessage,
        unreadCounts,
      };

      const isOwnMessage = message.senderId === user?._id;
      const messageAlertsEnabled = user?.notificationSettings?.messageAlerts ?? true;
      const isMuted = existingConversation?.muted ?? false;
      const messageSoundEnabled = user?.notificationSettings?.messageSoundEnabled ?? true;

      if (!existingConversation) {
        chatState.fetchConversations();
      }

      if (!isOwnMessage && messageAlertsEnabled && !isMuted) {
        const isActiveConversation = chatState.activeConversationId === message.conversationId;
        const isPageVisible =
          typeof document !== "undefined" ? document.visibilityState === "visible" : false;

        // Avoid noisy alerts while user is already reading that conversation.
        if (!(isActiveConversation && isPageVisible)) {
          const senderName = senderParticipant?.displayName ?? "Người dùng";
          const messagePreview =
            typeof message.content === "string" && message.content.trim().length > 0
              ? message.content
              : message.videoUrl
                ? "Đã gửi một video"
                : message.audioUrl
                  ? "Đã gửi một đoạn âm thanh"
                  : "Đã gửi một hình ảnh";

          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            document.visibilityState !== "visible" &&
            Notification.permission === "granted"
          ) {
            new Notification(`Tin nhắn mới từ ${senderName}`, {
              body: messagePreview,
            });
          }

          toast.info(`Tin nhắn mới từ ${senderName}`, {
            description: messagePreview,
            duration: 15000,
            action: {
              label: "Mở",
              onClick: () => {
                useChatStore.getState().setActiveConversation(message.conversationId);
              },
            },
          });
        }
      }

      if (!isOwnMessage && !isMuted && messageSoundEnabled) {
        try {
          if (typeof window !== "undefined") {
            const AudioContextImpl = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextImpl) {
              const ctx = new AudioContextImpl();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "sine";
              osc.frequency.setValueAtTime(680, ctx.currentTime);
              gain.gain.setValueAtTime(0.0001, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
              gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start();
              osc.stop(ctx.currentTime + 0.2);
              osc.onended = () => ctx.close();
            }
          }
        } catch {
          // ignore sound errors
        }
      }

      if (
        useChatStore.getState().activeConversationId === message.conversationId
      ) {
        useChatStore.getState().markAsSeen();
      }

      useChatStore.getState().updateConversation(updatedConversation);
    });

    // read message
    socket.on("read-message", ({ conversation, lastMessage }) => {
      const updated = {
        _id: conversation._id,
        lastMessage,
        lastMessageAt: conversation.lastMessageAt,
        unreadCounts: conversation.unreadCounts,
        seenBy: conversation.seenBy,
      };

      useChatStore.getState().updateConversation(updated);
    });

    socket.on("messages-delivered", ({ conversationId, messageIds, deliveredAt }) => {
      useChatStore
        .getState()
        .markMessagesDelivered(conversationId, messageIds, deliveredAt);
    });

    socket.on("messages-seen", ({ conversationId, messageIds, seenAt }) => {
      useChatStore.getState().markMessagesSeen(conversationId, messageIds, seenAt);
    });

    // new group chat
    socket.on("new-group", (conversation) => {
      const { user } = useAuthStore.getState();
      const messageAlertsEnabled = user?.notificationSettings?.messageAlerts ?? true;

      useChatStore.getState().addConvo(conversation);
      socket.emit("join-conversation", conversation._id);

      if (messageAlertsEnabled) {
        toast.info("Bạn được thêm vào nhóm mới", {
          description: conversation?.group?.name ?? "Nhóm chat mới",
        });
      }

      useNotificationStore.getState().addNotification({
        id: `group-${conversation?._id ?? Date.now()}`,
        type: "activity",
        title: "Bạn được thêm vào nhóm mới",
        description: conversation?.group?.name ?? "Nhóm chat mới",
        avatarUrl: conversation?.group?.avatarUrl ?? null,
        conversationId: conversation?._id,
      });
    });

    socket.on("group-updated", (conversation) => {
      useChatStore.getState().updateConversation(conversation);
    });

    socket.on("conversation-theme-updated", ({ conversationId, directThemeId }) => {
      if (!conversationId || !directThemeId) return;
      useChatStore.getState().updateConversation({
        _id: conversationId,
        directThemeId,
      });
    });

    socket.on("conversation-e2ee-updated", ({ conversationId, e2eeActive }) => {
      if (!conversationId) return;
      useChatStore.getState().updateConversation({
        _id: conversationId,
        e2eeActive: !!e2eeActive,
      });
    });

    socket.on("direct-request-updated", (payload) => {
      useChatStore.getState().updateConversation(payload);
    });

    socket.on("direct-streak-mode-updated", (payload) => {
      useChatStore.getState().updateConversation(payload);
    });

    socket.on("conversation-removed", ({ conversationId, reason, requesterId }) => {
      if (!conversationId) return;
      const { user } = useAuthStore.getState();
      const isRequester = !!user?._id && user._id === requesterId;

      useChatStore.getState().removeConversation(conversationId);

      if (reason === "direct-request-rejected" && isRequester) {
        toast.warning("Yêu cầu nhắn tin đã bị từ chối. Đoạn chat đã được xóa.");
        useNotificationStore.getState().addNotification({
          id: `conversation-removed-${conversationId}-${Date.now()}`,
          type: "activity",
          title: "Đoạn chat đã bị xóa",
          description: "Yêu cầu nhắn tin của bạn đã bị từ chối.",
          conversationId,
        });
      }
    });

    socket.on("conversation-cleared", ({ conversation, clearedBy }) => {
      if (!conversation?._id) return;

      useChatStore.getState().applyConversationCleared(conversation);

      const { user } = useAuthStore.getState();
      const isSelf = !!user?._id && user._id === clearedBy;

      if (!isSelf) {
        toast.info("Đoạn chat đã được xoá toàn bộ tin nhắn");
      }
    });

    socket.on("conversation-block-updated", ({ conversationId, actorId, targetId, blocked }) => {
      if (!conversationId) return;
      const { user } = useAuthStore.getState();
      if (!user?._id) return;

      const me = user._id;
      if (me === actorId) {
        useChatStore.getState().updateConversation({
          _id: conversationId,
          blockedByMe: !!blocked,
        });
      }

      if (me === targetId) {
        useChatStore.getState().updateConversation({
          _id: conversationId,
          blockedByOther: !!blocked,
        });
      }
    });

    socket.on(
      "conversation-restrict-updated",
      ({ conversationId, actorId, targetId, restricted }) => {
        if (!conversationId) return;
        const { user } = useAuthStore.getState();
        if (!user?._id) return;

        const me = user._id;
        if (me === actorId) {
          useChatStore.getState().updateConversation({
            _id: conversationId,
            restrictedByMe: !!restricted,
          });
        }

        if (me === targetId) {
          useChatStore.getState().updateConversation({
            _id: conversationId,
            restrictedByOther: !!restricted,
          });
        }
      }
    );

    socket.on("friend-request:new", ({ from, message }) => {
      const { user } = useAuthStore.getState();
      const friendAlertsEnabled = user?.notificationSettings?.friendRequestAlerts ?? true;

      useFriendStore.getState().getAllFriendRequests();

      useNotificationStore.getState().addNotification({
        id: `friend-request-new-${from?._id ?? Date.now()}`,
        type: "activity",
        title: `${from?.displayName ?? "Một người dùng"} đã gửi lời mời kết bạn`,
        description:
          typeof message === "string" && message.trim().length > 0
            ? message
            : "Mở mục Lời mời kết bạn để phản hồi.",
        avatarUrl: from?.avatarUrl ?? null,
      });

      if (!friendAlertsEnabled) return;

      toast.info(`${from?.displayName ?? "Một người dùng"} đã gửi lời mời kết bạn`, {
        description:
          typeof message === "string" && message.trim().length > 0
            ? message
            : "Mở mục Lời mời kết bạn để phản hồi.",
      });
    });

    socket.on("friend-request:accepted", ({ by }) => {
      const { user } = useAuthStore.getState();
      const friendAlertsEnabled = user?.notificationSettings?.friendRequestAlerts ?? true;

      useFriendStore.getState().getAllFriendRequests();
      useFriendStore.getState().getFriends();

      useNotificationStore.getState().addNotification({
        id: `friend-accepted-${by?._id ?? Date.now()}`,
        type: "activity",
        title: "Lời mời kết bạn đã được chấp nhận",
        description: by?.displayName ?? "Một người dùng",
        avatarUrl: by?.avatarUrl ?? null,
      });

      if (!friendAlertsEnabled) return;

      toast.success(`${by?.displayName ?? "Một người dùng"} đã chấp nhận lời mời kết bạn`);
    });

    socket.on("friend-request:declined", ({ by }) => {
      const { user } = useAuthStore.getState();
      const friendAlertsEnabled = user?.notificationSettings?.friendRequestAlerts ?? true;

      useFriendStore.getState().getAllFriendRequests();

      useNotificationStore.getState().addNotification({
        id: `friend-declined-${by?._id ?? Date.now()}`,
        type: "activity",
        title: "Lời mời kết bạn bị từ chối",
        description: by?.displayName ?? "Một người dùng",
        avatarUrl: by?.avatarUrl ?? null,
      });

      if (!friendAlertsEnabled) return;

      toast.warning(`${by?.displayName ?? "Một người dùng"} đã từ chối lời mời kết bạn`);
    });

    socket.on("friendship-reset", ({ actorId }) => {
      const { user } = useAuthStore.getState();

      useFriendStore.getState().getFriends();
      useFriendStore.getState().getAllFriendRequests();

      if (user?._id && actorId !== user._id) {
        toast.info("Quan hệ bạn bè đã được đặt lại");
      }
    });

    socket.on("post-activity", ({ id, type, postId, actor, content, createdAt, reactionType }) => {
      const actorName = actor?.displayName ?? "Một người dùng";
      let title = `${actorName} đã tương tác bài viết của bạn`;
      if (type === "like") {
        const reactionLabelMap: Record<string, string> = {
          like: "thích",
          love: "thả tim",
          care: "thả thương thương",
          haha: "thả haha",
          wow: "thả wow",
          sad: "thả buồn",
          angry: "thả phẫn nộ",
        };
        const label = reactionLabelMap[reactionType] ?? "thích";
        title = `${actorName} đã ${label} bài viết của bạn`;
      }
      if (type === "comment") title = `${actorName} đã bình luận bài viết của bạn`;
      if (type === "share") title = `${actorName} đã chia sẻ bài viết của bạn`;

      useNotificationStore.getState().addNotification({
        id: id ?? `post-${type}-${postId}-${Date.now()}`,
        type: "activity",
        title,
        description:
          typeof content === "string" && content.trim().length > 0
            ? content
            : type === "comment"
              ? "Bình luận mới trên bài viết của bạn"
              : "Mở bảng tin để xem chi tiết",
        avatarUrl: actor?.avatarUrl ?? null,
        postId,
        createdAt,
      });
    });

    socket.on("admin-report:new", ({ reportId, reporter, target, reason, detail, createdAt }) => {
      const { user } = useAuthStore.getState();
      const securityAlertsEnabled = user?.notificationSettings?.securityAlerts ?? true;

      const reporterName = reporter?.displayName ?? "Một người dùng";
      const targetName = target?.displayName ?? "một người dùng";
      const title = `Báo cáo mới từ ${reporterName}`;
      const description = `${targetName}: ${reason || "Báo cáo vi phạm"}`;

      useNotificationStore.getState().addNotification({
        id: reportId ?? `admin-report-${Date.now()}`,
        type: "activity",
        title,
        description: detail ? `${description} • ${detail}` : description,
        avatarUrl: reporter?.avatarUrl ?? null,
        createdAt,
      });

      if (securityAlertsEnabled) {
        toast.warning(title, {
          description: detail ? `${description} • ${detail}` : description,
        });
      }
    });

    socket.on(
      "admin-notification",
      ({ type, title, description, createdAt, isLocked, lockReason, lockedAt }) => {
        const { user, setUser } = useAuthStore.getState();
        const securityAlertsEnabled = user?.notificationSettings?.securityAlerts ?? true;

        const fallbackTitle =
          type === "lock"
            ? "Tài khoản đã bị khóa"
            : type === "unlock"
              ? "Tài khoản đã mở khóa"
              : "Cảnh báo từ quản trị viên";

        const safeTitle = title || fallbackTitle;
        const safeDescription = description || "Bạn có thông báo mới từ quản trị viên.";

        useNotificationStore.getState().addNotification({
          id: `admin-${type}-${createdAt || Date.now()}`,
          type: "activity",
          title: safeTitle,
          description: safeDescription,
          createdAt,
        });

        if (typeof isLocked === "boolean") {
          if (user) {
            setUser({
              ...user,
              isLocked,
              lockReason: isLocked ? lockReason || safeDescription : "",
              lockedAt: isLocked ? lockedAt || createdAt || null : null,
            });
          }
        }

        if (type === "lock" || type === "unlock") {
          toast.warning(safeTitle, { description: safeDescription, duration: 15000 });
          return;
        }

        if (securityAlertsEnabled) {
          toast.warning(safeTitle, { description: safeDescription });
        }
      }
    );

    // streak updates (real-time)
    socket.on(
      "streak-updated",
      ({
        conversationId,
        streakCount,
        streakCompletedToday,
        streakAtRisk,
        streakExpiresAt,
        streakRecoveryMode,
        streakLost,
      }) => {
      // update conversation in store if present
        useChatStore.getState().updateConversation({
          _id: conversationId,
          streakCount,
          ...(typeof streakCompletedToday === "boolean"
            ? { streakCompletedToday }
            : {}),
          ...(typeof streakAtRisk === "boolean" ? { streakAtRisk } : {}),
          ...(typeof streakExpiresAt !== "undefined" ? { streakExpiresAt } : {}),
          ...(typeof streakRecoveryMode !== "undefined"
            ? { streakRecoveryMode }
            : {}),
          ...(typeof streakLost === "boolean" ? { streakLost } : {}),
        } as any);

        if (streakLost) {
          toast.error("Chuỗi đã mất và về 0.");
          return;
        }

        if (streakRecoveryMode === "free") {
          toast.warning("Cảnh báo chuỗi: Lần 1 bỏ lỡ, hôm nay khôi phục miễn phí (không cộng).");
        }

        if (streakRecoveryMode === "minus_one") {
          toast.warning("Cảnh báo chuỗi: Lần 2 bỏ lỡ, khôi phục hôm nay sẽ bị trừ 1 chuỗi.");
        }
      }
    );

    socket.on("streak-milestone", ({ milestone, streakCount }) => {
      toast.success(`Chúc mừng! Bạn đã đạt mốc chuỗi ${milestone} (${streakCount}).`);
    });
  },
  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },
}));
