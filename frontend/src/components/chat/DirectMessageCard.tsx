import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { cn } from "@/lib/utils";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import UnreadCountBadge from "./UnreadCountBadge";
import { useSocketStore } from "@/stores/useSocketStore";
import { useNavigate } from "react-router";
import StreakBadge from "./StreakBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Ban,
  BellOff,
  CircleUserRound,
  EyeOff,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const DirectMessageCard = ({ convo }: { convo: Conversation }) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    activeConversationId,
    setActiveConversation,
    messages,
    fetchMessages,
    updateConversation,
    clearConversationMessages,
    toggleBlockConversationUser,
    toggleRestrictConversationUser,
  } = useChatStore();
  const { onlineUsers } = useSocketStore();

  if (!user) return null;

  const otherUser = convo.participants.find((p) => p._id !== user._id);
  if (!otherUser) return null;

  const unreadCount = convo.unreadCounts[user._id];
  const pendingStatus = convo.directRequest?.status;

  let lastMessage = convo.lastMessage?.content ?? "";
  if (pendingStatus === "pending") {
    if (convo.directRequest?.responderId === user._id) {
      lastMessage = "Yêu cầu tin nhắn mới";
    } else if ((convo.directRequest?.requesterMessageCount ?? 0) >= 3) {
      lastMessage = "Đã gửi tối đa 3 tin, chờ chấp nhận";
    } else {
      lastMessage = `Tin nhắn làm quen: ${convo.directRequest?.requesterMessageCount ?? 0}/3`;
    }
  } else if (pendingStatus === "rejected") {
    lastMessage = "Yêu cầu đã bị từ chối";
  }

  const handleSelectConversation = async (id: string) => {
    setActiveConversation(id);
    if (!messages[id]) {
      await fetchMessages(id);
    }
    navigate("/messages");
  };

  const handleMarkAsUnread = () => {
    if (!user?._id) return;
    const unread = convo.unreadCounts?.[user._id] ?? 0;
    updateConversation({
      _id: convo._id,
      unreadCounts: {
        ...convo.unreadCounts,
        [user._id]: unread > 0 ? unread : 1,
      },
    });
    toast.success("Đã đánh dấu là chưa đọc");
  };

  const handleClearConversation = async () => {
    const confirmed = window.confirm(
      "Bạn muốn xoá chat này? Hệ thống sẽ xoá toàn bộ tin nhắn và tự hủy kết bạn giữa hai bên."
    );
    if (!confirmed) return;

    try {
      await clearConversationMessages(convo._id);
      toast.success("Đã xoá chat và đặt lại quan hệ hai bên");
    } catch (error) {
      console.error("Lỗi khi xoá đoạn chat", error);
      toast.error("Không thể xoá đoạn chat");
    }
  };

  const handleToggleBlock = async () => {
    try {
      const nextBlocked = await toggleBlockConversationUser(convo._id);
      toast.success(nextBlocked ? "Đã chặn người dùng" : "Đã bỏ chặn người dùng");
    } catch (error) {
      console.error("Lỗi khi chặn/bỏ chặn", error);
      toast.error("Không thể cập nhật trạng thái chặn");
    }
  };

  const handleToggleRestrict = async () => {
    try {
      const nextRestricted = await toggleRestrictConversationUser(convo._id);
      toast.success(nextRestricted ? "Đã hạn chế người dùng" : "Đã bỏ hạn chế người dùng");
    } catch (error) {
      console.error("Lỗi khi hạn chế/bỏ hạn chế", error);
      toast.error("Không thể cập nhật trạng thái hạn chế");
    }
  };

  return (
    <ChatCard
      convoId={convo._id}
      name={otherUser.displayName ?? ""}
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
          <div className="relative">
            <UserAvatar
              type="sidebar"
              name={otherUser.displayName ?? ""}
              avatarUrl={otherUser.avatarUrl ?? undefined}
            />
            <StatusBadge
              status={
                onlineUsers.includes(otherUser?._id ?? "")
                  ? "online"
                  : "offline"
              }
            />
            {unreadCount > 0 && <UnreadCountBadge unreadCount={unreadCount} />}
          </div>
        </>
      }
      subtitle={
        <p
          className={cn(
            "text-sm truncate",
            unreadCount > 0
              ? "font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {lastMessage}
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
                handleMarkAsUnread();
              }}
            >
              Đánh dấu là chưa đọc
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleSelectConversation(convo._id);
              }}
            >
              Mở phần nhắn tin
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                toast.info("Đã tắt thông báo cuộc trò chuyện");
              }}
            >
              <BellOff className="mr-2 size-4" />
              Tắt thông báo
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/users/${otherUser._id}`);
              }}
            >
              <CircleUserRound className="mr-2 size-4" />
              Xem trang cá nhân
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async (e) => {
                e.stopPropagation();
                await handleToggleBlock();
              }}
            >
              <Ban className="mr-2 size-4" />
              {convo.blockedByMe ? "Bỏ chặn" : "Chặn"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async (e) => {
                e.stopPropagation();
                await handleToggleRestrict();
              }}
            >
              <EyeOff className="mr-2 size-4" />
              {convo.restrictedByMe ? "Bỏ hạn chế" : "Hạn chế"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={async (e) => {
                e.stopPropagation();
                await handleClearConversation();
              }}
            >
              <Trash2 className="mr-2 size-4" />
              Xoá chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );
};

export default DirectMessageCard;
