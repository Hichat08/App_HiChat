import { useFriendStore } from "@/stores/useFriendStore";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Plus, UserPlus, Users } from "lucide-react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import type { Friend } from "@/types/user";
import IniviteSuggestionList from "../newGroupChat/IniviteSuggestionList";
import SelectedUsersList from "../newGroupChat/SelectedUsersList";
import { toast } from "sonner";
import { useChatStore } from "@/stores/useChatStore";
import { useNavigate } from "react-router";

const NewGroupChatModal = ({ showLabel = false }: { showLabel?: boolean }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const { friends, getFriends } = useFriendStore();
  const [invitedUsers, setInvitedUsers] = useState<Friend[]>([]);
  const { loading, createConversation, setActiveConversation, fetchMessages } = useChatStore();

  const handleGetFriends = async () => {
    await getFriends();
  };

  const handleSelectFriend = (friend: Friend) => {
    setInvitedUsers([...invitedUsers, friend]);
    setSearch("");
  };

  const handleRemoveFriend = (friend: Friend) => {
    setInvitedUsers(invitedUsers.filter((u) => u._id !== friend._id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      if (invitedUsers.length === 0) {
        toast.warning("Bạn phải mời ít nhất 1 thành viên vào nhóm");
        return;
      }

      const conversationId = await createConversation(
        "group",
        groupName,
        invitedUsers.map((u) => u._id)
      );

      if (conversationId) {
        setActiveConversation(conversationId);
        await fetchMessages(conversationId);
        setOpen(false);
        navigate("/messages");
      }

      setGroupName("");
      setSearch("");
      setInvitedUsers([]);
    } catch (error) {
      console.error("Lỗi xảy ra khi handleSubmit trong NewGroupChatModal:", error);
    }
  };

  const filteredFriends = friends.filter(
    (friend) =>
      friend.displayName.toLowerCase().includes(search.toLowerCase()) &&
      !invitedUsers.some((u) => u._id === friend._id)
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearch("");
        }
      }}
    >
      <DialogTrigger asChild>
        {showLabel ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleGetFriends}
            className="h-8 gap-1.5 rounded-full px-3 text-xs font-semibold"
          >
            <Plus className="size-3.5" />
            Tạo nhóm
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={handleGetFriends}
            className="flex z-10 justify-center items-center size-5 rounded-full hover:bg-sidebar-accent transition cursor-pointer"
          >
            <Users className="size-4" />
            <span className="sr-only">Tạo nhóm</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px] border-none">
        <DialogHeader>
          <DialogTitle className="capitalize">tạo nhóm chat mới</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={handleSubmit}
        >
          {/* tên nhóm */}
          <div className="space-y-2">
            <Label
              htmlFor="groupName"
              className="text-sm font-semibold"
            >
              Tên nhóm
            </Label>
            <Input
              id="groupName"
              placeholder="Gõ tên nhóm vào đây..."
              className="glass border-border/50 focus:border-primary/50 transition-smooth"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
          </div>

          {/* mời thành viên */}
          <div className="space-y-2">
            <Label
              htmlFor="invite"
              className="text-sm font-semibold"
            >
              Mời thành viên
            </Label>

            <Input
              id="invite"
              placeholder="Tìm theo tên hiển thị..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />

            {/* danh sách gợi ý */}
            {search && filteredFriends.length > 0 && (
              <IniviteSuggestionList
                filteredFriends={filteredFriends}
                onSelect={handleSelectFriend}
              />
            )}

            {/* danh sách user đã chọn */}
            <SelectedUsersList
              invitedUsers={invitedUsers}
              onRemove={handleRemoveFriend}
            />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-chat text-white hover:opacity-90 transition-smooth"
            >
              {loading ? (
                <span>Đang tạo...</span>
              ) : (
                <>
                  <UserPlus className="size-4 mr-2" />
                  Tạo nhóm
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewGroupChatModal;
