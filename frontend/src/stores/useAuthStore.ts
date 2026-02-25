import { create } from "zustand";
import { toast } from "sonner";
import { authService } from "@/services/authService";
import type { AuthState } from "@/types/store";
import { persist } from "zustand/middleware";
import { useChatStore } from "./useChatStore";

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      loading: false,

      setAccessToken: (accessToken) => {
        set({ accessToken });
      },
      setUser: (user) => {
        set({ user });
      },
      clearState: () => {
        set({ accessToken: null, user: null, loading: false });
        useChatStore.getState().reset();
        localStorage.clear();
        sessionStorage.clear();
      },
      signUp: async (username, password, email, firstName, lastName, phone, birthday) => {
        try {
          set({ loading: true });

          //  gọi api
          await authService.signUp(
            username,
            password,
            email,
            firstName,
            lastName,
            phone,
            birthday
          );

          toast.success(
            "Đăng ký thành công! Bạn sẽ được chuyển sang trang đăng nhập."
          );
        } catch (error) {
          console.error(error);
          const message =
            (error as any)?.response?.data?.message || "Đăng ký không thành công";
          toast.error(message);
          throw error;
        } finally {
          set({ loading: false });
        }
      },
      signIn: async (username, password) => {
        try {
          get().clearState();
          set({ loading: true });

          const { accessToken } = await authService.signIn(username, password);
          get().setAccessToken(accessToken);

          await get().fetchMe();
          useChatStore.getState().fetchConversations();

          toast.success("Chào mừng bạn quay lại với HiChat 🎉");
        } catch (error) {
          console.error(error);
          const message =
            (error as any)?.response?.data?.message || "Đăng nhập không thành công!";
          toast.error(message);
          throw error;
        } finally {
          set({ loading: false });
        }
      },
      signOut: async () => {
        try {
          get().clearState();
          await authService.signOut();
          toast.success("Đăng xuất thành công!");
        } catch (error) {
          console.error(error);
          toast.error("Lỗi xảy ra khi logout. Hãy thử lại!");
        }
      },
      fetchMe: async () => {
        try {
          set({ loading: true });
          const user = await authService.fetchMe();

          set({ user });
        } catch (error) {
          const status = (error as any)?.response?.status;
          const code = (error as any)?.response?.data?.code;
          const lockReason = (error as any)?.response?.data?.lockReason || "";
          const lockedAt = (error as any)?.response?.data?.lockedAt || null;
          if (status === 423 || code === "USER_LOCKED") {
            const current = get().user;
            if (current) {
              set({
                user: {
                  ...current,
                  isLocked: true,
                  lockReason,
                  lockedAt,
                },
              });
            }
            return;
          }
          console.error(error);
          set({ user: null, accessToken: null });
          toast.error("Lỗi xảy ra khi lấy dữ liệu người dùng. Hãy thử lại!");
        } finally {
          set({ loading: false });
        }
      },
      refresh: async () => {
        try {
          set({ loading: true });
          const { user, fetchMe, setAccessToken } = get();
          const accessToken = await authService.refresh();

          setAccessToken(accessToken);

          if (!user) {
            await fetchMe();
          }
        } catch (error) {
          const status = (error as any)?.response?.status;
          const code = (error as any)?.response?.data?.code;
          const lockReason = (error as any)?.response?.data?.lockReason || "";
          const lockedAt = (error as any)?.response?.data?.lockedAt || null;
          if (status === 423 || code === "USER_LOCKED") {
            const current = get().user;
            if (current) {
              set({
                user: {
                  ...current,
                  isLocked: true,
                  lockReason,
                  lockedAt,
                },
              });
            }
            return;
          }
          console.error(error);
          toast.error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!");
          get().clearState();
        } finally {
          set({ loading: false });
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user }), // chỉ persist user
    }
  )
);
