import { useAuthStore } from "@/stores/useAuthStore";
import { useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Clock3, Mail, Phone, ShieldAlert } from "lucide-react";
import PageLoader from "@/components/ui/PageLoader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { userService } from "@/services/userService";
import { toast } from "sonner";

type SupportTimelineMessage = {
  id: string;
  content: string;
  sender: "user" | "system" | "admin";
  createdAt: string;
};

const ProtectedRoute = () => {
  const { accessToken, user, loading, refresh, fetchMe } = useAuthStore();
  const location = useLocation();
  const [starting, setStarting] = useState(true);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportMessages, setSupportMessages] = useState<SupportTimelineMessage[]>([]);
  const [supportMessage, setSupportMessage] = useState("");

  const buildSupportTimeline = (rows: any[] = []) => {
    const timeline = rows.flatMap((row: any) => {
      const list: SupportTimelineMessage[] = [
        {
          id: `req-${row._id}`,
          content: row.message,
          sender: "user" as const,
          createdAt: row.createdAt,
        },
      ];
      if (row?.adminReply?.message) {
        list.push({
          id: `reply-${row._id}`,
          content: row.adminReply.message,
          sender: "admin" as const,
          createdAt: row.adminReply.createdAt || row.updatedAt || row.createdAt,
        });
      }
      return list;
    });

    timeline.sort(
      (a: any, b: any) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    if (timeline.length > 0) return timeline;

    return [
      {
        id: `system-${Date.now()}`,
        content:
          "Bạn đang kết nối với hỗ trợ HiChat. Hãy gửi yêu cầu mở khóa để admin xử lý.",
        sender: "system" as const,
        createdAt: new Date().toISOString(),
      },
    ];
  };

  const fetchSupportTimeline = async (silent = false) => {
    const username = user?.username?.toString?.().trim?.().toLowerCase?.();
    if (!username) return;

    try {
      if (!silent) setSupportLoading(true);
      const history = await userService.listSupportRequestsPublic(username);
      const rows = history?.requests || [];
      setSupportMessages(buildSupportTimeline(rows));
    } catch (error) {
      if (!silent) {
        console.error("Lỗi khi tải chat hỗ trợ", error);
      }
    } finally {
      if (!silent) setSupportLoading(false);
    }
  };
  const lockedAtLabel = useMemo(() => {
    if (!user?.lockedAt) return "";
    const time = new Date(user.lockedAt);
    if (Number.isNaN(time.getTime())) return "";
    return time.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }, [user?.lockedAt]);

  const init = async () => {
    try {
      // Có thể xảy ra khi refresh trang.
      // Luôn đọc state mới nhất từ store sau refresh để tránh dùng giá trị cũ.
      if (!useAuthStore.getState().accessToken) {
        await refresh();
      }

      const latest = useAuthStore.getState();
      if (latest.accessToken && !latest.user) {
        await fetchMe();
      }
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (!supportOpen) return;

    fetchSupportTimeline();
    const timer = window.setInterval(() => {
      fetchSupportTimeline(true);
    }, 7000);

    return () => {
      window.clearInterval(timer);
    };
  }, [supportOpen, user?.username]);

  if (starting || loading) {
    const hasShownInitialLoader =
      sessionStorage.getItem("hichat-initial-loader") === "1";
    return hasShownInitialLoader ? null : <PageLoader open tone="white" />;
  }

  if (!accessToken) {
    return (
      <Navigate
        to="/signin"
        replace
      />
    );
  }

  if (user?.role === "admin" && !location.pathname.startsWith("/admin/")) {
    return <Navigate to="/admin/anti-scam" replace />;
  }

  if (user?.isLocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white via-[#f6efff] to-[#f3e8ff] px-3 py-5 sm:px-4 sm:py-8">
        <div className="w-full max-w-[580px] overflow-hidden rounded-3xl border border-[#eadcff] bg-white shadow-[0_24px_60px_-38px_rgba(109,40,217,0.55)]">
          <div className="relative overflow-hidden border-b border-[#f1e8ff] px-5 pb-5 pt-6 sm:px-6 sm:pt-7">
            <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-[#d8b4fe]/45 blur-3xl" />
            <div className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 rounded-full bg-[#c4b5fd]/35 blur-3xl" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
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
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Tài khoản của bạn đang tạm khóa
            </h1>
            <p className="text-sm leading-relaxed text-slate-600">
              Hệ thống phát hiện hoạt động cần xác minh. Bạn hãy gửi yêu cầu hỗ trợ,
              phản hồi từ admin sẽ tự làm mới trong cửa sổ chat.
            </p>

            <div className="rounded-2xl border border-[#ede9fe] bg-[#f8f5ff] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#7c3aed]">
                Lý do khóa
              </p>
              <p className="mt-2 text-sm text-[#4c1d95]">
                {user.lockReason?.trim() || "Chưa có ghi chú bổ sung."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Clock3 className="mr-2 inline h-4 w-4 align-text-bottom" />
                  Thời điểm khóa
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {lockedAtLabel || "Không xác định"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
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

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                className="w-full rounded-full bg-[#7c3aed] text-white hover:bg-[#6d28d9] sm:flex-1"
                onClick={() => setSupportOpen(true)}
              >
                Mở chat hỗ trợ
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full border-[#ddd6fe] text-[#5b21b6] hover:bg-[#f5f3ff] sm:flex-1"
                onClick={() => useAuthStore.getState().signOut()}
              >
                Đăng xuất
              </Button>
            </div>
          </div>
        </div>
        <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
          <DialogContent className="w-[calc(100vw-20px)] max-w-[430px] rounded-xl p-0">
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle>Chat hỗ trợ mở khóa</DialogTitle>
              <DialogDescription>
                Hãy gửi thông tin để admin kiểm tra và mở khóa nhanh hơn.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 px-4 py-3">
              <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-slate-600">
                <p>
                  Email hỗ trợ: <span className="font-semibold">vietinvestt.vn@gmail.com</span>
                </p>
                <p>
                  Hotline: <span className="font-semibold">0395616970</span>
                </p>
              </div>
              <div className="max-h-40 space-y-3 overflow-y-auto rounded-xl border bg-white px-4 py-3">
                {supportLoading && (
                  <p className="text-sm text-muted-foreground">Đang kết nối với admin...</p>
                )}
                {!supportLoading && supportMessages.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Chưa có tin nhắn. Hãy gửi yêu cầu mở khóa của bạn.
                  </p>
                )}
                {!supportLoading &&
                  supportMessages.map((msg) => {
                    const isOwn = msg.sender === "user";
                    const isSystem = msg.sender === "system";
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                            isSystem
                              ? "bg-slate-100 text-slate-600"
                            : isOwn
                                ? "bg-[#6d28d9] text-white"
                                : msg.sender === "admin"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-muted text-slate-700"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    );
                  })}
              </div>
              <Textarea
                value={supportMessage}
                onChange={(event) => setSupportMessage(event.target.value)}
                placeholder="Nhập nội dung gửi admin..."
                className="min-h-[72px] rounded-xl"
              />
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
                    await userService.sendSupportMessage(supportMessage.trim());
                    setSupportMessage("");
                    await fetchSupportTimeline(true);
                    toast.success("Đã gửi yêu cầu hỗ trợ");
                  } catch (error) {
                    console.error("Lỗi khi gửi hỗ trợ", error);
                    toast.error("Không thể gửi tin nhắn");
                  } finally {
                    setSupportLoading(false);
                  }
                }}
                disabled={!supportMessage.trim() || supportLoading}
              >
                Gửi yêu cầu
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return <Outlet></Outlet>;
};

export default ProtectedRoute;
