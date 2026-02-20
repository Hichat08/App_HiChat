import api from "@/lib/axios";

export const friendService = {
  async searchUsers(keyword: string) {
    const res = await api.get(`/users/search?keyword=${encodeURIComponent(keyword)}`);
    const payload = res.data ?? {};

    if (Array.isArray(payload.users)) return payload.users;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.user) return [payload.user];
    return [];
  },

  async searchByUsername(keyword: string) {
    const users = await this.searchUsers(keyword);
    return users[0] ?? null;
  },

  async sendFriendRequest(to: string, message?: string) {
    const res = await api.post("/friends/requests", { to, message });
    return res.data.message;
  },

  async getAllFriendRequest() {
    try {
      const res = await api.get("/friends/requests");
      const { sent, received } = res.data;
      return { sent, received };
    } catch (error) {
      console.error("Lỗi khi gửi getAllFriendRequest", error);
    }
  },

  async acceptRequest(requestId: string) {
    try {
      const res = await api.post(`/friends/requests/${requestId}/accept`);
      return res.data.requestAcceptedBy;
    } catch (error) {
      console.error("Lỗi khi gửi acceptRequest", error);
    }
  },

  async declineRequest(requestId: string) {
    try {
      await api.post(`/friends/requests/${requestId}/decline`);
    } catch (error) {
      console.error("Lỗi khi gửi declineRequest", error);
    }
  },

  async getFriendList() {
    const res = await api.get("/friends");
    return res.data.friends;
  },
  async removeFriend(friendId: string) {
    const res = await api.delete(`/friends/${friendId}`);
    return res.data?.message;
  },
  async getSuggestions() {
    const res = await api.get("/friends/suggestions");
    return res.data.suggestions;
  },
};
