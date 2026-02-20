import { useRef } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import type { Conversation } from "@/types/chat";
import { chatService } from "@/services/chatService";
import { useChatStore } from "@/stores/useChatStore";
import { Button } from "../ui/button";

const GroupAvatarUploader = ({ chat }: { chat: Conversation }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { updateConversation } = useChatStore();

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append("file", file);

      const updatedConversation = await chatService.updateGroupAvatar(
        chat._id,
        formData
      );

      updateConversation(updatedConversation);
      toast.success("Đã cập nhật avatar nhóm");
    } catch (error: any) {
      console.error("Lỗi khi cập nhật avatar nhóm", error);
      const message =
        error?.response?.data?.message || "Không thể cập nhật avatar nhóm";
      toast.error(message);
    } finally {
      e.target.value = "";
    }
  };

  return (
    <>
      <Button
        size="icon"
        variant="secondary"
        onClick={handleClick}
        className="absolute -bottom-1 -right-1 size-7 rounded-full shadow-md hover:scale-105 transition-smooth hover:bg-background"
        title="Đổi avatar nhóm"
      >
        <Camera className="size-3.5" />
      </Button>

      <input
        type="file"
        hidden
        accept="image/*"
        ref={fileInputRef}
        onChange={handleUpload}
      />
    </>
  );
};

export default GroupAvatarUploader;
