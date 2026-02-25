import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";
import UnreadCountBadge from "./UnreadCountBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useNavigate } from "react-router";
import StreakBadge from "./StreakBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle, Archive, BellOff, LogOut, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { chatService } from "@/services/chatService";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { Label } from "../ui/label";

const GroupChatCard = ({ convo }: { convo: Conversation }) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    activeConversationId,
    setActiveConversation,
    messages,
    fetchMessages,
    removeConversation,
    updateConversationArchive,
    updateConversationMute,
    reportConversation,
  } = useChatStore();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetail, setReportDetail] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  if (!user) return null;

  const unreadCount = convo.unreadCounts[user._id];
  const name = convo.nickname || convo.group?.name || "";
  const handleSelectConversation = async (id: string) => {
    setActiveConversation(id);
    if (!messages[id]) {
      await fetchMessages(id);
    }
    navigate("/messages");
  };

  const handleDeleteChat = () => {
    removeConversation(convo._id);
    toast.success("Đã xóa cuộc trò chuyện khỏi danh sách của bạn");
  };

  const handleArchiveChat = async () => {
    try {
      const nextArchived = !(convo.archived ?? false);
      await updateConversationArchive(convo._id, nextArchived);
      toast.success(nextArchived ? "Đã lưu trữ đoạn chat" : "Đã bỏ lưu trữ");
    } catch (error) {
      console.error("Lỗi khi lưu trữ đoạn chat", error);
      toast.error("Không thể lưu trữ đoạn chat");
    }
  };

  const handleToggleMute = async () => {
    try {
      const nextMuted = !(convo.muted ?? false);
      await updateConversationMute(convo._id, nextMuted);
      toast.success(nextMuted ? "Đã tắt thông báo" : "Đã bật lại thông báo");
    } catch (error) {
      console.error("Lỗi khi cập nhật tắt thông báo", error);
      toast.error("Không thể cập nhật tắt thông báo");
    }
  };

  const handleLeaveGroup = () => {
    const confirmed = window.confirm(
      `Bạn có chắc muốn rời nhóm "${name}"?`
    );
    if (!confirmed) return;

    chatService
      .leaveGroup(convo._id)
      .then(() => {
        removeConversation(convo._id);
        toast.success("Bạn đã rời nhóm chat");
      })
      .catch((error) => {
        console.error("Lỗi khi rời nhóm", error);
        toast.error("Không thể rời nhóm");
      });
  };

  return (
    <>
      <ChatCard
        convoId={convo._id}
        name={name}
        nameRight={
          convo.streakCount && convo.streakCount > 0 ? (
            <StreakBadge
              count={convo.streakCount}
              atRisk={!!convo.streakAtRisk}
              recoveryMode={convo.streakRecoveryMode ?? null}
            />
          ) : null
        }
        timestamp={
          convo.lastMessage?.createdAt
            ? new Date(convo.lastMessage.createdAt)
            : undefined
        }
        isActive={activeConversationId === convo._id}
        onSelect={handleSelectConversation}
        unreadCount={unreadCount}
        leftSection={
          <>
            {unreadCount > 0 && <UnreadCountBadge unreadCount={unreadCount} />}
            <GroupChatAvatar
              participants={convo.participants}
              type="chat"
              groupAvatarUrl={convo.group?.avatarUrl}
              groupName={name}
            />
          </>
        }
        subtitle={
          <p className="text-sm truncate text-muted-foreground">
            {convo.participants.length} thành viên
          </p>
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground opacity-0 transition-smooth hover:bg-muted group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onClick={async (e) => {
                  e.stopPropagation();
                  await handleSelectConversation(convo._id);
                }}
              >
                Mở phần nhắn tin
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleMute();
                }}
              >
                <BellOff className="mr-2 size-4" />
                {convo.muted ? "Bật thông báo" : "Tắt thông báo"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat();
                }}
              >
                <Trash2 className="mr-2 size-4" />
                Xóa chat
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleArchiveChat();
                }}
              >
                <Archive className="mr-2 size-4" />
                Lưu trữ đoạn chat
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setReportReason("");
                  setReportDetail("");
                  setReportOpen(true);
                }}
              >
                <AlertTriangle className="mr-2 size-4" />
                Báo cáo
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleLeaveGroup();
                }}
              >
                <LogOut className="mr-2 size-4" />
                Thoát nhóm chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-sm rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Báo cáo nhóm</DialogTitle>
            <DialogDescription>Hãy cho chúng tôi biết lý do để xử lý nhanh hơn.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 py-4">
            <div className="space-y-1">
              <Label htmlFor={`group-report-reason-${convo._id}`}>Lý do</Label>
              <Input
                id={`group-report-reason-${convo._id}`}
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                placeholder="Spam / Quấy rối / Giả mạo..."
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`group-report-detail-${convo._id}`}>Chi tiết (không bắt buộc)</Label>
              <Textarea
                id={`group-report-detail-${convo._id}`}
                value={reportDetail}
                onChange={(event) => setReportDetail(event.target.value)}
                placeholder="Mô tả thêm để chúng tôi xử lý tốt hơn."
                className="min-h-[100px] rounded-xl"
              />
            </div>
          </div>
          <DialogFooter className="px-4 py-3">
            <Button
              variant="outline"
              onClick={() => setReportOpen(false)}
              disabled={reportSubmitting}
            >
              Hủy
            </Button>
            <Button
              disabled={reportSubmitting || !reportReason.trim()}
              onClick={async () => {
                if (!reportReason.trim()) return;
                try {
                  setReportSubmitting(true);
                  await reportConversation(convo._id, reportReason.trim(), reportDetail.trim());
                  toast.success("Đã gửi báo cáo");
                  setReportOpen(false);
                } catch (error: any) {
                  console.error("Lỗi khi báo cáo nhóm", error);
                  toast.error(error?.response?.data?.message || "Không thể gửi báo cáo");
                } finally {
                  setReportSubmitting(false);
                }
              }}
            >
              {reportSubmitting ? "Đang gửi..." : "Gửi báo cáo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GroupChatCard;
