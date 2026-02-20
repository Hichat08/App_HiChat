import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Conversation } from "@/types/chat";
import type { Friend } from "@/types/user";
import { chatService } from "@/services/chatService";
import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import IniviteSuggestionList from "../newGroupChat/IniviteSuggestionList";
import SelectedUsersList from "../newGroupChat/SelectedUsersList";

const AddGroupMembersModal = ({ chat }: { chat: Conversation }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [invitedUsers, setInvitedUsers] = useState<Friend[]>([]);
  const { friends, getFriends } = useFriendStore();
  const { updateConversation } = useChatStore();

  const existingIds = new Set(chat.participants.map((p) => p._id.toString()));
  const filteredFriends = friends.filter(
    (friend) =>
      friend.displayName.toLowerCase().includes(search.toLowerCase()) &&
      !existingIds.has(friend._id.toString()) &&
      !invitedUsers.some((u) => u._id === friend._id)
  );

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      await getFriends();
    } else {
      setSearch("");
      setInvitedUsers([]);
    }
  };

  const handleSelectFriend = (friend: Friend) => {
    setInvitedUsers((prev) => [...prev, friend]);
    setSearch("");
  };

  const handleRemoveFriend = (friend: Friend) => {
    setInvitedUsers((prev) => prev.filter((u) => u._id !== friend._id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (invitedUsers.length === 0) {
      toast.warning("Bạn phải chọn ít nhất 1 thành viên để mời");
      return;
    }

    try {
      setSubmitting(true);
      const updatedConversation = await chatService.addGroupMembers(
        chat._id,
        invitedUsers.map((u) => u._id)
      );

      updateConversation(updatedConversation);
      setOpen(false);
      setSearch("");
      setInvitedUsers([]);
      toast.success("Đã thêm thành viên vào nhóm");
    } catch (error: any) {
      console.error("Lỗi khi thêm thành viên vào nhóm", error);
      const message =
        error?.response?.data?.message || "Không thể thêm thành viên vào nhóm";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" title="Mời thành viên">
          <UserPlus className="size-4" />
          <span className="sr-only">Mời thành viên</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px] border-none">
        <DialogHeader>
          <DialogTitle>Mời thành viên vào nhóm</DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="invite-member" className="text-sm font-semibold">
              Tìm bạn bè để mời
            </Label>
            <Input
              id="invite-member"
              placeholder="Tìm theo tên hiển thị..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />

            {search && filteredFriends.length > 0 && (
              <IniviteSuggestionList
                filteredFriends={filteredFriends}
                onSelect={handleSelectFriend}
              />
            )}

            <SelectedUsersList invitedUsers={invitedUsers} onRemove={handleRemoveFriend} />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-gradient-chat text-white hover:opacity-90 transition-smooth"
            >
              {submitting ? "Đang thêm..." : "Thêm thành viên"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddGroupMembersModal;
