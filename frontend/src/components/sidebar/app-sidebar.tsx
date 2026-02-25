import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  ArrowLeft,
  Bell,
  BellDot,
  ChevronRight,
  Clock,
  Dot,
  Eye,
  Lock,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Search,
  Shield,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Switch } from "../ui/switch";
import NewGroupChatModal from "../chat/NewGroupChatModal";
import GroupChatList from "../chat/GroupChatList";
import DirectMessageList from "../chat/DirectMessageList";
import AllChatList from "../chat/AllChatList";
import { useThemeStore } from "@/stores/useThemeStore";
import ConversationSkeleton from "../skeleton/ConversationSkeleton";
import { useChatStore } from "@/stores/useChatStore";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { userService } from "@/services/userService";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useThemeStore();
  const { user, setUser } = useAuthStore();
  const {
    convoLoading,
    conversations,
    setActiveConversation,
    fetchMessages,
    updateConversationArchive,
  } = useChatStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "unread" | "group">("all");
  const [archivedDialogOpen, setArchivedDialogOpen] = useState(false);
  const [pendingDialogOpen, setPendingDialogOpen] = useState(false);

  const notificationSettings = user?.notificationSettings;
  const callSoundEnabled = notificationSettings?.callSoundEnabled ?? true;
  const messageSoundEnabled = notificationSettings?.messageSoundEnabled ?? true;
  const messagePopupEnabled = notificationSettings?.messageAlerts ?? true;
  const showOnlineStatus = user?.showOnlineStatus ?? true;

  const showGroupSection = filterTab === "group";
  const showFriendSection = filterTab !== "group" && filterTab !== "all" && filterTab !== "unread";

  const archivedConversations = useMemo(
    () => conversations.filter((convo) => convo.archived),
    [conversations]
  );
  const pendingConversations = useMemo(
    () =>
      conversations.filter(
        (convo) =>
          convo.type === "direct" &&
          convo.directRequest?.status === "pending" &&
          convo.directRequest?.responderId === user?._id
      ),
    [conversations, user?._id]
  );

  const handleOpenConversation = async (conversationId: string) => {
    setActiveConversation(conversationId);
    await fetchMessages(conversationId);
    navigate("/messages");
  };

  const updateNotificationSetting = async (payload: {
    callSoundEnabled?: boolean;
    messageSoundEnabled?: boolean;
    messageAlerts?: boolean;
  }) => {
    try {
      const result = await userService.updateNotificationSettings(payload);
      if (user) {
        setUser({
          ...user,
          notificationSettings: {
            ...user.notificationSettings,
            ...result.notificationSettings,
          },
        });
      }
    } catch (error) {
      console.error("Lỗi cập nhật cài đặt thông báo", error);
      toast.error("Không thể cập nhật cài đặt thông báo");
    }
  };

  const handleToggleOnlineStatus = async (next: boolean) => {
    try {
      const result = await userService.updateOnlineVisibility(next);
      if (user) {
        setUser({
          ...user,
          showOnlineStatus: result.showOnlineStatus ?? next,
        });
      }
      toast.success(next ? "Đã bật trạng thái hoạt động" : "Đã tắt trạng thái hoạt động");
    } catch (error) {
      console.error("Lỗi khi cập nhật trạng thái hoạt động", error);
      toast.error("Không thể cập nhật trạng thái hoạt động");
    }
  };

  return (
    <Sidebar variant="inset" collapsible="offcanvas" {...props}>
      {/* Header */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="bg-gradient-primary h-14 sm:h-16"
            >
              <div className="w-full">
                <div className="flex w-full items-center justify-between px-2">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate("/messages")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate("/messages");
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/");
                      }}
                      className="rounded-full p-1.5 text-white/90 hover:bg-white/15"
                      title="Về trang chính"
                      aria-label="Về trang chính"
                    >
                      <ArrowLeft className="size-4" />
                    </button>
                    <div className="flex flex-col items-start">
                      <h1 className="text-lg sm:text-xl font-bold leading-tight text-white">HiChat</h1>
                      <span className="text-[11px] text-white/80">Messenger</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Sun className="size-4 text-white/80" />
                    <Switch
                      checked={isDark}
                      onCheckedChange={toggleTheme}
                      className="data-[state=checked]:bg-background/80"
                    />
                    <Moon className="size-4 text-white/80" />
                  </div>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Content */}
      <SidebarContent className="beautiful-scrollbar px-1">
        <SidebarGroup className="pt-1 pb-0">
          <div className="px-2 pb-2">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="text-lg font-bold">Đoạn chat</h2>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                    title="Cài đặt đoạn chat"
                    aria-label="Cài đặt đoạn chat"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[320px] p-2">
                  <div className="px-2 pb-2">
                    <p className="text-sm font-semibold">Cài đặt đoạn chat</p>
                    <p className="text-xs text-muted-foreground">
                      Tùy chỉnh trải nghiệm trên Messenger.
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <div className="space-y-1 px-1">
                    <div className="flex items-center justify-between rounded-lg border px-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <Volume2 className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Âm thanh cuộc gọi đến</p>
                        </div>
                      </div>
                      <Switch
                        checked={callSoundEnabled}
                        onCheckedChange={(value) =>
                          updateNotificationSetting({ callSoundEnabled: value })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg px-2.5 py-2">
                      <div className="flex items-center gap-2">
                        {messageSoundEnabled ? (
                          <Volume2 className="size-4 text-muted-foreground" />
                        ) : (
                          <VolumeX className="size-4 text-muted-foreground" />
                        )}
                        <p className="text-sm font-medium">Âm thanh tin nhắn</p>
                      </div>
                      <Switch
                        checked={messageSoundEnabled}
                        onCheckedChange={(value) =>
                          updateNotificationSetting({ messageSoundEnabled: value })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg px-2.5 py-2">
                      <div className="flex items-center gap-2">
                        {messagePopupEnabled ? (
                          <BellDot className="size-4 text-muted-foreground" />
                        ) : (
                          <Bell className="size-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-sm font-medium">Tin nhắn mới bật lên</p>
                          <p className="text-xs text-muted-foreground">
                            Tự động mở thông báo mới
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={messagePopupEnabled}
                        onCheckedChange={(value) =>
                          updateNotificationSetting({ messageAlerts: value })
                        }
                      />
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/settings?tab=privacy")}>
                    <Shield className="mr-2 size-4" />
                    Quyền riêng tư và an toàn
                    <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleToggleOnlineStatus(!showOnlineStatus)}>
                    <Eye className="mr-2 size-4" />
                    Trạng thái hoạt động: {showOnlineStatus ? "ĐANG BẬT" : "ĐANG TẮT"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPendingDialogOpen(true)}>
                    <Clock className="mr-2 size-4" />
                    Tin nhắn đang chờ
                    {pendingConversations.length > 0 && (
                      <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        {pendingConversations.length}
                      </span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setArchivedDialogOpen(true)}>
                    <MessageSquare className="mr-2 size-4" />
                    Đoạn chat đã lưu trữ
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings?tab=preferences")}>
                    <Dot className="mr-2 size-4" />
                    Cài đặt gửi tin nhắn
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings?tab=privacy")}>
                    <Lock className="mr-2 size-4" />
                    Tài khoản đã hạn chế
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings?tab=privacy")}>
                    <Shield className="mr-2 size-4" />
                    Cài đặt chặn
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm trên Messenger"
                className="h-9 rounded-full pl-9"
              />
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {[
                  { id: "all" as const, label: "Tất cả" },
                  { id: "unread" as const, label: "Chưa đọc" },
                  { id: "group" as const, label: "Nhóm" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterTab(tab.id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                      filterTab === tab.id
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SidebarGroup>

        {/* Group Chat */}
        {showGroupSection && (
          <SidebarGroup className="pt-1">
            {filterTab === "group" ? (
              <div className="mb-2 flex justify-end px-2">
                <NewGroupChatModal showLabel />
              </div>
            ) : null}
            <SidebarGroupContent>
              {convoLoading ? (
                <ConversationSkeleton />
              ) : (
                <GroupChatList
                  searchQuery={searchQuery}
                  unreadOnly={filterTab === "unread"}
                />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* All Chats (mixed) */}
        {(filterTab === "all" || filterTab === "unread") && (
          <SidebarGroup className="pt-1">
            <SidebarGroupContent>
              {convoLoading ? (
                <ConversationSkeleton />
              ) : (
                <AllChatList
                  searchQuery={searchQuery}
                  unreadOnly={filterTab === "unread"}
                />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Direct Message */}
        {showFriendSection && (
          <SidebarGroup className="pt-1">
            <SidebarGroupContent>
              {convoLoading ? (
                <ConversationSkeleton />
              ) : (
                <DirectMessageList
                  searchQuery={searchQuery}
                  unreadOnly={filterTab === "unread"}
                />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <Dialog
        open={archivedDialogOpen}
        onOpenChange={setArchivedDialogOpen}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Đoạn chat đã lưu trữ</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {archivedConversations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có đoạn chat lưu trữ.</p>
            ) : (
              archivedConversations.map((convo) => {
                const other =
                  convo.type === "direct"
                    ? convo.participants.find((p) => p._id !== user?._id)
                    : null;
                const name =
                  convo.type === "group"
                    ? convo.group?.name || "Nhóm chat"
                    : convo.nickname || other?.displayName || "Đoạn chat";
                return (
                  <div
                    key={convo._id}
                    className="flex items-center justify-between rounded-xl border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {convo.lastMessage?.content || "Không có tin nhắn"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await updateConversationArchive(convo._id, false);
                        }}
                      >
                        Bỏ lưu trữ
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          await handleOpenConversation(convo._id);
                          setArchivedDialogOpen(false);
                        }}
                      >
                        Mở
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDialogOpen}
        onOpenChange={setPendingDialogOpen}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Tin nhắn đang chờ</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {pendingConversations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có tin nhắn đang chờ.</p>
            ) : (
              pendingConversations.map((convo) => {
                const other =
                  convo.type === "direct"
                    ? convo.participants.find((p) => p._id !== user?._id)
                    : null;
                const name = convo.nickname || other?.displayName || "Đoạn chat";
                return (
                  <div
                    key={convo._id}
                    className="flex items-center justify-between rounded-xl border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Yêu cầu tin nhắn đang chờ phản hồi
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={async () => {
                        await handleOpenConversation(convo._id);
                        setPendingDialogOpen(false);
                      }}
                    >
                      Mở
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

    </Sidebar>
  );
}
