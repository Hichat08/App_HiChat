import { useCallback, useEffect, useState } from "react";
import { friendService } from "@/services/friendService";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/chat/UserAvatar";
import { useNavigate } from "react-router";
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
  const { friends, getFriends } = useFriendStore();
  const { openDirectConversation } = useChatStore();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);

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
  }, [getFriends, loadSuggestions]);

  const handleAdd = async (id: string) => {
    try {
      await friendService.sendFriendRequest(id);
      setItems((s) => s.filter((i) => i._id !== id));
    } catch (err) {
      console.error(err);
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

  return (
    <main className="min-h-screen bg-muted/40 p-6">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold whitespace-nowrap">Bạn bè</h1>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate("/")}>
              Về trang chính
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadSuggestions}
              disabled={loading}
            >
              {loading ? "Đang tải..." : "Làm mới gợi ý"}
            </Button>
          </div>
        </div>

        <div className="mb-4 rounded-lg bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Danh sách bạn bè</h2>
            <span className="text-sm text-muted-foreground">{friends.length} người</span>
          </div>

          {friends.length === 0 ? (
            <div className="text-sm text-muted-foreground">Bạn chưa có bạn bè.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {friends.map((friend) => (
                <div key={friend._id} className="flex items-center justify-between gap-4">
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
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Gợi ý kết bạn</h2>

          {loading && <div>Đang tải...</div>}

          {!loading && items.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Không có gợi ý nào.
            </div>
          )}

          <div className="flex flex-col gap-3">
            {items.map((u) => (
              <div
                key={u._id}
                className="flex items-center justify-between gap-4"
              >
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
                      {u.commonGroupsCount ? (
                        <span className="mx-2">·</span>
                      ) : null}
                      {u.commonGroupsCount
                        ? `${u.commonGroupsCount} nhóm chung`
                        : null}
                    </div>
                  </div>
                </button>

                <div>
                  <Button size="sm" onClick={() => handleAdd(u._id)}>
                    Gửi lời mời
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
};

export default FriendSuggestionsPage;
