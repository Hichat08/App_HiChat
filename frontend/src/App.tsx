import { BrowserRouter, Route, Routes } from "react-router";
import SignInPage from "./pages/SignInPage";
import ChatAppPage from "./pages/ChatAppPage";
import { Toaster } from "sonner";
import SignUpPage from "./pages/SignUpPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { useThemeStore } from "./stores/useThemeStore";
import { useEffect, useState } from "react";
import { useAuthStore } from "./stores/useAuthStore";
import { useSocketStore } from "./stores/useSocketStore";
import FriendSuggestionsPage from "./pages/FriendSuggestionsPage";
import UserProfilePage from "./pages/UserProfilePage";
import PostsPage from "./pages/PostsPage";
import SettingsPage from "./pages/SettingsPage";
import ArchivePage from "./pages/ArchivePage";
import AdminAntiScamPage from "./pages/AdminAntiScamPage";
import PageLoader from "./components/ui/PageLoader";
import AdminRoute from "./components/auth/AdminRoute";

const AppRoutes = () => {
  const { isDark, setTheme } = useThemeStore();
  const { accessToken } = useAuthStore();
  const { connectSocket, disconnectSocket } = useSocketStore();
  const [loading, setLoading] = useState(true);
  const [initialLoaderDone, setInitialLoaderDone] = useState(
    () => sessionStorage.getItem("hichat-initial-loader") === "1",
  );

  useEffect(() => {
    setTheme(isDark);
  }, [isDark]);

  useEffect(() => {
    if (accessToken) {
      connectSocket();
    }

    return () => disconnectSocket();
  }, [accessToken]);

  useEffect(() => {
    if (initialLoaderDone) {
      setLoading(false);
      return;
    }

    setLoading(true);
    sessionStorage.setItem("hichat-initial-loader", "1");
    setInitialLoaderDone(true);

    const hideTimer = window.setTimeout(() => setLoading(false), 420);
    return () => window.clearTimeout(hideTimer);
  }, [initialLoaderDone]);

  return (
    <>
      <PageLoader open={loading} tone="white" />
      <Routes>
        {/* public routes */}
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />

        {/* protectect routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<PostsPage />} />
          <Route path="/posts" element={<PostsPage />} />
          <Route path="/messages" element={<ChatAppPage />} />
          <Route path="/suggestions" element={<FriendSuggestionsPage />} />
          <Route path="/profile" element={<UserProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/users/:userId" element={<UserProfilePage />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminAntiScamPage />} />
            <Route path="/admin/anti-scam" element={<AdminAntiScamPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
};

function App() {
  return (
    <>
      <Toaster richColors />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </>
  );
}

export default App;
