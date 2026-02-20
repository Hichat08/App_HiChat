import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";
import UnreadCountBadge from "./UnreadCountBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useNavigate } from "react-router";
import StreakBadge from "./StreakBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Archive, LogOut, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

const GroupChatCard = ({ convo }: { convo: Conversation }) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    activeConversationId,
    setActiveConversation,
    messages,
    fetchMessages,
    removeConversation,
  } = useChatStore();

  if (!user) return null;

  const unreadCount = convo.unreadCounts[user._id];
  const name = convo.group?.name ?? "";
  const handleSelectConversation = async (id: string) => {
    setActiveConversation(id);
    if (!messages[id]) {
      await fetchMessages(id);
    }
    navigate("/messages");
  };

  const handleDeleteChat = () => {
    removeConversation(convo._id);
    toast.success("Đã xóa cuộc trò chuyện khỏi danh sách của bạn");
  };

  const handleArchiveChat = () => {
    removeConversation(convo._id);
    toast.success("Đã lưu trữ đoạn chat");
  };

  const handleLeaveGroup = () => {
    const confirmed = window.confirm(
      `Bạn có chắc muốn rời nhóm "${name}"?`
    );
    if (!confirmed) return;

    removeConversation(convo._id);
    toast.success("Bạn đã rời nhóm chat");
  };

  return (
    <ChatCard
      convoId={convo._id}
      name={name}
      nameRight={
        convo.streakCount && convo.streakCount > 0 ? (
          <StreakBadge
            count={convo.streakCount}
            atRisk={!!convo.streakAtRisk}
            recoveryMode={convo.streakRecoveryMode ?? null}
          />
        ) : null
      }
      timestamp={
        convo.lastMessage?.createdAt
          ? new Date(convo.lastMessage.createdAt)
          : undefined
      }
      isActive={activeConversationId === convo._id}
      onSelect={handleSelectConversation}
      unreadCount={unreadCount}
      leftSection={
        <>
          {unreadCount > 0 && <UnreadCountBadge unreadCount={unreadCount} />}
          <GroupChatAvatar
            participants={convo.participants}
            type="chat"
            groupAvatarUrl={convo.group?.avatarUrl}
            groupName={convo.group?.name}
          />
        </>
      }
      subtitle={
        <p className="text-sm truncate text-muted-foreground">
          {convo.participants.length} thành viên
        </p>
      }
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-smooth hover:bg-muted group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteChat();
              }}
            >
              <Trash2 className="mr-2 size-4" />
              Xóa chat
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleArchiveChat();
              }}
            >
              <Archive className="mr-2 size-4" />
              Lưu trữ đoạn chat
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleLeaveGroup();
              }}
            >
              <LogOut className="mr-2 size-4" />
              Thoát nhóm chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );
};

export default GroupChatCard;
