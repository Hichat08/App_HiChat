import { useNavigate } from "react-router";
import type { Conversation, Participant } from "@/types/chat";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";
import UserAvatar from "./UserAvatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

const GroupMembersDialog = ({ chat }: { chat: Conversation }) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();

  const handleOpenProfile = (participant: Participant) => {
    navigate(`/users/${participant._id}`);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2">
          <Users className="size-4" />
          <span>{chat.participants.length}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Thành viên nhóm</DialogTitle>
        </DialogHeader>

        <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
          {chat.participants.map((participant) => {
            const isOnline = onlineUsers.includes(participant._id);
            const isMe = participant._id === user?._id;

            return (
              <button
                key={participant._id}
                type="button"
                onClick={() => handleOpenProfile(participant)}
                className="w-full rounded-lg border px-3 py-2 text-left hover:bg-muted/40 transition-smooth"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      type="chat"
                      name={participant.displayName}
                      avatarUrl={participant.avatarUrl ?? undefined}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {participant.displayName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Tham gia{" "}
                        {new Date(participant.joinedAt).toLocaleDateString("vi-VN")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isMe && <Badge variant="secondary">Bạn</Badge>}
                    <Badge
                      className={cn(
                        isOnline
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-700"
                      )}
                    >
                      {isOnline ? "online" : "offline"}
                    </Badge>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GroupMembersDialog;
