import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";
import ChatCard from "./ChatCard";
import DirectMessageCard from "./DirectMessageCard";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import type { Conversation } from "@/types/chat";

type DirectMessageListProps = {
  searchQuery?: string;
  unreadOnly?: boolean;
};

const DirectMessageList = ({ searchQuery = "", unreadOnly = false }: DirectMessageListProps) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();
  const { friends, getFriends } = useFriendStore();
  const { conversations, openDirectConversation } = useChatStore();
  const [openingFriendId, setOpeningFriendId] = useState<string | null>(null);

  useEffect(() => {
    getFriends();
  }, [getFriends]);

  const directConversations = useMemo(
    () => conversations.filter((convo) => convo.type === "direct"),
    [conversations]
  );
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const mergedRows = useMemo(() => {
    if (!user?._id) return [];

    const sortedConversations = [...directConversations].sort((a, b) => {
      const aTime = new Date(a.lastMessageAt || a.updatedAt || 0).getTime();
      const bTime = new Date(b.lastMessageAt || b.updatedAt || 0).getTime();
      return bTime - aTime;
    });

    const directConvoByUserId = new Map<string, Conversation>();
    sortedConversations.forEach((convo) => {
      const other = convo.participants.find((p) => p._id !== user._id);
      if (other?._id) {
        directConvoByUserId.set(other._id, convo);
      }
    });

    const friendRows = friends
      .map((friend) => {
        const convo = directConvoByUserId.get(friend._id);
        return {
          key: convo ? `convo-${convo._id}` : `friend-${friend._id}`,
          type: convo ? ("conversation" as const) : ("friend" as const),
          friend,
          convo: convo ?? null,
        };
      })
      .sort((a, b) => {
        if (a.convo && b.convo) {
          const aTime = new Date(a.convo.lastMessageAt || a.convo.updatedAt || 0).getTime();
          const bTime = new Date(b.convo.lastMessageAt || b.convo.updatedAt || 0).getTime();
          return bTime - aTime;
        }
        if (a.convo) return -1;
        if (b.convo) return 1;
        return a.friend.displayName.localeCompare(b.friend.displayName, "vi");
      });

    const remainingConversationRows = sortedConversations
      .filter((convo) => {
        const other = convo.participants.find((p) => p._id !== user._id);
        if (!other?._id) return false;
        return !friends.some((friend) => friend._id === other._id);
      })
      .map((convo) => ({
        key: `convo-${convo._id}`,
        type: "conversation" as const,
        friend: null,
        convo,
      }));

    return [...friendRows, ...remainingConversationRows];
  }, [directConversations, friends, user?._id]);

  const visibleRows = useMemo(() => {
    return mergedRows.filter((row) => {
      if (row.type === "conversation" && row.convo) {
        const other = row.convo.participants.find((p) => p._id !== user?._id);
        const displayName = (other?.displayName || "").toLowerCase();

        const unreadCount = user?._id ? row.convo.unreadCounts?.[user._id] ?? 0 : 0;
        const isIncomingRequest =
          row.convo.directRequest?.status === "pending" &&
          row.convo.directRequest?.responderId === user?._id;

        if (unreadOnly && unreadCount <= 0 && !isIncomingRequest) return false;
        if (!normalizedQuery) return true;
        return displayName.includes(normalizedQuery);
      }

      if (!row.friend) return false;
      if (unreadOnly) return false;
      if (!normalizedQuery) return true;

      const displayName = (row.friend.displayName || "").toLowerCase();
      return displayName.includes(normalizedQuery);
    });
  }, [mergedRows, normalizedQuery, unreadOnly, user?._id]);

  const handleOpenFriendConversation = async (friendId: string) => {
    try {
      setOpeningFriendId(friendId);
      const convoId = await openDirectConversation(friendId);
      if (convoId) {
        navigate("/messages");
      }
    } finally {
      setOpeningFriendId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {visibleRows.map((row) => {
        if (row.type === "conversation" && row.convo) {
          return <DirectMessageCard convo={row.convo} key={row.key} />;
        }

        if (!row.friend) return null;

        const isOpening = openingFriendId === row.friend._id;

        return (
          <ChatCard
            key={row.key}
            convoId={row.friend._id}
            name={row.friend.displayName || row.friend.username}
            isActive={false}
            onSelect={() => handleOpenFriendConversation(row.friend._id)}
            leftSection={
              <div className="relative">
                <UserAvatar
                  type="sidebar"
                  name={row.friend.displayName || row.friend.username}
                  avatarUrl={row.friend.avatarUrl ?? undefined}
                />
                <StatusBadge
                  status={onlineUsers.includes(row.friend._id) ? "online" : "offline"}
                />
              </div>
            }
            subtitle={
              <p className="truncate text-sm text-muted-foreground">
                {isOpening ? "Đang mở cuộc trò chuyện..." : "Nhấn để nhắn tin"}
              </p>
            }
          />
        );
      })}
    </div>
  );
};

export default DirectMessageList;
