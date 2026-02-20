import { Card } from "@/components/ui/card";
import { formatOnlineTime, cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";

interface ChatCardProps {
  convoId: string;
  name: React.ReactNode;
  nameRight?: React.ReactNode;
  timestamp?: Date;
  isActive: boolean;
  onSelect: (id: string) => void;
  unreadCount?: number;
  leftSection: React.ReactNode;
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
}

const ChatCard = ({
  convoId,
  name,
  nameRight,
  timestamp,
  isActive,
  onSelect,
  unreadCount,
  leftSection,
  subtitle,
  actions,
}: ChatCardProps) => {
  return (
    <Card
      key={convoId}
      className={cn(
        "group border border-border/50 p-2.5 sm:p-3 cursor-pointer transition-smooth bg-card hover:bg-muted/40 shadow-xs rounded-xl",
        isActive &&
          "ring-2 ring-primary/45 bg-gradient-to-tr from-primary-glow/10 to-card shadow-sm",
      )}
      onClick={() => onSelect(convoId)}
    >
      <div className="flex items-center gap-3">
        <div className="relative">{leftSection}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3
              className={cn(
                "font-semibold text-sm truncate flex items-center gap-1.5 sm:gap-2",
                unreadCount && unreadCount > 0 && "text-foreground",
              )}
            >
              <span className="truncate">{name}</span>
              {/** optional node rendered to the right of the name (e.g. streak badge) **/}
              {nameRight}
            </h3>

            <span className="text-[11px] sm:text-xs text-muted-foreground">
              {timestamp ? formatOnlineTime(timestamp) : ""}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {subtitle}
            </div>
            {actions ?? (
              <MoreHorizontal className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-smooth" />
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ChatCard;
