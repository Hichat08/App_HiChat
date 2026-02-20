import { MessageCircle } from "lucide-react";
import { SidebarInset } from "../ui/sidebar";
import { useSidebar } from "../ui/sidebar";

const ChatWelcomeScreen = () => {
  const { toggleSidebar } = useSidebar();

  return (
    <SidebarInset className="flex h-full w-full bg-transparent">
      <div className="flex flex-1 flex-col rounded-2xl border border-border/60 bg-muted/20 text-center">
        <div className="flex items-center px-3 py-2">
          <button
            type="button"
            onClick={toggleSidebar}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-primary shadow-sm transition-colors hover:bg-primary/10"
            title="Mở danh sách chat"
          >
            <MessageCircle className="size-4.5" />
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
        <div className="mb-4 rounded-full bg-primary/10 p-4">
          <MessageCircle className="size-7 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold">Tin nhắn</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Chọn một cuộc trò chuyện bên trái để bắt đầu nhắn tin.
        </p>
        </div>
      </div>
    </SidebarInset>
  );
};

export default ChatWelcomeScreen;
