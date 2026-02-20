import { useState } from "react";
import { useNavigate } from "react-router";
import { Bell, Shield, ShieldBan } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { userService } from "@/services/userService";
import { useAuthStore } from "@/stores/useAuthStore";

const PrivacySettings = () => {
  const navigate = useNavigate();
  const { user, clearState } = useAuthStore();

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [notificationSettings, setNotificationSettings] = useState({
    messageAlerts: user?.notificationSettings?.messageAlerts ?? true,
    friendRequestAlerts: user?.notificationSettings?.friendRequestAlerts ?? true,
    securityAlerts: user?.notificationSettings?.securityAlerts ?? true,
  });
  const [reportForm, setReportForm] = useState({
    username: "",
    reason: "",
    detail: "",
    blockUser: true,
  });
  const [deletePassword, setDeletePassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    try {
      setLoading(true);
      await userService.changePassword(
        passwordForm.currentPassword.trim(),
        passwordForm.newPassword.trim(),
      );
      toast.success("Đổi mật khẩu thành công, vui lòng đăng nhập lại");
      clearState();
      navigate("/signin");
    } catch (error: any) {
      console.error("Lỗi khi đổi mật khẩu", error);
      toast.error(error?.response?.data?.message || "Không thể đổi mật khẩu");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotifications = async () => {
    try {
      setLoading(true);
      await userService.updateNotificationSettings(notificationSettings);
      toast.success("Đã cập nhật cài đặt thông báo");
    } catch (error: any) {
      console.error("Lỗi khi cập nhật cài đặt thông báo", error);
      toast.error(error?.response?.data?.message || "Không thể cập nhật cài đặt");
    } finally {
      setLoading(false);
    }
  };

  const handleBlockAndReport = async () => {
    try {
      setLoading(true);
      await userService.blockAndReportUser({
        username: reportForm.username.trim(),
        reason: reportForm.reason.trim(),
        detail: reportForm.detail.trim(),
        blockUser: reportForm.blockUser,
      });
      toast.success(
        reportForm.blockUser
          ? "Đã chặn và báo cáo người dùng"
          : "Đã gửi báo cáo người dùng",
      );
      setReportForm({ username: "", reason: "", detail: "", blockUser: true });
    } catch (error: any) {
      console.error("Lỗi khi chặn/báo cáo", error);
      toast.error(error?.response?.data?.message || "Không thể xử lý yêu cầu");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setLoading(true);
      await userService.deleteMyAccount(deletePassword.trim());
      toast.success("Đã xoá tài khoản");
      clearState();
      navigate("/signin");
    } catch (error: any) {
      console.error("Lỗi khi xoá tài khoản", error);
      toast.error(error?.response?.data?.message || "Không thể xoá tài khoản");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass-strong border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Quyền riêng tư & Bảo mật
        </CardTitle>
        <CardDescription>
          Quản lý cài đặt quyền riêng tư và bảo mật của bạn
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start glass-light border-border/30 hover:text-warning"
              >
                <Shield className="h-4 w-4 mr-2" />
                Đổi mật khẩu
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Đổi mật khẩu</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="current-password">Mật khẩu hiện tại</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        currentPassword: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-password">Mật khẩu mới</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        newPassword: e.target.value,
                      }))
                    }
                  />
                </div>
                <Button className="w-full" disabled={loading} onClick={handleChangePassword}>
                  Xác nhận đổi mật khẩu
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start glass-light border-border/30 hover:text-info"
              >
                <Bell className="h-4 w-4 mr-2" />
                Cài đặt thông báo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cài đặt thông báo</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="msg-alert">Thông báo tin nhắn</Label>
                  <Switch
                    id="msg-alert"
                    checked={notificationSettings.messageAlerts}
                    onCheckedChange={(v) =>
                      setNotificationSettings((prev) => ({ ...prev, messageAlerts: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="friend-alert">Thông báo kết bạn</Label>
                  <Switch
                    id="friend-alert"
                    checked={notificationSettings.friendRequestAlerts}
                    onCheckedChange={(v) =>
                      setNotificationSettings((prev) => ({
                        ...prev,
                        friendRequestAlerts: v,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="security-alert">Cảnh báo bảo mật</Label>
                  <Switch
                    id="security-alert"
                    checked={notificationSettings.securityAlerts}
                    onCheckedChange={(v) =>
                      setNotificationSettings((prev) => ({ ...prev, securityAlerts: v }))
                    }
                  />
                </div>
                <Button className="w-full" disabled={loading} onClick={handleSaveNotifications}>
                  Lưu cài đặt
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start glass-light border-border/30 hover:text-destructive"
              >
                <ShieldBan className="size-4 mr-2" />
                Chặn & Báo cáo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Chặn & Báo cáo người dùng</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="report-username">Username</Label>
                  <Input
                    id="report-username"
                    placeholder="nhập username cần xử lý"
                    value={reportForm.username}
                    onChange={(e) =>
                      setReportForm((prev) => ({ ...prev, username: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="report-reason">Lý do</Label>
                  <Input
                    id="report-reason"
                    placeholder="Spam / Quấy rối / Giả mạo..."
                    value={reportForm.reason}
                    onChange={(e) =>
                      setReportForm((prev) => ({ ...prev, reason: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="report-detail">Chi tiết</Label>
                  <Textarea
                    id="report-detail"
                    rows={3}
                    value={reportForm.detail}
                    onChange={(e) =>
                      setReportForm((prev) => ({ ...prev, detail: e.target.value }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="also-block">Đồng thời chặn người dùng này</Label>
                  <Switch
                    id="also-block"
                    checked={reportForm.blockUser}
                    onCheckedChange={(v) =>
                      setReportForm((prev) => ({ ...prev, blockUser: v }))
                    }
                  />
                </div>
                <Button className="w-full" disabled={loading} onClick={handleBlockAndReport}>
                  Gửi xử lý
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="pt-4 border-t border-border/30">
          <h4 className="font-medium mb-3 text-destructive">Khu vực nguy hiểm</h4>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                Xoá tài khoản
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Xác nhận xoá tài khoản</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Hành động này không thể hoàn tác. Vui lòng nhập mật khẩu để xác nhận.
                </p>
                <Input
                  type="password"
                  placeholder="Nhập mật khẩu"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={loading}
                  onClick={handleDeleteAccount}
                >
                  Xoá tài khoản vĩnh viễn
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
};

export default PrivacySettings;
