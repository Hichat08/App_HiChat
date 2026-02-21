import api from "@/lib/axios";
import type { ArchiveItem } from "@/types/archive";

export const archiveService = {
  getMyItems: async (): Promise<ArchiveItem[]> => {
    const res = await api.get("/archives");
    return res.data?.items || [];
  },
  createItem: async (payload: { title: string; content?: string }): Promise<ArchiveItem> => {
    const res = await api.post("/archives", payload);
    return res.data?.item;
  },
  updateItem: async (
    itemId: string,
    payload: { title?: string; content?: string }
  ): Promise<ArchiveItem> => {
    const res = await api.patch(`/archives/${itemId}`, payload);
    return res.data?.item;
  },
  deleteItem: async (itemId: string): Promise<void> => {
    await api.delete(`/archives/${itemId}`);
  },
};
