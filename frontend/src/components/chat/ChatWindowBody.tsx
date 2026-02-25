import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import MessageItem from "./MessageItem";
import { useLayoutEffect, useRef } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { useAuthStore } from "@/stores/useAuthStore";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import VerifiedBadge from "@/components/ui/verified-badge";
import { useSocketStore } from "@/stores/useSocketStore";
import { cn } from "@/lib/utils";
import { getLoveStreakTierKey, isLoveStreakMode } from "./loveStreakTheme";

const ChatWindowBody = () => {
  const {
    activeConversationId,
    conversations,
    messages: allMessages,
    fetchMessages,
  } = useChatStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();

  const messages = allMessages[activeConversationId!]?.items ?? [];
  const reversedMessages = [...messages].reverse();
  const hasMore = allMessages[activeConversationId!]?.hasMore ?? false;
  const selectedConvo = conversations.find((c) => c._id === activeConversationId);
  const directOtherUser =
    selectedConvo?.type === "direct"
      ? selectedConvo.participants.find((p) => p._id !== user?._id)
      : null;
  const key = `chat-scroll-${activeConversationId}`;
  const latestOwnMessageId = [...messages]
    .reverse()
    .find((m) => m.senderId === user?._id)?._id;
  const loveStreakActive =
    selectedConvo?.type === "direct"
    && isLoveStreakMode(selectedConvo?.streakMode?.type)
    && (selectedConvo?.streakMode?.status || "none") !== "none";
  const loveTierClass =
    selectedConvo && loveStreakActive
      ? `love-streak-tier-${getLoveStreakTierKey(selectedConvo.streakCount ?? 0)}`
      : "";

  // ref
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFirstMessageIdRef = useRef<string | null>(null);
  const previousLastMessageIdRef = useRef<string | null>(null);

  // kéo xuống dưới khi load convo
  useLayoutEffect(() => {
    if (!messagesEndRef.current) return;

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeConversationId]);

  const fetchMoreMessages = async () => {
    if (!activeConversationId) {
      return;
    }

    try {
      await fetchMessages(activeConversationId);
    } catch (error) {
      console.error("Lỗi xảy ra khi fetch thêm tin", error);
    }
  };

  const handleScrollSave = () => {
    const container = containerRef.current;
    if (!container || !activeConversationId) {
      return;
    }

    sessionStorage.setItem(
      key,
      JSON.stringify({
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
      })
    );
  };

  useLayoutEffect(() => {
    const container = containerRef.current;
    const currentFirstMessageId = messages[0]?._id ?? null;
    const currentLastMessageId = messages[messages.length - 1]?._id ?? null;

    const previousFirstMessageId = previousFirstMessageIdRef.current;
    const previousLastMessageId = previousLastMessageIdRef.current;

    const hasLoadedOlderMessages =
      !!previousFirstMessageId &&
      !!currentFirstMessageId &&
      previousFirstMessageId !== currentFirstMessageId &&
      previousLastMessageId === currentLastMessageId;

    const hasNewLatestMessage =
      !!previousLastMessageId &&
      !!currentLastMessageId &&
      previousLastMessageId !== currentLastMessageId;

    if (hasLoadedOlderMessages && container) {
      const item = sessionStorage.getItem(key);
      if (item) {
        const { scrollTop } = JSON.parse(item);
        requestAnimationFrame(() => {
          container.scrollTop = scrollTop;
        });
      }
    }

    if (hasNewLatestMessage && messagesEndRef.current) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }

    previousFirstMessageIdRef.current = currentFirstMessageId;
    previousLastMessageIdRef.current = currentLastMessageId;
  }, [messages.length]);

  if (!selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  if (!messages?.length) {
    if (selectedConvo.type === "direct" && directOtherUser) {
      const isOnline = onlineUsers.includes(directOtherUser._id);
      return (
        <div
          className="flex h-full flex-col px-4 py-6"
          style={{
            backgroundImage: "var(--direct-chat-bg-image)",
          }}
        >
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className={cn("relative mb-3", loveStreakActive && "love-streak-avatar-wrap", loveTierClass)}>
              <UserAvatar
                type="chat"
                name={directOtherUser.displayName}
                avatarUrl={directOtherUser.avatarUrl ?? undefined}
                className={cn(
                  "size-20 text-3xl sm:size-24 sm:text-4xl",
                  loveStreakActive && "love-streak-avatar-ring"
                )}
              />
              <StatusBadge status={isOnline ? "online" : "offline"} />
            </div>
            <p className="text-2xl sm:text-3xl font-semibold">
              <span className="inline-flex items-center gap-1">
                {directOtherUser.displayName}
                {directOtherUser.isVerified ? <VerifiedBadge /> : null}
              </span>
            </p>
            <p className="mt-1 text-base text-muted-foreground">
              {isOnline ? "Đang hoạt động" : "Đang ngoại tuyến"}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center text-muted-foreground ">
        Chưa có tin nhắn nào trong cuộc trò chuyện này.
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 h-full flex flex-col overflow-hidden">
      <div
        id="scrollableDiv"
        ref={containerRef}
        onScroll={handleScrollSave}
        className="flex flex-col-reverse overflow-y-auto overflow-x-hidden beautiful-scrollbar"
      >
        <div ref={messagesEndRef}></div>
        <InfiniteScroll
          dataLength={messages.length}
          next={fetchMoreMessages}
          hasMore={hasMore}
          scrollableTarget="scrollableDiv"
          loader={<p>Đang tải...</p>}
          inverse={true}
          style={{
            display: "flex",
            flexDirection: "column-reverse",
            overflow: "visible",
          }}
        >
          {reversedMessages.map((message, index) => (
            <MessageItem
              key={message._id ?? index}
              message={message}
              index={index}
              messages={reversedMessages}
              selectedConvo={selectedConvo}
              showStatus={
                selectedConvo.type === "direct" &&
                message._id === latestOwnMessageId
              }
            />
          ))}
        </InfiniteScroll>
      </div>
    </div>
  );
};

export default ChatWindowBody;
