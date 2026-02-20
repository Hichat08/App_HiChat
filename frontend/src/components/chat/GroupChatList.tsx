import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import GroupChatCard from "./GroupChatCard";

type GroupChatListProps = {
  searchQuery?: string;
  unreadOnly?: boolean;
};

const GroupChatList = ({ searchQuery = "", unreadOnly = false }: GroupChatListProps) => {
  const { user } = useAuthStore();
  const { conversations } = useChatStore();

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const groupchats = conversations.filter((convo) => {
    if (convo.type !== "group") return false;

    const groupName = (convo.group?.name || "").toLowerCase();
    if (normalizedQuery && !groupName.includes(normalizedQuery)) return false;

    if (!unreadOnly) return true;
    const unreadCount = user?._id ? convo.unreadCounts?.[user._id] ?? 0 : 0;
    return unreadCount > 0;
  });

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {groupchats.map((convo) => (
        <GroupChatCard
          convo={convo}
          key={convo._id}
        />
      ))}
    </div>
  );
};

export default GroupChatList;
