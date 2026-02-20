import { Sun, Moon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { userService } from "@/services/userService";
import { toast } from "sonner";
import { useState } from "react";

const PreferencesForm = () => {
  const { isDark, toggleTheme } = useThemeStore();
  const { user, setUser } = useAuthStore();
  const [updatingOnlineStatus, setUpdatingOnlineStatus] = useState(false);

  const onlineStatus = user?.showOnlineStatus ?? true;

  const handleToggleOnlineStatus = async (checked: boolean) => {
    if (!user) return;

    try {
      setUpdatingOnlineStatus(true);
      await userService.updateOnlineVisibility(checked);
      setUser({ ...user, showOnlineStatus: checked });
      toast.success(
        checked
          ? "Đã bật hiển thị trạng thái online"
          : "Đã tắt hiển thị trạng thái online",
      );
    } catch (error: any) {
      console.error("Lỗi khi cập nhật trạng thái online", error);
      toast.error(
        error?.response?.data?.message || "Không thể cập nhật trạng thái online",
      );
    } finally {
      setUpdatingOnlineStatus(false);
    }
  };

  return (
    <Card className="glass-strong border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sun className="h-5 w-5 text-primary" />
          Tuỳ chỉnh ứng dụng
        </CardTitle>
        <CardDescription>Cá nhân hoá trải nghiệm trò chuyện của bạn</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Dark Mode */}
        <div className="flex items-center justify-between">
          <div>
            <Label
              htmlFor="theme-toggle"
              className="text-base font-medium"
            >
              Chế độ tối
            </Label>
            <p className="text-sm text-muted-foreground">
              Chuyển đổi giữa giao diện sáng và tối
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4 text-muted-foreground" />
            <Switch
              id="theme-toggle"
              checked={isDark}
              onCheckedChange={toggleTheme}
              className="data-[state=checked]:bg-primary-glow"
            />
            <Moon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {/* Online Status */}
        <div className="flex items-center justify-between">
          <div>
            <Label
              htmlFor="online-status"
              className="text-base font-medium"
            >
              Hiển thị trạng thái online
            </Label>
            <p className="text-sm text-muted-foreground">
              Cho phép người khác thấy khi bạn đang online
            </p>
          </div>
          <Switch
            id="online-status"
            checked={onlineStatus}
            onCheckedChange={handleToggleOnlineStatus}
            disabled={updatingOnlineStatus}
            className="data-[state=checked]:bg-primary-glow"
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default PreferencesForm;
