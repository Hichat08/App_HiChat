import type { ChatAppearanceState } from "@/types/store";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChatPalette = {
  id: string;
  label: string;
  sent: string;
  sentForeground: string;
  received: string;
  receivedForeground: string;
};

export const CHAT_PALETTES: ChatPalette[] = [
  {
    id: "violet",
    label: "Tím mặc định",
    sent: "271 79% 47%",
    sentForeground: "0 0% 100%",
    received: "0 0% 96%",
    receivedForeground: "240 15% 15%",
  },
  {
    id: "ocean",
    label: "Xanh đại dương",
    sent: "206 92% 46%",
    sentForeground: "0 0% 100%",
    received: "210 40% 96%",
    receivedForeground: "222 47% 11%",
  },
  {
    id: "sunset",
    label: "Hoàng hôn cam",
    sent: "18 93% 53%",
    sentForeground: "0 0% 100%",
    received: "24 100% 97%",
    receivedForeground: "20 14% 18%",
  },
  {
    id: "rose",
    label: "Hồng tình yêu",
    sent: "336 84% 57%",
    sentForeground: "0 0% 100%",
    received: "336 100% 97%",
    receivedForeground: "336 40% 20%",
  },
  {
    id: "forest",
    label: "Xanh lá",
    sent: "142 72% 35%",
    sentForeground: "0 0% 100%",
    received: "138 76% 97%",
    receivedForeground: "142 34% 17%",
  },
];

export const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "👏", "💯"];

export const getChatPaletteById = (id: string) =>
  CHAT_PALETTES.find((item) => item.id === id) || CHAT_PALETTES[0];

export const useChatAppearanceStore = create<ChatAppearanceState>()(
  persist(
    (set) => ({
      chatPaletteId: CHAT_PALETTES[0].id,
      quickReaction: QUICK_REACTIONS[0],
      setChatPaletteId: (paletteId) => set({ chatPaletteId: paletteId }),
      setQuickReaction: (reaction) => set({ quickReaction: reaction }),
    }),
    {
      name: "chat-appearance-storage",
    }
  )
);

