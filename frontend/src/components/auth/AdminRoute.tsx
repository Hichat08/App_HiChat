import { Navigate, Outlet } from "react-router";
import { useAuthStore } from "@/stores/useAuthStore";

const AdminRoute = () => {
  const { user, loading } = useAuthStore();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  return <Outlet />;
};

export default AdminRoute;
