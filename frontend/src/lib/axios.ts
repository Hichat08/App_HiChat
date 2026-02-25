import { useAuthStore } from "@/stores/useAuthStore";
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

// gắn access token vào req header
api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

// tự động gọi refresh api khi access token hết hạn
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    const status = error?.response?.status;
    const errorMessage = error?.response?.data?.message;
    const errorCode = error?.response?.data?.code;
    const isAuthExpiredError =
      status === 403 &&
      typeof errorMessage === "string" &&
      errorMessage.includes("Access token hết hạn hoặc không đúng");
    const isUserLocked = status === 423 && errorCode === "USER_LOCKED";

    // những api không cần check
    if (
      !originalRequest ||
      originalRequest.url.includes("/auth/signin") ||
      originalRequest.url.includes("/auth/signup") ||
      originalRequest.url.includes("/auth/refresh")
    ) {
      return Promise.reject(error);
    }

    if (isUserLocked) {
      const lockReason = error?.response?.data?.lockReason || "";
      const lockedAt = error?.response?.data?.lockedAt || null;
      const { user, setUser } = useAuthStore.getState();
      if (user) {
        setUser({
          ...user,
          isLocked: true,
          lockReason,
          lockedAt,
        });
      }
      return Promise.reject(error);
    }

    originalRequest._retryCount = originalRequest._retryCount || 0;

    if (isAuthExpiredError && originalRequest._retryCount < 1) {
      originalRequest._retryCount += 1;

      try {
        const res = await api.post("/auth/refresh", null, {
          withCredentials: true,
        });
        const newAccessToken = res.data.accessToken;

        useAuthStore.getState().setAccessToken(newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().clearState();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
