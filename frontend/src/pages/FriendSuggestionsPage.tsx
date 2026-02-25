import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Bell,
  Home,
  Menu,
  MessageCircle,
  Search,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UserAvatar from "@/components/chat/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Logout from "@/components/auth/Logout";
import { cn } from "@/lib/utils";
import { friendService } from "@/services/friendService";
import { useFriendStore } from "@/stores/useFriendStore";
import { useChatStore } from "@/stores/useChatStore";

type Suggestion = {
  _id: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
  mutualCount?: number;
  commonGroupsCount?: number;
};

const FriendSuggestionsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    friends,
    receivedList,
    getFriends,
    getAllFriendRequests,
    acceptRequest,
    declineRequest,
  } = useFriendStore();
  const { openDirectConversation } = useChatStore();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);
  const [votingFriendId, setVotingFriendId] = useState<string | null>(null);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await friendService.getSuggestions();
      setItems(res || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuggestions();
    getFriends();
    getAllFriendRequests();
  }, [getAllFriendRequests, getFriends, loadSuggestions]);

  const handleAdd = async (id: string) => {
    try {
      await friendService.sendFriendRequest(id);
      setItems((s) => s.filter((i) => i._id !== id));
      toast.success("Đã gửi lời mời kết bạn");
    } catch (err) {
      console.error(err);
      toast.error("Không thể gửi lời mời");
    }
  };

  const handleOpenChat = async (friendId: string) => {
    try {
      setOpeningChatId(friendId);
      const convoId = await openDirectConversation(friendId);
      if (convoId) {
        navigate("/messages");
      }
    } finally {
      setOpeningChatId(null);
    }
  };

  const handleVoteLockedFriend = async (
    friendId: string,
    vote: "safe" | "suspicious",
  ) => {
    try {
      setVotingFriendId(friendId);
      await friendService.voteLockedFriend(friendId, vote);
      await getFriends();
      toast.success("Đã ghi nhận bình chọn của bạn");
    } catch (error: any) {
      const message =
        error?.response?.data?.message || "Không thể gửi bình chọn lúc này";
      toast.error(message);
    } finally {
      setVotingFriendId(null);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      setRequestActionId(requestId);
      await acceptRequest(requestId);
      await getFriends();
      toast.success("Đã xác nhận kết bạn");
    } finally {
      setRequestActionId(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try {
      setRequestActionId(requestId);
      await declineRequest(requestId);
      toast.success("Đã xóa lời mời");
    } finally {
      setRequestActionId(null);
    }
  };

  const handleOpenMessages = () => {
    navigate("/messages");
  };

  const handleOpenNotifications = async () => {
    await getAllFriendRequests();
    const section = document.getElementById("friend-requests-section");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const normalizedSearch = searchKeyword.trim().toLowerCase();
  const filteredFriends = useMemo(
    () =>
      friends.filter((friend) => {
        if (!normalizedSearch) return true;
        return (
          (friend.displayName || "").toLowerCase().includes(normalizedSearch) ||
          (friend.username || "").toLowerCase().includes(normalizedSearch)
        );
      }),
    [friends, normalizedSearch],
  );
  const filteredSuggestions = useMemo(
    () =>
      items.filter((u) => {
        if (!normalizedSearch) return true;
        return (
          (u.displayName || "").toLowerCase().includes(normalizedSearch) ||
          (u.username || "").toLowerCase().includes(normalizedSearch)
        );
      }),
    [items, normalizedSearch],
  );

  const requestCount = receivedList.length;

  return (
    <main className="hc-page-bg min-h-screen p-3 sm:p-4">
      <div className="hc-feed-shell space-y-4">
        <div className="hc-feed-topbar sticky top-0 z-20 overflow-hidden rounded-2xl border">
          <div className="flex items-center justify-between gap-3 bg-gradient-primary px-3 py-2.5 sm:px-4">
            <button
              type="button"
              onClick={() => navigate("/messages")}
              className="text-2xl font-black leading-none tracking-tight text-primary-foreground sm:text-3xl"
              title="Về Mess nhắn tin"
            >
              HiChat
            </button>
            <div className="relative w-full max-w-[220px] sm:max-w-[300px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Tìm bạn bè..."
                className="h-9 rounded-full border-white/35 bg-white pl-9 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-5 border-t bg-background">
            <button
              type="button"
              onClick={() => navigate("/")}
              className={cn(
                "flex h-11 items-center justify-center border-b-2 transition-colors",
                location.pathname === "/"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              title="Trang chủ"
            >
              <Home className="size-5" />
            </button>
            <button
              type="button"
              className="flex h-11 items-center justify-center border-b-2 border-primary text-primary transition-colors"
              title="Bạn bè"
            >
              <UsersRound className="size-5" />
            </button>
            <button
              type="button"
              onClick={handleOpenMessages}
              className={cn(
                "relative flex h-11 items-center justify-center border-b-2 transition-colors",
                location.pathname === "/messages"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              title="Tin nhắn"
            >
              <MessageCircle className="size-5" />
            </button>
            <button
              type="button"
              onClick={handleOpenNotifications}
              className="relative flex h-11 items-center justify-center border-b-2 border-transparent text-muted-foreground transition-colors hover:text-foreground"
              title="Lời mời kết bạn"
            >
              <Bell className="size-5" />
              {requestCount > 0 ? (
                <span className="absolute -right-3 -top-2 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] leading-4 text-white">
                  {requestCount > 99 ? "99+" : requestCount}
                </span>
              ) : null}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-11 items-center justify-center border-b-2 border-transparent text-muted-foreground transition-colors hover:text-foreground"
                  title="Menu"
                >
                  <Menu className="size-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  Trang cá nhân
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  Cài đặt
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" variant="destructive">
                  <Logout />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div id="friend-requests-section" className="hc-elevated-card rounded-2xl p-4">
          <h2 className="mb-3 text-xl font-semibold tracking-tight">Lời mời kết bạn</h2>
          {receivedList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Hiện chưa có lời mời nào.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {receivedList.map((request) => {
                const user = request?.from;
                return (
                  <div
                    key={request._id}
                    className="mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border bg-white shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/users/${user?._id}`)}
                      className="block h-28 w-full bg-slate-100 sm:h-32"
                    >
                      {user?.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.displayName || user.username}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-200 text-7xl font-bold text-slate-400">
                          {(user?.displayName || user?.username || "U").charAt(0)}
                        </div>
                      )}
                    </button>
                    <div className="space-y-2 p-2.5">
                      <p className="truncate text-lg font-semibold leading-none text-slate-900">
                        {user?.displayName || user?.username}
                      </p>
                      <div className="space-y-2">
                        <Button
                          className="h-9 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                          onClick={() => handleAcceptRequest(request._id)}
                          disabled={requestActionId === request._id}
                        >
                          Xác nhận
                        </Button>
                        <Button
                          variant="secondary"
                          className="h-9 w-full rounded-lg bg-slate-200 text-sm font-semibold text-slate-900 hover:bg-slate-300"
                          onClick={() => handleDeclineRequest(request._id)}
                          disabled={requestActionId === request._id}
                        >
                          Xóa
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="hc-elevated-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Danh sách bạn bè</h2>
            <span className="text-sm text-muted-foreground">
              {filteredFriends.length} người
            </span>
          </div>

          {filteredFriends.length === 0 ? (
            <div className="text-sm text-muted-foreground">Bạn chưa có bạn bè.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredFriends.map((friend) => (
                <div
                  key={friend._id}
                  className="rounded-xl border border-transparent p-2 transition-colors hover:border-slate-200"
                >
                  <div className="flex items-center justify-between gap-4">
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-3 text-left"
                      onClick={() => navigate(`/users/${friend._id}`)}
                    >
                      <UserAvatar
                        type="chat"
                        name={friend.displayName || friend.username || ""}
                        avatarUrl={friend.avatarUrl ?? undefined}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {friend.displayName || friend.username}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          @{friend.username}
                        </div>
                      </div>
                    </button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenChat(friend._id)}
                      disabled={openingChatId === friend._id}
                    >
                      {openingChatId === friend._id ? "Đang mở..." : "Nhắn tin"}
                    </Button>
                  </div>

                  {friend.lockIncident?.active ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-amber-900">
                        <ShieldAlert className="h-4 w-4" />
                        <p className="text-sm font-semibold">
                          Tài khoản bạn của bạn đang gặp sự cố
                        </p>
                      </div>
                      <p className="text-xs leading-relaxed text-amber-800/90">
                        Hệ thống đang xác minh tài khoản này. Bạn có thể bình chọn để
                        giúp admin đánh giá nhanh hơn.
                      </p>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant={friend.lockIncident.myVote === "safe" ? "default" : "outline"}
                          className={
                            friend.lockIncident.myVote === "safe"
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          }
                          disabled={votingFriendId === friend._id}
                          onClick={() => handleVoteLockedFriend(friend._id, "safe")}
                        >
                          Không có hành vi gì đáng ngờ
                        </Button>
                        <Button
                          type="button"
                          variant={friend.lockIncident.myVote === "suspicious" ? "default" : "outline"}
                          className={
                            friend.lockIncident.myVote === "suspicious"
                              ? "bg-rose-600 text-white hover:bg-rose-700"
                              : "border-rose-300 text-rose-700 hover:bg-rose-50"
                          }
                          disabled={votingFriendId === friend._id}
                          onClick={() => handleVoteLockedFriend(friend._id, "suspicious")}
                        >
                          Có hành vi đáng ngờ
                        </Button>
                      </div>

                      <p className="mt-3 text-xs text-amber-900/80">
                        Bình chọn cộng đồng: an toàn {friend.lockIncident.counts.safe} · đáng ngờ{" "}
                        {friend.lockIncident.counts.suspicious} · tổng {friend.lockIncident.counts.total}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hc-elevated-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Những người bạn có thể biết</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={loadSuggestions}
              disabled={loading}
            >
              {loading ? "Đang tải..." : "Làm mới"}
            </Button>
          </div>

          {loading && <div>Đang tải...</div>}

          {!loading && filteredSuggestions.length === 0 && (
            <div className="text-sm text-muted-foreground">Không có gợi ý nào.</div>
          )}

          <div className="flex flex-col gap-3">
            {filteredSuggestions.map((u) => (
              <div key={u._id} className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-3 text-left"
                  onClick={() => navigate(`/users/${u._id}`)}
                >
                  <UserAvatar
                    type="chat"
                    name={u.displayName || u.username || ""}
                    avatarUrl={u.avatarUrl ?? undefined}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium hover:underline">
                      {u.displayName || u.username}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {u.mutualCount ?? 0} bạn chung
                      {u.commonGroupsCount ? <span className="mx-2">·</span> : null}
                      {u.commonGroupsCount ? `${u.commonGroupsCount} nhóm chung` : null}
                    </div>
                  </div>
                </button>

                <Button size="sm" onClick={() => handleAdd(u._id)}>
                  Gửi lời mời
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
};

export default FriendSuggestionsPage;
