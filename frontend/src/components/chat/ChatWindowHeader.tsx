import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import { SidebarTrigger } from "../ui/sidebar";
import { useAuthStore } from "@/stores/useAuthStore";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useSocketStore } from "@/stores/useSocketStore";
import AddGroupMembersModal from "./AddGroupMembersModal";
import { useNavigate } from "react-router";
import type { Participant } from "@/types/chat";
import GroupMembersDialog from "./GroupMembersDialog";
import GroupAvatarUploader from "./GroupAvatarUploader";
import StreakBadge from "./StreakBadge";
import { Button } from "../ui/button";
import { Minus, Phone, Video, X } from "lucide-react";

const ChatWindowHeader = ({
  chat,
  onStartVoiceCall,
  onStartVideoCall,
}: {
  chat?: Conversation;
  onStartVoiceCall?: (target: Participant) => void;
  onStartVideoCall?: (target: Participant) => void;
}) => {
  const navigate = useNavigate();
  const { conversations, activeConversationId, setActiveConversation } = useChatStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();

  let otherUser: Participant | null = null;

  const handleGoToChatFromMessIcon = () => {
    navigate("/messages");
  };

  chat = chat ?? conversations.find((c) => c._id === activeConversationId);

  if (!chat) {
    return (
      <header className="md:hidden sticky top-0 z-10 flex items-center gap-2 px-4 py-2 w-full">
        <SidebarTrigger
          className="-ml-1 text-foreground"
          onClick={handleGoToChatFromMessIcon}
        />
      </header>
    );
  }

  if (chat.type === "direct") {
    const otherUsers = chat.participants.filter((p) => p._id !== user?._id);
    otherUser = otherUsers.length > 0 ? otherUsers[0] : null;

    if (!user || !otherUser) return;
  }

  const handleOpenProfile = () => {
    if (chat?.type !== "direct" || !otherUser?._id) {
      return;
    }

    navigate(`/users/${otherUser._id}`);
  };

  const handleCloseConversation = () => {
    setActiveConversation(null);
  };

  const handleMinimizeConversation = () => {
    setActiveConversation(null);
    navigate("/messages");
  };

  const handleCloseChatWindow = () => {
    setActiveConversation(null);
    navigate("/");
  };

  const isGroupOwner =
    chat.type === "group" &&
    !!user &&
    chat.group?.createdBy?.toString() === user._id.toString();

  const handleStartVoiceCall = () => {
    if (chat?.type !== "direct" || !otherUser || !onStartVoiceCall) return;
    onStartVoiceCall(otherUser);
  };

  const handleStartVideoCall = () => {
    if (chat?.type !== "direct" || !otherUser || !onStartVideoCall) return;
    onStartVideoCall(otherUser);
  };

  return (
    <header className="sticky top-0 z-10 border-b bg-background px-2 py-2 sm:px-3">
      <div className="flex w-full items-center gap-2">
        <SidebarTrigger
          className="-ml-1 text-foreground"
          onClick={handleGoToChatFromMessIcon}
        />

        <div className="flex w-full items-center justify-between gap-2">
          {chat.type === "direct" ? (
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 rounded-lg p-1 text-left hover:bg-muted/50"
              onClick={handleOpenProfile}
            >
              <div className="relative">
                <UserAvatar
                  type={"sidebar"}
                  name={otherUser?.displayName || "HiChat"}
                  avatarUrl={otherUser?.avatarUrl || undefined}
                />
                <StatusBadge
                  status={
                    onlineUsers.includes(otherUser?._id ?? "")
                      ? "online"
                      : "offline"
                  }
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="truncate text-xl font-semibold leading-none">
                    {otherUser?.displayName}
                  </p>
                  {chat.streakCount && chat.streakCount > 0 && (
                    <StreakBadge
                      count={chat.streakCount}
                      atRisk={!!chat.streakAtRisk}
                      recoveryMode={chat.streakRecoveryMode ?? null}
                    />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {onlineUsers.includes(otherUser?._id ?? "")
                    ? "Đang hoạt động"
                    : "Đang ngoại tuyến"}
                </p>
              </div>
            </button>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative">
                <GroupChatAvatar
                  participants={chat.participants}
                  type="sidebar"
                  groupAvatarUrl={chat.group?.avatarUrl}
                  groupName={chat.group?.name}
                />
                {isGroupOwner && <GroupAvatarUploader chat={chat} />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="truncate text-base font-semibold">
                    {chat.group?.name}
                  </p>
                  {chat.streakCount && chat.streakCount > 0 && (
                    <StreakBadge
                      count={chat.streakCount}
                      atRisk={!!chat.streakAtRisk}
                      recoveryMode={chat.streakRecoveryMode ?? null}
                    />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <GroupMembersDialog chat={chat} />
                  <AddGroupMembersModal chat={chat} />
                </div>
              </div>
            </div>
          )}

          {chat.type === "direct" && (
            <div className="flex items-center gap-0.5 text-primary">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary hover:bg-primary/10 hover:text-primary"
                onClick={handleStartVoiceCall}
                title="Gọi thường"
              >
                <Phone className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary hover:bg-primary/10 hover:text-primary"
                onClick={handleStartVideoCall}
                title="Gọi video"
              >
                <Video className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary hover:bg-primary/10 hover:text-primary"
                onClick={handleMinimizeConversation}
              >
                <Minus className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary hover:bg-primary/10 hover:text-primary"
                onClick={handleCloseChatWindow}
              >
                <X className="size-5" />
              </Button>
            </div>
          )}
          {chat.type === "group" && (
            <div className="flex items-center gap-1 text-primary">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary hover:bg-primary/10 hover:text-primary"
                onClick={handleCloseConversation}
              >
                <X className="size-5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default ChatWindowHeader;
