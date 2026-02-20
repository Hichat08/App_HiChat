import { useEffect, useState } from "react";
import { friendService } from "@/services/friendService";
import { Button } from "../ui/button";
import UserAvatar from "../chat/UserAvatar";
import { useNavigate } from "react-router";

type Suggestion = {
  _id: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
  mutualCount?: number;
  commonGroupsCount?: number;
};

const FriendSuggestions = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await friendService.getSuggestions();
        if (mounted) setItems(res || []);
      } catch (err) {
        console.error("Lỗi khi load suggestions", err);
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleAdd = async (id: string) => {
    try {
      await friendService.sendFriendRequest(id);
      setItems((s) => s.filter((i) => i._id !== id));
    } catch (err) {
      console.error("Lỗi khi gửi lời mời kết bạn", err);
    }
  };

  if (loading || items.length === 0) return null;

  return (
    <div className="px-2">
      <h3 className="text-xs uppercase text-muted-foreground mb-2">Gợi ý</h3>
      <div className="flex flex-col gap-2">
        {items.map((u) => (
          <div key={u._id} className="flex items-center justify-between">
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 text-left"
              onClick={() => navigate(`/users/${u._id}`)}
            >
              <UserAvatar
                type="sidebar"
                name={u.displayName || u.username || ""}
                avatarUrl={u.avatarUrl ?? undefined}
              />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium hover:underline">
                  {u.displayName || u.username}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {u.mutualCount ?? 0} bạn chung
                  {typeof u.commonGroupsCount !== "undefined" && (
                    <span className="mx-1">·</span>
                  )}
                  {u.commonGroupsCount
                    ? `${u.commonGroupsCount} nhóm chung`
                    : null}
                </span>
              </div>
            </button>
            <div>
              <Button size="sm" onClick={() => handleAdd(u._id)}>
                Thêm
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FriendSuggestions;
