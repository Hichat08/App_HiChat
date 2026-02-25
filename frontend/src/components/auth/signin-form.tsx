import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Label } from "../ui/label";
import { useAuthStore } from "@/stores/useAuthStore";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Clock3, Mail, Phone, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import { userService } from "@/services/userService";
import { toast } from "sonner";

const signInSchema = z.object({
  username: z.string().min(3, "Tên đăng nhập phải có ít nhất 3 ký tự"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
});

type SignInFormValues = z.infer<typeof signInSchema>;

export function SigninForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { signIn } = useAuthStore();
  const navigate = useNavigate();
  const [deletedInfo, setDeletedInfo] = useState<{
    deletedAt?: string | null;
    displayName?: string;
  } | null>(null);
  const [lockedInfo, setLockedInfo] = useState<{
    lockedAt?: string | null;
    lockReason?: string;
    displayName?: string;
  } | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");
  const [lastAttemptUsername, setLastAttemptUsername] = useState("");
  const [supportHistory, setSupportHistory] = useState<any[]>([]);
  const [supportHistoryLoading, setSupportHistoryLoading] = useState(false);

  const loadSupportHistory = async (silent = false) => {
    const username = lastAttemptUsername?.trim?.().toLowerCase?.();
    if (!username) return;

    try {
      if (!silent) setSupportHistoryLoading(true);
      const result = await userService.listSupportRequestsPublic(username);
      setSupportHistory(result?.requests || []);
    } catch (error) {
      if (!silent) {
        setSupportHistory([]);
      }
    } finally {
      if (!silent) setSupportHistoryLoading(false);
    }
  };
  const deletedAtLabel = useMemo(() => {
    if (!deletedInfo?.deletedAt) return "";
    const time = new Date(deletedInfo.deletedAt);
    if (Number.isNaN(time.getTime())) return "";
    return time.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }, [deletedInfo?.deletedAt]);
  const lockedAtLabel = useMemo(() => {
    if (!lockedInfo?.lockedAt) return "";
    const time = new Date(lockedInfo.lockedAt);
    if (Number.isNaN(time.getTime())) return "";
    return time.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }, [lockedInfo?.lockedAt]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInFormValues) => {
    const { username, password } = data;
    setLastAttemptUsername(username?.trim?.() || "");
    try {
      await signIn(username, password);
      const currentUser = useAuthStore.getState().user;
      if (currentUser?.role === "admin") {
        navigate("/admin/anti-scam");
      } else {
        navigate("/");
      }
    } catch (error) {
      const code = (error as any)?.response?.data?.code;
      const status = (error as any)?.response?.status;
      if (code === "USER_DELETED") {
        setDeletedInfo({
          deletedAt: (error as any)?.response?.data?.deletedAt || null,
          displayName: (error as any)?.response?.data?.displayName || "",
        });
        setLockedInfo(null);
      } else if (code === "USER_LOCKED" || status === 423) {
        setLockedInfo({
          lockedAt: (error as any)?.response?.data?.lockedAt || null,
          lockReason: (error as any)?.response?.data?.lockReason || "",
          displayName:
            (error as any)?.response?.data?.displayName || username || "",
        });
        setDeletedInfo(null);
      }
      // signIn đã hiển thị toast lỗi, không điều hướng khi đăng nhập thất bại
    }
  };

  useEffect(() => {
    if (!lockedInfo) return;
    loadSupportHistory();
  }, [lockedInfo, lastAttemptUsername]);

  useEffect(() => {
    if (!lockedInfo || !supportOpen) return;
    const timer = window.setInterval(() => {
      loadSupportHistory(true);
    }, 7000);
    return () => {
      window.clearInterval(timer);
    };
  }, [lockedInfo, supportOpen, lastAttemptUsername]);

  if (lockedInfo) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card className="mx-auto w-full max-w-[580px] overflow-hidden border-[#eadcff] bg-white shadow-[0_24px_60px_-38px_rgba(109,40,217,0.55)]">
          <CardContent className="p-0">
            <div className="relative overflow-hidden border-b border-[#f1e8ff] px-5 pb-5 pt-6 sm:px-6 sm:pt-7">
              <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-[#d8b4fe]/45 blur-3xl" />
              <div className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 rounded-full bg-[#c4b5fd]/35 blur-3xl" />
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#6d28d9] text-white shadow-[0_10px_24px_rgba(109,40,217,0.35)]">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#5b21b6]">Trạng thái bảo mật</p>
                    <p className="text-xs text-[#7c3aed]/80">HiChat Security</p>
                  </div>
                </div>
                <div className="rounded-full border border-[#e9d5ff] bg-[#faf5ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#7c3aed]">
                  Tạm khóa
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
              <div className="grid gap-6">
                <div className="space-y-3">
                  <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                    {lockedInfo.displayName?.trim()
                      ? `${lockedInfo.displayName}, tài khoản của bạn đã bị khóa`
                      : "Tài khoản của bạn đã bị khóa"}
                  </h1>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Chúng tôi phát hiện hoạt động bất thường. Bạn sẽ tạm thời
                    không thể sử dụng HiChat cho đến khi quản trị viên mở khóa.
                  </p>
                  <div className="rounded-2xl border border-[#ede9fe] bg-[#f8f5ff] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#7c3aed]">
                      Lý do khóa
                    </p>
                    <p className="mt-1 text-sm text-[#4c1d95]">
                      {lockedInfo.lockReason?.trim() ||
                        "Chưa có ghi chú bổ sung."}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <Clock3 className="mr-2 inline h-4 w-4 align-text-bottom" />
                      Thời điểm khóa
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {lockedAtLabel || "Không xác định"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                    <p>
                      <Mail className="mr-2 inline h-4 w-4 align-text-bottom text-[#7c3aed]" />
                      vietinvestt.vn@gmail.com
                    </p>
                    <p className="mt-2">
                      <Phone className="mr-2 inline h-4 w-4 align-text-bottom text-[#7c3aed]" />
                      0395616970
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  className="w-full rounded-full bg-[#7c3aed] text-white hover:bg-[#6d28d9] sm:min-w-[180px] sm:flex-1"
                  onClick={() => setLockedInfo(null)}
                >
                  Quay lại đăng nhập
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-full border-[#ddd6fe] text-[#5b21b6] hover:bg-[#f5f3ff] sm:min-w-[180px] sm:flex-1"
                  onClick={() => setSupportOpen(true)}
                >
                  Liên hệ hỗ trợ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-full border-[#ddd6fe] text-[#5b21b6] hover:bg-[#f5f3ff] sm:min-w-[180px] sm:flex-1"
                  onClick={() => navigate("/signup")}
                >
                  Tạo tài khoản mới
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
          <DialogContent className="w-[calc(100vw-20px)] max-w-[430px] rounded-xl p-0">
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle>Chat hỗ trợ mở khóa</DialogTitle>
              <DialogDescription>
                Nhập nội dung để gửi yêu cầu mở khóa cho admin.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 px-4 py-3">
              <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-slate-600">
                <p>
                  <Mail className="mr-2 inline h-4 w-4 align-text-bottom" />
                  Email hỗ trợ: <span className="font-semibold">vietinvestt.vn@gmail.com</span>
                </p>
                <p className="mt-1">
                  <Phone className="mr-2 inline h-4 w-4 align-text-bottom" />
                  Hotline: <span className="font-semibold">0395616970</span>
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Phần phản hồi sẽ tự làm mới mỗi vài giây khi cửa sổ này đang mở.
                </p>
              </div>
              <Textarea
                value={supportMessage}
                onChange={(event) => setSupportMessage(event.target.value)}
                placeholder="Nhập nội dung gửi admin..."
                className="min-h-[72px] rounded-xl"
              />
              <div className="max-h-40 overflow-y-auto rounded-xl border bg-muted/20 p-3">
                <p className="text-sm font-semibold text-slate-700">
                  Phản hồi từ admin
                </p>
                {supportHistoryLoading ? (
                  <p className="mt-2 text-xs text-slate-500">Đang tải phản hồi...</p>
                ) : null}
                {!supportHistoryLoading &&
                supportHistory.some((item) => item?.adminReply?.message) ? (
                  <div className="mt-2 space-y-2">
                    {supportHistory
                      .filter((item) => item?.adminReply?.message)
                      .slice(0, 3)
                      .map((item) => (
                        <div key={item._id} className="rounded-lg border bg-white px-3 py-2">
                          <p className="text-sm text-slate-700">
                            {item?.adminReply?.message}
                          </p>
                        </div>
                      ))}
                  </div>
                ) : null}
                {!supportHistoryLoading &&
                !supportHistory.some((item) => item?.adminReply?.message) ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Chưa có phản hồi nào từ admin.
                  </p>
                ) : null}
              </div>
            </div>
            <DialogFooter className="gap-2 px-4 py-3">
              <Button variant="outline" onClick={() => setSupportOpen(false)}>
                Đóng
              </Button>
              <Button
                onClick={async () => {
                  if (!supportMessage.trim()) return;
                  try {
                    setSupportLoading(true);
                    await userService.sendSupportMessagePublic({
                      message: supportMessage.trim(),
                      displayName: lockedInfo?.displayName || undefined,
                      username: lastAttemptUsername || undefined,
                    });
                    await loadSupportHistory(true);
                    setSupportMessage("");
                    toast.success("Đã gửi yêu cầu hỗ trợ");
                  } catch (error: any) {
                    console.error("Lỗi gửi hỗ trợ", error);
                    // show message from server if available
                    const message =
                      error?.response?.data?.message || "Không thể gửi yêu cầu";
                    toast.error(message);
                  } finally {
                    setSupportLoading(false);
                  }
                }}
                disabled={!supportMessage.trim() || supportLoading}
              >
                {supportLoading ? "Đang gửi..." : "Gửi yêu cầu"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (deletedInfo) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card className="overflow-hidden border-border">
          <CardContent className="p-0">
            <div className="relative overflow-hidden border-b bg-gradient-to-br from-[#fff1f2] via-[#ffe4e6] to-[#ffe4f1] px-6 py-8">
              <div className="pointer-events-none absolute -left-10 top-0 h-28 w-28 rounded-full bg-rose-200/60 blur-2xl" />
              <div className="pointer-events-none absolute right-6 top-6 h-14 w-14 rounded-full border border-white/70" />
              <div className="relative grid items-center gap-4 md:grid-cols-[1fr_auto]">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/90 text-rose-600 shadow-[0_10px_30px_rgba(225,29,72,0.15)]">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-rose-700">
                      Thông báo tài khoản
                    </p>
                    <p className="text-xs text-rose-700/70">
                      HiChat xác nhận trạng thái
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-3 text-right shadow-[0_12px_40px_rgba(225,29,72,0.15)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">
                    Tài khoản đã xoá
                  </p>
                  <p className="text-[11px] text-rose-600/80">
                    Không thể khôi phục
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8">
              <div className="space-y-2">
                <h1 className="text-2xl font-bold">
                  {deletedInfo.displayName?.trim()
                    ? `${deletedInfo.displayName}, tài khoản đã bị xoá`
                    : "Tài khoản đã bị xoá"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Tài khoản của bạn đã bị xoá khỏi hệ thống. Bạn cần tạo tài
                  khoản mới để tiếp tục sử dụng HiChat.
                </p>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-muted/40 px-4 py-3">
                  <p className="text-sm font-medium">Ngày xoá tài khoản</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {deletedAtLabel || "Không xác định"}
                  </p>
                </div>
                <div className="rounded-xl border border-rose-200/60 bg-rose-50/60 px-4 py-3">
                  <p className="text-sm font-medium text-rose-700">Lưu ý</p>
                  <p className="mt-1 text-sm text-rose-700/80">
                    Dữ liệu cũ không còn tồn tại trong hệ thống.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    setDeletedInfo(null);
                  }}
                >
                  Quay lại đăng nhập
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-rose-200 text-rose-700 hover:bg-rose-50"
                  onClick={() => navigate("/signup")}
                >
                  Tạo tài khoản mới
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0 border-border">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-6">
              {/* header - logo */}
              <div className="flex flex-col items-center text-center gap-2">
                <a href="/" className="mx-auto block w-fit text-center">
                  <img src="/logo.svg" alt="logo" />
                </a>

                <h1 className="text-2xl font-bold">Chào mừng quay lại</h1>
                <p className="text-muted-foreground text-balance">
                  Đăng nhập vào tài khoản HiChat của bạn
                </p>
              </div>

              {/* username */}
              <div className="flex flex-col gap-3">
                <Label htmlFor="username" className="block text-sm">
                  Tên đăng nhập
                </Label>
                <Input
                  type="text"
                  id="username"
                  placeholder="hichat"
                  {...register("username")}
                />
                {errors.username && (
                  <p className="text-destructive text-sm">
                    {errors.username.message}
                  </p>
                )}
              </div>

              {/* password */}
              <div className="flex flex-col gap-3">
                <Label htmlFor="password" className="block text-sm">
                  Mật khẩu
                </Label>
                <Input
                  type="password"
                  id="password"
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-destructive text-sm">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* nút đăng nhập */}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                Đăng nhập
              </Button>

              <div className="text-center text-sm">
                Chưa có tài khoản?{" "}
                <a href="/signup" className="underline underline-offset-4">
                  Đăng ký
                </a>
              </div>
            </div>
          </form>
          <div className="bg-muted relative hidden md:block">
            <img
              src="/placeholder.png"
              alt="Image"
              className="absolute top-1/2 -translate-y-1/2 object-cover"
            />
          </div>
        </CardContent>
      </Card>
      <div className="px-6 text-center text-xs text-balance text-muted-foreground *:[a]:underline *:[a]:underline-offset-4 *:[a]:hover:text-primary">
        Bằng cách tiếp tục, bạn đồng ý với <a href="#">Điều khoản dịch vụ</a> và{" "}
        <a href="#">Chính sách bảo mật</a> của chúng tôi.
      </div>
    </div>
  );
}
