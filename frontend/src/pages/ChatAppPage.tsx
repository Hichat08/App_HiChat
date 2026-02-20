import ChatWindowLayout from "@/components/chat/ChatWindowLayout";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useEffect } from "react";
import { useChatStore } from "@/stores/useChatStore";
import type { CSSProperties } from "react";

const ChatAppPage = () => {
  const { fetchConversations } = useChatStore();

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "20rem",
          "--sidebar-width-icon": "3rem",
        } as CSSProperties
      }
    >
      <AppSidebar />

      <div className="flex h-dvh w-full p-1 sm:p-2">
        <ChatWindowLayout />
      </div>
    </SidebarProvider>
  );
};

export default ChatAppPage;
