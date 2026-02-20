import { useState } from "react";
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
import { ArrowLeft, Moon, Search, Sun } from "lucide-react";
import { Switch } from "../ui/switch";
import NewGroupChatModal from "../chat/NewGroupChatModal";
import GroupChatList from "../chat/GroupChatList";
import DirectMessageList from "../chat/DirectMessageList";
import { useThemeStore } from "@/stores/useThemeStore";
import ConversationSkeleton from "../skeleton/ConversationSkeleton";
import { useChatStore } from "@/stores/useChatStore";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useThemeStore();
  const { user } = useAuthStore();
  const { convoLoading, conversations } = useChatStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "unread" | "group">("all");

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hasUnreadGroup = conversations.some((convo) => {
    if (convo.type !== "group") return false;
    if (normalizedQuery && !(convo.group?.name || "").toLowerCase().includes(normalizedQuery)) {
      return false;
    }
    if (!user?._id) return false;
    return (convo.unreadCounts?.[user._id] ?? 0) > 0;
  });

  const showGroupSection =
    filterTab === "group" || (filterTab === "unread" && hasUnreadGroup);
  const showFriendSection = filterTab !== "group";

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

        {/* Dirrect Message */}
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

    </Sidebar>
  );
}
