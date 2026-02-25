import { useMemo } from "react";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import DirectMessageCard from "./DirectMessageCard";
import GroupChatCard from "./GroupChatCard";

type AllChatListProps = {
  searchQuery?: string;
  unreadOnly?: boolean;
};

const AllChatList = ({ searchQuery = "", unreadOnly = false }: AllChatListProps) => {
  const { conversations } = useChatStore();
  const { user } = useAuthStore();

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const visibleConversations = useMemo(() => {
    const list = conversations.filter((convo) => {
      if (convo.archived) return false;
      if (unreadOnly && user?._id) {
        const unreadCount = convo.unreadCounts?.[user._id] ?? 0;
        if (unreadCount <= 0) return false;
      }

      if (!normalizedQuery) return true;

      if (convo.type === "group") {
        const groupName = (convo.nickname || convo.group?.name || "").toLowerCase();
        return groupName.includes(normalizedQuery);
      }

      const other = convo.participants.find((p) => p._id !== user?._id);
      const displayName = (convo.nickname || other?.displayName || "").toLowerCase();
      return displayName.includes(normalizedQuery);
    });

    return list.sort((a, b) => {
      const aTime = new Date(a.lastMessageAt || a.updatedAt || 0).getTime();
      const bTime = new Date(b.lastMessageAt || b.updatedAt || 0).getTime();
      return bTime - aTime;
    });
  }, [conversations, normalizedQuery, unreadOnly, user?._id]);

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {visibleConversations.map((convo) =>
        convo.type === "group" ? (
          <GroupChatCard
            convo={convo}
            key={convo._id}
          />
        ) : (
          <DirectMessageCard
            convo={convo}
            key={convo._id}
          />
        )
      )}
    </div>
  );
};

export default AllChatList;
