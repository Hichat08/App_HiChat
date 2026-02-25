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
import VerifiedBadge from "@/components/ui/verified-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Archive, Ban, EyeOff, MessageCircle, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

const DirectMessageCard = ({
  convo,
}: {
  convo: Conversation;
}) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    activeConversationId,
    setActiveConversation,
    messages,
    fetchMessages,
    clearConversationMessages,
    toggleBlockConversationUser,
    toggleRestrictConversationUser,
    updateConversationArchive,
  } = useChatStore();
  const { onlineUsers } = useSocketStore();

  if (!user) return null;

  const otherUser = convo.participants.find((p) => p._id !== user._id);
  if (!otherUser) return null;
  const displayName = convo.nickname || otherUser.displayName || "";
  const displayNameNode = (
    <span className="inline-flex items-center gap-1">
      {displayName}
      {otherUser.isVerified ? <VerifiedBadge className="h-3.5 w-3.5" /> : null}
    </span>
  );

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

  const handleArchiveConversation = async () => {
    try {
      const nextArchived = !(convo.archived ?? false);
      await updateConversationArchive(convo._id, nextArchived);
      toast.success(nextArchived ? "Đã lưu trữ đoạn chat" : "Đã bỏ lưu trữ");
    } catch (error) {
      console.error("Lỗi khi lưu trữ đoạn chat", error);
      toast.error("Không thể lưu trữ đoạn chat");
    }
  };

  return (
    <ChatCard
      convoId={convo._id}
      name={displayNameNode}
      nameRight={
        convo.streakCount && convo.streakCount > 0
          ? (
              <StreakBadge
                count={convo.streakCount}
                atRisk={!!convo.streakAtRisk}
                recoveryMode={convo.streakRecoveryMode ?? null}
                modeType={convo.streakMode?.type ?? null}
              />
            )
          : convo.streakMode?.status && convo.streakMode.status !== "none"
            ? (
                <StreakBadge
                  count={convo.streakCount ?? 0}
                  atRisk={!!convo.streakAtRisk}
                  recoveryMode={convo.streakRecoveryMode ?? null}
                  modeType={convo.streakMode?.type ?? null}
                  forceVisible
                />
              )
            : null
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
        <div className="relative">
          <UserAvatar
            type="sidebar"
            name={displayName}
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
              onClick={async (e) => {
                e.stopPropagation();
                await handleSelectConversation(convo._id);
              }}
            >
              <MessageCircle className="mr-2 size-4" />
              Vào phần nhắn tin
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleArchiveConversation();
              }}
            >
              <Archive className="mr-2 size-4" />
              {convo.archived ? "Bỏ lưu trữ" : "Lưu trữ đoạn chat"}
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
              onClick={async (e) => {
                e.stopPropagation();
                await handleToggleBlock();
              }}
            >
              <Ban className="mr-2 size-4" />
              {convo.blockedByMe ? "Bỏ chặn" : "Chặn"}
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
