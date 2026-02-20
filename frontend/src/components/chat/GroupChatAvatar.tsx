import type { Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { Ellipsis } from "lucide-react";

interface GroupChatAvatarProps {
  participants: Participant[];
  type: "chat" | "sidebar";
  groupAvatarUrl?: string | null;
  groupName?: string;
}

const GroupChatAvatar = ({
  participants,
  type,
  groupAvatarUrl,
  groupName,
}: GroupChatAvatarProps) => {
  if (groupAvatarUrl) {
    return (
      <UserAvatar
        type={type}
        name={groupName || "Group"}
        avatarUrl={groupAvatarUrl}
      />
    );
  }

  const avatars = [];
  const limit = Math.min(participants.length, 4);

  for (let i = 0; i < limit; i++) {
    const member = participants[i];
    avatars.push(
      <UserAvatar
        key={i}
        type={type}
        name={member.displayName}
        avatarUrl={member.avatarUrl ?? undefined}
      />
    );
  }

  return (
    <div className="relative flex -space-x-2 *:data-[slot=avatar]:ring-background *:data-[slot=avatar]:ring-2">
      {avatars}

      {/* nếu nhiều hơn 4 avatar thì render dấu ... */}
      {participants.length > limit && (
        <div className="flex items-center z-10 justify-center size-8 rounded-full bg-muted ring-2 ring-background text-muted-foreground">
          <Ellipsis className="size-4" />
        </div>
      )}
    </div>
  );
};

export default GroupChatAvatar;
