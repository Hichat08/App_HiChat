import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppNotification = {
  id: string;
  type: "activity" | "friend_post";
  title: string;
  description?: string;
  avatarUrl?: string | null;
  createdAt: string;
  read: boolean;
  postId?: string;
  conversationId?: string;
};

type NotificationState = {
  items: AppNotification[];
  addNotification: (notification: Omit<AppNotification, "read" | "createdAt"> & { createdAt?: string }) => void;
  markAllAsRead: () => void;
  markAsRead: (id: string) => void;
};

const MAX_NOTIFICATION_ITEMS = 200;

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      items: [],
      addNotification: (notification) => {
        set((state) => {
          const createdAt = notification.createdAt ?? new Date().toISOString();
          const existing = state.items.find((item) => item.id === notification.id);
          const nextItem: AppNotification = {
            ...notification,
            createdAt: existing?.createdAt ?? createdAt,
            read: existing?.read ?? false,
          };

          const deduped = state.items.filter((item) => item.id !== notification.id);
          return {
            items: [nextItem, ...deduped].slice(0, MAX_NOTIFICATION_ITEMS),
          };
        });
      },
      markAllAsRead: () => {
        set((state) => ({
          items: state.items.map((item) => ({ ...item, read: true })),
        }));
      },
      markAsRead: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, read: true } : item
          ),
        }));
      },
    }),
    {
      name: "hichat-notification-center",
      partialize: (state) => ({ items: state.items }),
    }
  )
);
