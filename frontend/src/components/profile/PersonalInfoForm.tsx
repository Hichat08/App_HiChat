import { Heart, Pencil } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { User } from "@/types/user";
import { userService } from "@/services/userService";
import { useAuthStore } from "@/stores/useAuthStore";

type EditableField = {
  key: keyof Pick<User, "displayName" | "username" | "email" | "phone">;
  label: string;
  type?: string;
};

const PERSONAL_FIELDS: EditableField[] = [
  { key: "displayName", label: "Tên hiển thị" },
  { key: "username", label: "Tên người dùng" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Số điện thoại" },
];

const DISPLAY_NAME_COOLDOWN_DAYS = 7;
const EMAIL_COOLDOWN_DAYS = 30;
const PHONE_COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const getRemainingDays = (lastUpdatedAt: string | undefined, cooldownDays: number) => {
  const baseline = lastUpdatedAt;
  if (!baseline) return 0;
  const passedDays = Math.floor((Date.now() - new Date(baseline).getTime()) / DAY_MS);
  return Math.max(0, cooldownDays - passedDays);
};

const getNextAllowedDate = (lastUpdatedAt: string | undefined, cooldownDays: number) => {
  const baseline = lastUpdatedAt;
  if (!baseline) return null;
  const next = new Date(new Date(baseline).getTime() + cooldownDays * DAY_MS);
  return Number.isNaN(next.getTime())
    ? null
    : next.toLocaleDateString("vi-VN");
};

type Props = {
  userInfo: User | null;
};

const PersonalInfoForm = ({ userInfo }: Props) => {
  const { setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [editingFields, setEditingFields] = useState<
    Partial<Record<"displayName" | "email" | "phone", boolean>>
  >({});
  const [formState, setFormState] = useState({
    displayName: "",
    username: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    if (!userInfo) return;
    setFormState({
      displayName: userInfo.displayName ?? "",
      username: userInfo.username ?? "",
      email: userInfo.email ?? "",
      phone: userInfo.phone ?? "",
    });
    setEditingFields({});
  }, [userInfo]);

  const displayNameRemainingDays = useMemo(
    () => getRemainingDays(userInfo?.displayNameUpdatedAt, DISPLAY_NAME_COOLDOWN_DAYS),
    [userInfo?.displayNameUpdatedAt],
  );
  const displayNameNextDate = useMemo(
    () => getNextAllowedDate(userInfo?.displayNameUpdatedAt, DISPLAY_NAME_COOLDOWN_DAYS),
    [userInfo?.displayNameUpdatedAt],
  );

  const emailRemainingDays = useMemo(
    () => getRemainingDays(userInfo?.emailUpdatedAt, EMAIL_COOLDOWN_DAYS),
    [userInfo?.emailUpdatedAt],
  );
  const emailNextDate = useMemo(
    () => getNextAllowedDate(userInfo?.emailUpdatedAt, EMAIL_COOLDOWN_DAYS),
    [userInfo?.emailUpdatedAt],
  );

  const phoneRemainingDays = useMemo(
    () => getRemainingDays(userInfo?.phoneUpdatedAt, PHONE_COOLDOWN_DAYS),
    [userInfo?.phoneUpdatedAt],
  );
  const phoneNextDate = useMemo(
    () => getNextAllowedDate(userInfo?.phoneUpdatedAt, PHONE_COOLDOWN_DAYS),
    [userInfo?.phoneUpdatedAt],
  );

  if (!userInfo) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { user, message } = await userService.updateProfile(formState);
      setUser(user);
      setEditingFields({});
      toast.success(message || "Đã lưu thay đổi");
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.message || "Không thể cập nhật thông tin cá nhân";
      toast.error(apiMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass-strong border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="size-5 text-primary" />
          Thông tin cá nhân
        </CardTitle>
        <CardDescription>
          Cập nhật chi tiết cá nhân và thông tin hồ sơ của bạn
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form
          className="space-y-4"
          onSubmit={onSubmit}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PERSONAL_FIELDS.map(({ key, label, type }) => {
              const isUsername = key === "username";
              const isDisplayNameLocked = key === "displayName" && displayNameRemainingDays > 0;
              const hasEmail = !!(userInfo.email ?? "").trim();
              const hasPhone = !!(userInfo.phone ?? "").trim();
              const isEmailLocked = key === "email" && hasEmail && emailRemainingDays > 0;
              const isPhoneLocked = key === "phone" && hasPhone && phoneRemainingDays > 0;
              const isLocked = isUsername || isDisplayNameLocked || isEmailLocked || isPhoneLocked;
              const isEditableField =
                key === "displayName" || key === "email" || key === "phone";
              const isEditing = isEditableField ? !!editingFields[key] : false;
              const inputDisabled = isUsername || isLocked || (isEditableField && !isEditing);
              return (
                <div
                  key={key}
                  className="space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={key}>{label}</Label>
                    {isEditableField && !isLocked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full"
                        onClick={() =>
                          setEditingFields((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                        title={isEditing ? "Tắt sửa" : "Sửa"}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                  </div>
                  <Input
                    id={key}
                    type={type ?? "text"}
                    value={formState[key] ?? ""}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className="glass-light border-border/30"
                    disabled={inputDisabled}
                  />
                  {key === "username" && (
                    <p className="text-xs text-muted-foreground">
                      Tên đăng nhập là cố định, không thể thay đổi.
                    </p>
                  )}
                  {key === "email" && !hasEmail && (
                    <p className="text-xs text-muted-foreground">
                      Bạn chưa có email. Bấm biểu tượng bút để thêm email.
                    </p>
                  )}
                  {key === "phone" && !hasPhone && (
                    <p className="text-xs text-muted-foreground">
                      Bạn chưa có số điện thoại. Bấm biểu tượng bút để thêm số điện thoại.
                    </p>
                  )}
                  {key === "displayName" && displayNameRemainingDays > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Có thể đổi tên hiển thị sau {displayNameRemainingDays} ngày nữa
                      {displayNameNextDate ? ` (vào ${displayNameNextDate}).` : "."}
                    </p>
                  )}
                  {key === "email" && hasEmail && emailRemainingDays > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Có thể đổi email sau {emailRemainingDays} ngày nữa
                      {emailNextDate ? ` (vào ${emailNextDate}).` : "."}
                    </p>
                  )}
                  {key === "phone" && hasPhone && phoneRemainingDays > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Có thể đổi số điện thoại sau {phoneRemainingDays} ngày nữa
                      {phoneNextDate ? ` (vào ${phoneNextDate}).` : "."}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full md:w-auto bg-gradient-primary hover:opacity-90 transition-opacity"
          >
            {loading ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default PersonalInfoForm;
