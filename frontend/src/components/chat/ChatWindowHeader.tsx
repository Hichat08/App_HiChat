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
import VerifiedBadge from "@/components/ui/verified-badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import {
  AlertTriangle,
  Archive,
  Ban,
  BellOff,
  ChevronRight,
  CircleUserRound,
  EyeOff,
  HeartHandshake,
  ImageIcon,
  Lock,
  LogOut,
  MessageCircle,
  Minus,
  Palette,
  Pencil,
  PencilLine,
  Phone,
  ThumbsUp,
  Trash2,
  UsersRound,
  UserRoundPlus,
  Video,
  X,
} from "lucide-react";
import { userService } from "@/services/userService";
import { chatService } from "@/services/chatService";
import { toast } from "sonner";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  CHAT_PALETTES,
  QUICK_REACTIONS,
  useChatAppearanceStore,
} from "@/stores/useChatAppearanceStore";
import { cn } from "@/lib/utils";
import { getLoveStreakTierKey, isLoveStreakMode } from "./loveStreakTheme";

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
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    clearConversationMessages,
    toggleBlockConversationUser,
    toggleRestrictConversationUser,
    createConversation,
    updateConversation,
    removeConversation,
    updateConversationNickname,
    updateConversationMute,
    updateConversationReadReceipt,
    updateConversationArchive,
    updateConversationE2EE,
    reportConversation,
    updateConversationTheme,
  } = useChatStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();
  const {
    quickReaction,
    setQuickReaction,
  } = useChatAppearanceStore();
  const [sendingDatingRequest, setSendingDatingRequest] = useState(false);
  const [datingDialogOpen, setDatingDialogOpen] = useState(false);
  const [chatColorDialogOpen, setChatColorDialogOpen] = useState(false);
  const [chatColorDraftId, setChatColorDraftId] = useState("violet");
  const [quickReactionDialogOpen, setQuickReactionDialogOpen] = useState(false);
  const [nicknameDialogOpen, setNicknameDialogOpen] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [groupAvatarDialogOpen, setGroupAvatarDialogOpen] = useState(false);
  const [groupAvatarUploading, setGroupAvatarUploading] = useState(false);
  const [groupAvatarFile, setGroupAvatarFile] = useState<File | null>(null);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState("");
  const [groupNicknameDialogOpen, setGroupNicknameDialogOpen] = useState(false);
  const [groupNicknameDraft, setGroupNicknameDraft] = useState("");
  const [groupMembersOpen, setGroupMembersOpen] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetail, setReportDetail] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

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

  const otherDisplayName =
    chat.type === "direct"
      ? (chat.nickname || otherUser?.displayName || "HiChat")
      : "";
  const groupDisplayName =
    chat.type === "group"
      ? (chat.nickname || chat.group?.name || "Nhóm chat")
      : "";

  const handleOpenProfile = () => {
    if (chat?.type !== "direct" || !otherUser?._id) {
      return;
    }

    navigate(`/users/${otherUser._id}`);
  };

  const handleClearConversation = async () => {
    if (chat?.type !== "direct") return;
    const confirmed = window.confirm(
      "Bạn muốn xoá chat này? Hệ thống sẽ xoá toàn bộ tin nhắn và tự hủy kết bạn giữa hai bên."
    );
    if (!confirmed) return;

    try {
      await clearConversationMessages(chat._id);
      toast.success("Đã xoá chat và đặt lại quan hệ hai bên");
    } catch (error) {
      console.error("Lỗi khi xoá đoạn chat", error);
      toast.error("Không thể xoá đoạn chat");
    }
  };

  const handleToggleBlock = async () => {
    if (chat?.type !== "direct") return;
    try {
      const nextBlocked = await toggleBlockConversationUser(chat._id);
      toast.success(nextBlocked ? "Đã chặn người dùng" : "Đã bỏ chặn người dùng");
    } catch (error) {
      console.error("Lỗi khi chặn/bỏ chặn", error);
      toast.error("Không thể cập nhật trạng thái chặn");
    }
  };

  const handleToggleRestrict = async () => {
    if (chat?.type !== "direct") return;
    try {
      const nextRestricted = await toggleRestrictConversationUser(chat._id);
      toast.success(nextRestricted ? "Đã hạn chế người dùng" : "Đã bỏ hạn chế người dùng");
    } catch (error) {
      console.error("Lỗi khi hạn chế/bỏ hạn chế", error);
      toast.error("Không thể cập nhật trạng thái hạn chế");
    }
  };

  const handleMessengerOpen = () => {
    navigate("/messages");
  };

  const handleCreateGroupFromDirect = () => {
    if (chat?.type !== "direct" || !otherUser?._id || !user?._id) return;
    const groupName = `Nhóm của ${user.displayName} & ${otherDisplayName}`;
    createConversation("group", groupName, [otherUser._id])
      .then((convoId) => {
        if (convoId) {
          navigate("/messages");
          toast.success("Đã tạo nhóm mới");
        }
      })
      .catch((error) => {
        console.error("Lỗi khi tạo nhóm từ chat 1-1", error);
        toast.error("Không thể tạo nhóm");
      });
  };

  const handleSetNickname = () => {
    if (chat?.type !== "direct" || !otherUser?._id) return;
    setNicknameDraft(chat.nickname || otherUser.displayName || "");
    setNicknameDialogOpen(true);
  };

  const handleStartEncryptedChat = () => {
    if (chat?.type !== "direct") return;
    const nextEnabled = !(chat.e2eeEnabled ?? false);
    updateConversationE2EE(chat._id, nextEnabled)
      .then(() => {
        toast.success(nextEnabled ? "Đã bật mã hóa đầu cuối" : "Đã tắt mã hóa đầu cuối");
      })
      .catch((error) => {
        console.error("Lỗi khi cập nhật mã hóa đầu cuối", error);
        toast.error("Không thể cập nhật mã hóa đầu cuối");
      });
  };

  const handleToggleMute = () => {
    if (!chat?._id) return;
    const nextMuted = !(chat.muted ?? false);
    updateConversationMute(chat._id, nextMuted)
      .then(() => {
        toast.success(nextMuted ? "Đã tắt thông báo" : "Đã bật lại thông báo");
      })
      .catch((error) => {
        console.error("Lỗi khi cập nhật tắt thông báo", error);
        toast.error("Không thể cập nhật tắt thông báo");
      });
  };

  const handleArchiveConversation = () => {
    if (!chat?._id) return;
    const nextArchived = !(chat.archived ?? false);
    updateConversationArchive(chat._id, nextArchived)
      .then(() => {
        toast.success(nextArchived ? "Đã lưu trữ đoạn chat" : "Đã bỏ lưu trữ");
        if (nextArchived) {
          setActiveConversation(null);
          navigate("/messages");
        }
      })
      .catch((error) => {
        console.error("Lỗi khi lưu trữ đoạn chat", error);
        toast.error("Không thể lưu trữ đoạn chat");
      });
  };

  const handleRemoveGroupChat = () => {
    if (chat?.type !== "group") return;
    removeConversation(chat._id);
    toast.success("Đã xóa đoạn chat khỏi danh sách");
    if (activeConversationId === chat._id) {
      setActiveConversation(null);
      navigate("/messages");
    }
  };

  const handleReportConversation = () => {
    if (!chat?._id) return;
    setReportReason("");
    setReportDetail("");
    setReportDialogOpen(true);
  };

  const handleOpenGroupRename = () => {
    if (chat?.type !== "group") return;
    setRenameDraft(chat.group?.name || "");
    setRenameDialogOpen(true);
  };

  const handleSubmitGroupRename = async () => {
    if (chat?.type !== "group") return;
    const cleaned = renameDraft.trim();
    if (!cleaned) return;
    try {
      const updated = await chatService.updateGroupName(chat._id, cleaned);
      updateConversation({ _id: chat._id, ...updated });
      toast.success("Đã cập nhật tên nhóm");
      setRenameDialogOpen(false);
    } catch (error: any) {
      console.error("Lỗi khi đổi tên nhóm", error);
      toast.error(error?.response?.data?.message || "Không thể đổi tên nhóm");
    }
  };

  const handleSubmitGroupNickname = async () => {
    if (chat?.type !== "group") return;
    const cleaned = groupNicknameDraft.trim();
    try {
      const res = await chatService.updateGroupNickname(chat._id, cleaned);
      updateConversation({
        _id: chat._id,
        nicknames: res.nicknames,
        nickname: cleaned,
      });
      toast.success(cleaned ? "Đã cập nhật biệt danh nhóm" : "Đã xoá biệt danh nhóm");
      setGroupNicknameDialogOpen(false);
    } catch (error: any) {
      console.error("Lỗi khi cập nhật biệt danh nhóm", error);
      toast.error(error?.response?.data?.message || "Không thể cập nhật biệt danh nhóm");
    }
  };

  const handleSubmitGroupAvatar = async () => {
    if (chat?.type !== "group" || !groupAvatarFile) return;
    try {
      setGroupAvatarUploading(true);
      const formData = new FormData();
      formData.append("file", groupAvatarFile);
      const updated = await chatService.updateGroupAvatar(chat._id, formData);
      updateConversation({ _id: chat._id, ...updated });
      toast.success("Đã cập nhật ảnh nhóm");
      setGroupAvatarDialogOpen(false);
      setGroupAvatarFile(null);
      setGroupAvatarPreview("");
    } catch (error: any) {
      console.error("Lỗi khi đổi ảnh nhóm", error);
      toast.error(error?.response?.data?.message || "Không thể cập nhật ảnh nhóm");
    } finally {
      setGroupAvatarUploading(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (chat?.type !== "group") return;
    const confirmed = window.confirm(`Bạn có chắc muốn rời nhóm "${groupDisplayName}"?`);
    if (!confirmed) return;
    try {
      const res = await chatService.leaveGroup(chat._id);
      removeConversation(chat._id);
      setActiveConversation(null);
      navigate("/messages");
      toast.success("Bạn đã rời nhóm");
      if (res?.conversation) {
        updateConversation({ _id: chat._id, ...res.conversation });
      }
    } catch (error: any) {
      console.error("Lỗi khi rời nhóm", error);
      toast.error(error?.response?.data?.message || "Không thể rời nhóm");
    }
  };

  const directThemeId = chat.type === "direct" ? (chat.directThemeId || "violet") : "violet";
  const selectedDraftPalette =
    CHAT_PALETTES.find((palette) => palette.id === chatColorDraftId) || CHAT_PALETTES[0];

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

  const handleDatingSuggestion = async () => {
    if (chat?.type !== "direct" || !otherUser?._id || !user?._id) return;
    if (sendingDatingRequest) return;

    if (user.relationshipStatus === "in_relationship" || user.relationshipPartner?._id) {
      toast.info("Bạn đang trong mối quan hệ, không thể gửi thêm lời mời hẹn hò.");
      return;
    }

    try {
      setSendingDatingRequest(true);
      const result = await userService.sendRelationshipRequest(otherUser._id);
      toast.success(result?.message || "Đã gửi gợi ý hẹn hò.");
      setDatingDialogOpen(false);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể gửi gợi ý hẹn hò.");
    } finally {
      setSendingDatingRequest(false);
    }
  };

  const renderDirectMenuContent = () => (
    <DropdownMenuContent align="start" className="max-h-[72vh] w-[320px] overflow-y-auto rounded-2xl">
      <DropdownMenuItem onClick={handleMessengerOpen}>
        <MessageCircle className="mr-2 size-4" />
        Mở trong Messenger
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleOpenProfile}>
        <CircleUserRound className="mr-2 size-4" />
        Xem trang cá nhân
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => setChatColorDialogOpen(true)}>
        <Palette className="mr-2 size-4" />
        Đổi chủ đề
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setQuickReactionDialogOpen(true)}>
        <ThumbsUp className="mr-2 size-4" />
        Biểu tượng cảm xúc
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => {
        setGroupNicknameDraft(chat.nickname || "");
        setGroupNicknameDialogOpen(true);
      }}>
        <Pencil className="mr-2 size-4" />
        Biệt danh
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleCreateGroupFromDirect}>
        <UserRoundPlus className="mr-2 size-4" />
        Tạo nhóm
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleStartEncryptedChat}>
        <Lock className="mr-2 size-4" />
        {chat.e2eeEnabled ? "Tắt mã hóa đầu cuối" : "Bắt đầu đoạn chat mã hóa đầu cuối"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleToggleMute}>
        <BellOff className="mr-2 size-4" />
        {chat.muted ? "Bật thông báo" : "Tắt thông báo"}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleToggleBlock}>
        <Ban className="mr-2 size-4" />
        {chat?.blockedByMe ? "Bỏ chặn" : "Chặn"}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleToggleRestrict}>
        <EyeOff className="mr-2 size-4" />
        {chat?.restrictedByMe ? "Bỏ hạn chế" : "Hạn chế"}
      </DropdownMenuItem>
      <DropdownMenuItem className="items-start" onClick={() => {
        if (chat.type !== "direct" && chat.type !== "group") return;
        updateConversationReadReceipt(chat._id, !(chat.readReceiptEnabled ?? true))
          .then(() => {
            const next = !(chat.readReceiptEnabled ?? true);
            toast.success(next ? "Đã bật thông báo đã đọc" : "Đã tắt thông báo đã đọc");
          })
          .catch((error) => {
            console.error("Lỗi khi cập nhật thông báo đã đọc", error);
            toast.error("Không thể cập nhật thông báo đã đọc");
          });
      }}>
        <EyeOff className="mr-2 mt-0.5 size-4" />
        <div className="flex w-full items-start justify-between gap-2">
          <div className="space-y-0.5">
            <p>Thông báo đã đọc</p>
            <p className="text-xs text-muted-foreground">
              {chat.readReceiptEnabled ?? true ? "Bật" : "Tắt"}
            </p>
          </div>
          <ChevronRight className="mt-0.5 size-4 text-muted-foreground" />
        </div>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleArchiveConversation}>
        <Archive className="mr-2 size-4" />
        {chat.archived ? "Bỏ lưu trữ" : "Lưu trữ đoạn chat"}
      </DropdownMenuItem>
      <DropdownMenuItem
        className="text-destructive focus:text-destructive"
        onClick={handleRemoveGroupChat}
      >
        <Trash2 className="mr-2 size-4" />
        Xoá chat
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleReportConversation}>
        <AlertTriangle className="mr-2 size-4" />
        Báo cáo
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  const renderGroupMenuContent = () => (
    <DropdownMenuContent align="start" className="max-h-[72vh] w-[320px] overflow-y-auto rounded-2xl">
      <DropdownMenuItem onClick={handleMessengerOpen}>
        <MessageCircle className="mr-2 size-4" />
        Mở trong Messenger
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => setChatColorDialogOpen(true)}>
        <Palette className="mr-2 size-4" />
        Đổi chủ đề
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setQuickReactionDialogOpen(true)}>
        <ThumbsUp className="mr-2 size-4" />
        Biểu tượng cảm xúc
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleSetNickname}>
        <Pencil className="mr-2 size-4" />
        Biệt danh
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleOpenGroupRename}>
        <PencilLine className="mr-2 size-4" />
        Tên cuộc trò chuyện
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setGroupAvatarDialogOpen(true)}>
        <ImageIcon className="mr-2 size-4" />
        Thay đổi ảnh
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => setGroupMembersOpen(true)}>
        <UsersRound className="mr-2 size-4" />
        Thành viên
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setAddMembersOpen(true)}>
        <UserRoundPlus className="mr-2 size-4" />
        Thêm người
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleLeaveGroup}>
        <LogOut className="mr-2 size-4" />
        Rời nhóm
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleToggleMute}>
        <BellOff className="mr-2 size-4" />
        {chat.muted ? "Bật thông báo" : "Tắt thông báo"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleArchiveConversation}>
        <Archive className="mr-2 size-4" />
        {chat.archived ? "Bỏ lưu trữ" : "Lưu trữ đoạn chat"}
      </DropdownMenuItem>
      <DropdownMenuItem
        className="text-destructive focus:text-destructive"
        onClick={handleRemoveGroupChat}
      >
        <Trash2 className="mr-2 size-4" />
        Xoá chat
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleReportConversation}>
        <AlertTriangle className="mr-2 size-4" />
        Báo cáo
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  const isDirectThemed = chat.type === "direct";
  const loveStreakActive =
    chat.type === "direct"
    && isLoveStreakMode(chat.streakMode?.type)
    && (chat.streakMode?.status || "none") !== "none";
  const loveStreakCount = chat.streakCount ?? 0;
  const loveStreakTier = getLoveStreakTierKey(loveStreakCount);
  const loveTierClass = loveStreakActive ? `love-streak-tier-${loveStreakTier}` : "";

  return (
    <header
      className={`sticky top-0 z-10 px-2 py-2 sm:px-3 ${
        isDirectThemed
          ? "border-b border-[color:var(--direct-chat-header-border)] bg-[var(--direct-chat-header-bg)]"
          : "border-b bg-background"
      }`}
    >
      <div className="flex w-full items-center gap-2">
        <SidebarTrigger
          className="-ml-1 text-foreground"
          onClick={handleGoToChatFromMessIcon}
        />

        <div className="flex w-full items-center justify-between gap-2">
          {chat.type === "direct" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  role="button"
                  tabIndex={0}
                  className="flex min-w-0 items-center gap-2 rounded-lg p-1 text-left hover:bg-muted/50"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                    }
                  }}
                >
                  <div className={cn("relative", loveStreakActive && "love-streak-avatar-wrap", loveTierClass)}>
                    <UserAvatar
                      type={"sidebar"}
                      name={otherDisplayName || "HiChat"}
                      avatarUrl={otherUser?.avatarUrl || undefined}
                      className={cn(loveStreakActive && "love-streak-avatar-ring")}
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
                        <span className="inline-flex items-center gap-1">
                          {otherDisplayName}
                          {otherUser?.isVerified ? <VerifiedBadge /> : null}
                        </span>
                      </p>
                      {(chat.streakCount && chat.streakCount > 0)
                        || (chat.streakMode?.status && chat.streakMode.status !== "none") ? (
                        <StreakBadge
                          count={chat.streakCount ?? 0}
                          atRisk={!!chat.streakAtRisk}
                          recoveryMode={chat.streakRecoveryMode ?? null}
                          modeType={chat.streakMode?.type ?? null}
                          forceVisible
                        />
                      ) : null}
                    </div>
                    <p className="text-sm" style={isDirectThemed ? { color: "var(--direct-chat-text-muted)" } : undefined}>
                      {onlineUsers.includes(otherUser?._id ?? "")
                        ? "Đang hoạt động"
                        : "Đang ngoại tuyến"}
                    </p>
                  </div>
                </div>
              </DropdownMenuTrigger>
              {renderDirectMenuContent()}
            </DropdownMenu>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  role="button"
                  tabIndex={0}
                  className="flex min-w-0 items-center gap-2 rounded-lg p-1 text-left hover:bg-muted/50"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                    }
                  }}
                >
                  <div className="relative">
                    <GroupChatAvatar
                      participants={chat.participants}
                      type="sidebar"
                      groupAvatarUrl={chat.group?.avatarUrl}
                      groupName={groupDisplayName}
                    />
                    {isGroupOwner && <GroupAvatarUploader chat={chat} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="truncate text-base font-semibold">
                        {groupDisplayName}
                      </p>
                      {(chat.streakCount && chat.streakCount > 0)
                        || (chat.streakMode?.status && chat.streakMode.status !== "none") ? (
                        <StreakBadge
                          count={chat.streakCount ?? 0}
                          atRisk={!!chat.streakAtRisk}
                          recoveryMode={chat.streakRecoveryMode ?? null}
                          forceVisible
                        />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <GroupMembersDialog
                        chat={chat}
                        open={groupMembersOpen}
                        onOpenChange={setGroupMembersOpen}
                      />
                      <AddGroupMembersModal
                        chat={chat}
                        open={addMembersOpen}
                        onOpenChange={setAddMembersOpen}
                      />
                    </div>
                  </div>
                </div>
              </DropdownMenuTrigger>
              {renderGroupMenuContent()}
            </DropdownMenu>
          )}

          {chat.type === "direct" && (
            <div
              className="flex items-center gap-0.5"
              style={isDirectThemed ? { color: "var(--direct-chat-accent)" } : undefined}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-black/5"
                onClick={handleStartVoiceCall}
                title="Gọi thường"
              >
                <Phone className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-black/5"
                onClick={handleStartVideoCall}
                title="Gọi video"
              >
                <Video className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-black/5"
                onClick={() => setDatingDialogOpen(true)}
                title="Gợi ý hẹn hò"
                disabled={sendingDatingRequest}
              >
                <HeartHandshake className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-black/5"
                onClick={handleMinimizeConversation}
              >
                <Minus className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-black/5"
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
      <Dialog
        open={datingDialogOpen}
        onOpenChange={setDatingDialogOpen}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-sm rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Gợi ý hẹn hò</DialogTitle>
            <DialogDescription>
              Gửi lời mời hẹn hò tới {otherDisplayName || "người dùng này"}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDatingDialogOpen(false)}
              disabled={sendingDatingRequest}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={handleDatingSuggestion}
              disabled={sendingDatingRequest}
            >
              {sendingDatingRequest ? "Đang gửi..." : "Gửi lời mời"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={chatColorDialogOpen}
        onOpenChange={(open) => {
          setChatColorDialogOpen(open);
          if (open) {
            setChatColorDraftId(directThemeId);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-20px)] max-w-2xl rounded-3xl border-0 p-0 shadow-2xl">
          <DialogHeader className="border-b bg-muted/25 px-4 py-3">
            <DialogTitle className="text-center text-lg font-bold tracking-tight">
              Xem trước và chọn chủ đề
            </DialogTitle>
            <DialogDescription className="text-center">
              Chọn màu chủ đề áp dụng cho cuộc trò chuyện.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-0 md:grid-cols-[220px_1fr]">
            <div className="max-h-[38vh] space-y-1 overflow-y-auto border-b bg-muted/15 p-2 md:border-b-0 md:border-r">
              {CHAT_PALETTES.map((palette) => {
                const isActive = chatColorDraftId === palette.id;
                return (
                  <button
                    key={palette.id}
                    type="button"
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                      isActive ? "border-blue-500 bg-blue-50" : "border-transparent hover:bg-muted/50"
                    }`}
                    onClick={() => setChatColorDraftId(palette.id)}
                  >
                    <span
                      className="inline-block h-8 w-8 shrink-0 rounded-full"
                      style={{
                        background: `linear-gradient(135deg, hsl(${palette.sent}), hsl(${palette.received}))`,
                      }}
                    />
                    <span className="truncate text-sm font-semibold">{palette.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="bg-background p-2">
              <div
                className="relative overflow-hidden rounded-2xl border border-white/60 p-2.5 shadow-sm"
                style={{
                  background: `linear-gradient(145deg, hsl(${selectedDraftPalette.received}) 0%, hsl(${selectedDraftPalette.sent} / 0.20) 100%)`,
                }}
              >
                <div className="ml-auto mb-1.5 max-w-[82%] rounded-3xl px-3 py-1.5 text-xs font-medium text-white"
                  style={{ backgroundColor: `hsl(${selectedDraftPalette.sent})` }}
                >
                  Có rất nhiều chủ đề để bạn lựa chọn.
                </div>
                <div className="ml-auto mb-1.5 max-w-[82%] rounded-3xl px-3 py-1.5 text-xs font-medium text-white"
                  style={{ backgroundColor: `hsl(${selectedDraftPalette.sent})` }}
                >
                  Tin nhắn bạn gửi sẽ có màu này.
                </div>
                <div
                  className="mb-1.5 max-w-[80%] rounded-3xl px-3 py-1.5 text-xs"
                  style={{
                    backgroundColor: `hsl(${selectedDraftPalette.received})`,
                    color: `hsl(${selectedDraftPalette.receivedForeground})`,
                  }}
                >
                  Tin nhắn của bạn bè sẽ tương tự như thế này.
                </div>
                <div className="ml-auto mt-2 max-w-[82%] rounded-3xl px-3 py-1.5 text-xs font-medium text-white"
                  style={{ backgroundColor: `hsl(${selectedDraftPalette.sent})` }}
                >
                  Nhấp vào Chọn để áp dụng chủ đề này.
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 border-t px-3 py-2.5 sm:flex sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setChatColorDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              type="button"
              onClick={async () => {
                try {
                  await updateConversationTheme(chat._id, chatColorDraftId);
                  setChatColorDialogOpen(false);
                  toast.success("Đã đổi chủ đề cuộc trò chuyện.");
                } catch (error: any) {
                  toast.error(error?.response?.data?.message || "Không thể đổi chủ đề cuộc trò chuyện.");
                }
              }}
            >
              Chọn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={quickReactionDialogOpen}
        onOpenChange={setQuickReactionDialogOpen}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-sm rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Đổi nút like nhanh</DialogTitle>
            <DialogDescription>
              Nút phản ứng nhanh ở ô nhập sẽ gửi emoji bạn chọn.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {QUICK_REACTIONS.map((reaction) => (
              <Button
                key={reaction}
                type="button"
                variant={quickReaction === reaction ? "default" : "outline"}
                className="h-10 min-w-10 px-3 text-lg"
                onClick={() => setQuickReaction(reaction)}
              >
                {reaction}
              </Button>
            ))}
          </div>
          <DialogFooter className="px-4 py-3">
            <Button type="button" onClick={() => setQuickReactionDialogOpen(false)}>
              Xong
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={nicknameDialogOpen}
        onOpenChange={setNicknameDialogOpen}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-sm rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Đổi biệt danh</DialogTitle>
            <DialogDescription>
              Cập nhật cách hiển thị tên của {otherDisplayName || "người dùng này"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 py-4">
            <Input
              value={nicknameDraft}
              onChange={(event) => setNicknameDraft(event.target.value)}
              placeholder="Nhập biệt danh"
              className="h-11 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Để trống và bấm Lưu để xóa biệt danh.
            </p>
          </div>
          <DialogFooter className="px-4 py-3">
            <Button variant="outline" onClick={() => setNicknameDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={async () => {
                if (chat?.type !== "direct" || !otherUser?._id) return;
                try {
                  await updateConversationNickname(chat._id, otherUser._id, nicknameDraft.trim());
                  toast.success(nicknameDraft.trim() ? "Đã cập nhật biệt danh" : "Đã xóa biệt danh");
                  setNicknameDialogOpen(false);
                } catch (error: any) {
                  console.error("Lỗi khi cập nhật biệt danh", error);
                  toast.error(error?.response?.data?.message || "Không thể cập nhật biệt danh");
                }
              }}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-sm rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Đổi tên nhóm</DialogTitle>
            <DialogDescription>Chỉ chủ nhóm mới được đổi tên.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 py-4">
            <Input
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              placeholder="Nhập tên nhóm"
              className="h-11 rounded-xl"
            />
          </div>
          <DialogFooter className="px-4 py-3">
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleSubmitGroupRename}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={groupNicknameDialogOpen} onOpenChange={setGroupNicknameDialogOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-sm rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Biệt danh nhóm</DialogTitle>
            <DialogDescription>Chỉ hiển thị với bạn trong nhóm này.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 py-4">
            <Input
              value={groupNicknameDraft}
              onChange={(event) => setGroupNicknameDraft(event.target.value)}
              placeholder="Nhập biệt danh nhóm"
              className="h-11 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Để trống và bấm Lưu để xoá biệt danh.
            </p>
          </div>
          <DialogFooter className="px-4 py-3">
            <Button variant="outline" onClick={() => setGroupNicknameDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleSubmitGroupNickname}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={groupAvatarDialogOpen}
        onOpenChange={(open) => {
          setGroupAvatarDialogOpen(open);
          if (!open) {
            if (groupAvatarPreview.startsWith("blob:")) {
              URL.revokeObjectURL(groupAvatarPreview);
            }
            setGroupAvatarPreview("");
            setGroupAvatarFile(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-sm rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Thay đổi ảnh nhóm</DialogTitle>
            <DialogDescription>Chỉ chủ nhóm mới được cập nhật ảnh.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 py-4">
            {groupAvatarPreview ? (
              <div className="overflow-hidden rounded-2xl border">
                <img src={groupAvatarPreview} alt="Group preview" className="h-40 w-full object-cover" />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-slate-500">
                Chưa chọn ảnh
              </div>
            )}
            <Input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setGroupAvatarFile(file);
                const preview = URL.createObjectURL(file);
                setGroupAvatarPreview(preview);
              }}
            />
          </div>
          <DialogFooter className="px-4 py-3">
            <Button variant="outline" onClick={() => setGroupAvatarDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleSubmitGroupAvatar} disabled={groupAvatarUploading || !groupAvatarFile}>
              {groupAvatarUploading ? "Đang lưu..." : "Lưu ảnh"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={reportDialogOpen}
        onOpenChange={setReportDialogOpen}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-sm rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>
              {chat?.type === "group" ? "Báo cáo nhóm" : "Báo cáo cuộc trò chuyện"}
            </DialogTitle>
            <DialogDescription>
              Hãy cho chúng tôi biết lý do để xử lý nhanh hơn.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 py-4">
            <div className="space-y-1">
              <Label htmlFor="report-reason">Lý do</Label>
              <Input
                id="report-reason"
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                placeholder="Spam / Quấy rối / Giả mạo..."
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-detail">Chi tiết (không bắt buộc)</Label>
              <Textarea
                id="report-detail"
                value={reportDetail}
                onChange={(event) => setReportDetail(event.target.value)}
                placeholder="Mô tả thêm để chúng tôi xử lý tốt hơn."
                className="min-h-[100px] rounded-xl"
              />
            </div>
          </div>
          <DialogFooter className="px-4 py-3">
            <Button
              variant="outline"
              onClick={() => setReportDialogOpen(false)}
              disabled={reportSubmitting}
            >
              Hủy
            </Button>
            <Button
              disabled={reportSubmitting || !reportReason.trim()}
              onClick={async () => {
                if (!chat?._id) return;
                if (!reportReason.trim()) return;
                try {
                  setReportSubmitting(true);
                  await reportConversation(chat._id, reportReason.trim(), reportDetail.trim());
                  toast.success("Đã gửi báo cáo");
                  setReportDialogOpen(false);
                } catch (error: any) {
                  console.error("Lỗi khi báo cáo cuộc trò chuyện", error);
                  toast.error(error?.response?.data?.message || "Không thể gửi báo cáo");
                } finally {
                  setReportSubmitting(false);
                }
              }}
            >
              {reportSubmitting ? "Đang gửi..." : "Gửi báo cáo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
};

export default ChatWindowHeader;
