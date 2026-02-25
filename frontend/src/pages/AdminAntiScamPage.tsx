import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Activity,
  Ban,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  FileText,
  Flag,
  LayoutDashboard,
  Lock,
  Megaphone,
  MessageCircle,
  Search,
  Settings,
  Shield,
  ChevronDown,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import VerifiedBadge from "@/components/ui/verified-badge";
import { userService } from "@/services/userService";
import { postService } from "@/services/postService";
import type { User } from "@/types/user";

type AdminSection =
  | "dashboard"
  | "users"
  | "posts"
  | "reports"
  | "groups"
  | "support"
  | "content"
  | "roles"
  | "system"
  | "logs";

const sidebarItems: Array<{ id: AdminSection; label: string; icon: ReactNode; description: string }> = [
  {
    id: "dashboard",
    label: "Tổng quan",
    description: "Theo dõi chỉ số hệ thống",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  { id: "users", label: "Người dùng", description: "Quản lý tài khoản", icon: <Users className="h-4 w-4" /> },
  { id: "posts", label: "Bài viết", description: "Kiểm duyệt nội dung", icon: <FileText className="h-4 w-4" /> },
  { id: "reports", label: "Báo cáo", description: "Xử lý vi phạm", icon: <Flag className="h-4 w-4" /> },
  { id: "groups", label: "Nhóm", description: "Theo dõi nhóm chat", icon: <BookOpen className="h-4 w-4" /> },
  { id: "support", label: "Hỗ trợ", description: "Phản hồi người dùng", icon: <MessageCircle className="h-4 w-4" /> },
  { id: "content", label: "Nội dung", description: "Quản trị nội dung", icon: <Activity className="h-4 w-4" /> },
  { id: "roles", label: "Phân quyền", description: "Quyền quản trị", icon: <Shield className="h-4 w-4" /> },
  { id: "system", label: "Cài đặt hệ thống", description: "Thiết lập vận hành", icon: <Settings className="h-4 w-4" /> },
  { id: "logs", label: "Nhật ký", description: "Lịch sử thao tác", icon: <BarChart3 className="h-4 w-4" /> },
];

const formatDate = (value?: string | null) => {
  if (!value) return "Không rõ";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Không rõ";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Không rõ";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Không rõ";
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const cleanReportReason = (reason?: string | null) =>
  (reason || "")
    .replace(/^Báo cáo đặc biệt \(tài khoản bị khóa\):\s*/i, "")
    .trim();

const AdminAntiScamPage = () => {
  const [active, setActive] = useState<AdminSection>("dashboard");
  const [dashboard, setDashboard] = useState<{
    totalUsers: number;
    totalPosts: number;
    messagesToday: number;
    callsToday: number;
    reportedAccounts: number;
    growth: Array<{ date: string; count: number }>;
  } | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [userKeyword, setUserKeyword] = useState("");
  const [userStatus, setUserStatus] = useState<"all" | "active" | "banned">("all");
  const [userList, setUserList] = useState<Array<User & { postCount?: number }>>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [verificationRequests, setVerificationRequests] = useState<any[]>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationActionLoadingId, setVerificationActionLoadingId] = useState<string | null>(null);

  const [postKeyword, setPostKeyword] = useState("");
  const [postStatus, setPostStatus] = useState<"active" | "hidden" | "deleted" | "all">("all");
  const [postList, setPostList] = useState<any[]>([]);
  const [postLoading, setPostLoading] = useState(false);

  const [reports, setReports] = useState<any[]>([]);
  const [postReports, setPostReports] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportStatusFilter, setReportStatusFilter] = useState<"all" | "pending" | "resolved">("all");
  const [reportActionLoadingId, setReportActionLoadingId] = useState<string | null>(null);
  const [reportSummary, setReportSummary] = useState({
    pendingCount: 0,
    resolvedCount: 0,
  });
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [notifyMode, setNotifyMode] = useState<"all" | "selected">("all");
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyKeyword, setNotifyKeyword] = useState("");
  const [notifyTarget, setNotifyTarget] = useState<User | null>(null);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifySearchLoading, setNotifySearchLoading] = useState(false);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [bannerPreview, setBannerPreview] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [groupReports, setGroupReports] = useState<any[]>([]);
  const [groupReportLoading, setGroupReportLoading] = useState(false);
  const [supportRequests, setSupportRequests] = useState<any[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportReplyOpen, setSupportReplyOpen] = useState(false);
  const [supportReplyTarget, setSupportReplyTarget] = useState<User | null>(null);
  const [supportReplyRequestId, setSupportReplyRequestId] = useState<string | null>(null);
  const [supportReplyMessage, setSupportReplyMessage] = useState("");
  const [supportReplyLoading, setSupportReplyLoading] = useState(false);
  const [supportStatusLoading, setSupportStatusLoading] = useState<string | null>(null);

  const [adminSearchKeyword, setAdminSearchKeyword] = useState("");
  const [adminCandidate, setAdminCandidate] = useState<User | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockDialogTarget, setLockDialogTarget] = useState<User | null>(null);
  const [lockDialogReason, setLockDialogReason] = useState("");
  const [lockDialogMode, setLockDialogMode] = useState<"lock" | "unlock">("lock");
  const [lockDialogLoading, setLockDialogLoading] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetDialogTarget, setResetDialogTarget] = useState<User | null>(null);
  const [resetDialogPassword, setResetDialogPassword] = useState("");
  const [resetDialogLoading, setResetDialogLoading] = useState(false);
  const [warnDialogOpen, setWarnDialogOpen] = useState(false);
  const [warnDialogTarget, setWarnDialogTarget] = useState<User | null>(null);
  const [warnDialogReason, setWarnDialogReason] = useState("");
  const [warnDialogLoading, setWarnDialogLoading] = useState(false);
  const [streakConversationId, setStreakConversationId] = useState("");
  const [streakDisplayNameA, setStreakDisplayNameA] = useState("");
  const [streakDisplayNameB, setStreakDisplayNameB] = useState("");
  const [streakAmount, setStreakAmount] = useState("1");
  const [streakReason, setStreakReason] = useState("");
  const [streakActionLoading, setStreakActionLoading] = useState<
    "increase" | "decrease" | "reset" | null
  >(null);
  const [streakResolveLoading, setStreakResolveLoading] = useState(false);
  const [pendingSignals, setPendingSignals] = useState({
    verification: 0,
    reports: 0,
    support: 0,
    groups: 0,
  });

  const growthMax = useMemo(() => {
    const max = Math.max(...(dashboard?.growth || []).map((g) => g.count), 1);
    return max || 1;
  }, [dashboard?.growth]);

  const activeSectionMeta = useMemo(
    () => sidebarItems.find((item) => item.id === active),
    [active],
  );
  const totalPendingSignals = useMemo(
    () =>
      pendingSignals.verification +
      pendingSignals.reports +
      pendingSignals.support +
      pendingSignals.groups,
    [pendingSignals],
  );

  const getSectionPendingCount = (section: AdminSection) => {
    if (section === "users") return pendingSignals.verification;
    if (section === "reports") return pendingSignals.reports;
    if (section === "support") return pendingSignals.support;
    if (section === "groups") return pendingSignals.groups;
    return 0;
  };

  const lockedAccountSpecialReports = useMemo(
    () =>
      (reports || []).filter((report) =>
        `${report?.reason || ""}`.startsWith("Báo cáo đặc biệt (tài khoản bị khóa)"),
      ),
    [reports],
  );

  const normalUserReports = useMemo(
    () =>
      (reports || []).filter(
        (report) =>
          !`${report?.reason || ""}`.startsWith("Báo cáo đặc biệt (tài khoản bị khóa)"),
      ),
    [reports],
  );

  const loadDashboard = async () => {
    try {
      setDashboardLoading(true);
      const result = await userService.getAdminDashboard();
      setDashboard(result);
    } catch (error) {
      console.error("Lỗi dashboard", error);
      toast.error("Không thể tải dashboard");
    } finally {
      setDashboardLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      setUserLoading(true);
      const result = await userService.listAdminUsers({
        keyword: userKeyword.trim(),
        status: userStatus,
        limit: 30,
      });
      setUserList(result?.users || []);
    } catch (error) {
      console.error("Lỗi list users", error);
      toast.error("Không thể tải danh sách user");
    } finally {
      setUserLoading(false);
    }
  };

  const loadVerificationRequests = async () => {
    try {
      setVerificationLoading(true);
      const result = await userService.listVerificationRequestsAdmin({
        status: "pending",
        limit: 30,
      });
      setVerificationRequests(result?.requests || []);
    } catch (error) {
      console.error("Lỗi tải danh sách yêu cầu xác minh", error);
      toast.error("Không thể tải yêu cầu tích xanh");
    } finally {
      setVerificationLoading(false);
    }
  };

  const loadPosts = async () => {
    try {
      setPostLoading(true);
      const result = await postService.listAdminPosts({
        keyword: postKeyword.trim() || undefined,
        status: postStatus === "all" ? undefined : postStatus,
        limit: 30,
      });
      setPostList(result?.posts || []);
    } catch (error) {
      console.error("Lỗi list posts", error);
      toast.error("Không thể tải danh sách bài viết");
    } finally {
      setPostLoading(false);
    }
  };

  const loadReports = async () => {
    try {
      setReportLoading(true);
      const includeHiddenResolved = reportStatusFilter === "resolved";
      const [userReportResult, postReportResult] = await Promise.all([
        userService.listUserReports(50, undefined, reportStatusFilter, includeHiddenResolved),
        postService.listPostReports(50, undefined, reportStatusFilter, includeHiddenResolved),
      ]);
      setReports(userReportResult?.reports || []);
      setPostReports(postReportResult?.reports || []);
      setReportSummary({
        pendingCount:
          Number(userReportResult?.summary?.pendingCount || 0) +
          Number(postReportResult?.summary?.pendingCount || 0),
        resolvedCount:
          Number(userReportResult?.summary?.resolvedCount || 0) +
          Number(postReportResult?.summary?.resolvedCount || 0),
      });
    } catch (error) {
      console.error("Lỗi list reports", error);
      toast.error("Không thể tải danh sách báo cáo");
    } finally {
      setReportLoading(false);
    }
  };

  const handleResolveUserReport = async (reportId: string, resolved = true) => {
    try {
      setReportActionLoadingId(`user-${reportId}`);
      if (resolved) {
        await userService.resolveUserReport(reportId, true);
        await userService.hideUserReport(reportId, true);
      } else {
        await userService.deleteUserReport(reportId);
      }
      await loadReports();
      await loadPendingSignals();
      toast.success(resolved ? "Đã xử lý và xóa lịch sử báo cáo user" : "Đã xóa lịch sử báo cáo user");
    } catch (error) {
      console.error("Lỗi cập nhật xử lý báo cáo user", error);
      toast.error("Không thể cập nhật trạng thái báo cáo");
    } finally {
      setReportActionLoadingId(null);
    }
  };

  const handleResolvePostReport = async (reportId: string, resolved = true) => {
    try {
      setReportActionLoadingId(`post-${reportId}`);
      if (resolved) {
        await postService.resolvePostReport(reportId, true);
        await postService.hidePostReport(reportId, true);
      } else {
        await postService.deletePostReport(reportId);
      }
      await loadReports();
      await loadPendingSignals();
      toast.success(resolved ? "Đã xử lý và xóa lịch sử báo cáo bài viết" : "Đã xóa lịch sử báo cáo bài viết");
    } catch (error) {
      console.error("Lỗi cập nhật xử lý báo cáo bài viết", error);
      toast.error("Không thể cập nhật trạng thái báo cáo");
    } finally {
      setReportActionLoadingId(null);
    }
  };

  const loadGroupReports = async () => {
    try {
      setGroupReportLoading(true);
      const result = await userService.listGroupReports(50);
      setGroupReports(result?.reports || []);
    } catch (error) {
      console.error("Lỗi list group reports", error);
      toast.error("Không thể tải báo cáo nhóm");
    } finally {
      setGroupReportLoading(false);
    }
  };

  const loadSupportRequests = async () => {
    try {
      setSupportLoading(true);
      const result = await userService.listSupportRequests(50);
      const openRequests = (result?.requests || []).filter(
        (request: any) => request?.status !== "closed",
      );
      setSupportRequests(openRequests);
    } catch (error) {
      console.error("Lỗi list support requests", error);
      toast.error("Không thể tải hỗ trợ người dùng");
    } finally {
      setSupportLoading(false);
    }
  };

  const loadPendingSignals = async () => {
    try {
      const [verifyResult, userReportResult, postReportResult, supportResult, groupResult] =
        await Promise.all([
          userService.listVerificationRequestsAdmin({ status: "pending", limit: 100 }),
          userService.listUserReports(1, undefined, "pending", false),
          postService.listPostReports(1, undefined, "pending", false),
          userService.listSupportRequests(100),
          userService.listGroupReports(100, undefined, "pending", false),
        ]);

      const supportOpenCount = (supportResult?.requests || []).filter(
        (request: any) => request?.status !== "closed",
      ).length;

      setPendingSignals({
        verification: Number(verifyResult?.requests?.length || 0),
        reports:
          Number(userReportResult?.summary?.pendingCount || 0) +
          Number(postReportResult?.summary?.pendingCount || 0),
        support: supportOpenCount,
        groups: Number(groupResult?.reports?.length || 0),
      });
    } catch {
      // ignore signal load errors to avoid interrupting admin actions
    }
  };

  const handleSupportStatus = async (requestId: string, status: "open" | "closed") => {
    try {
      setSupportStatusLoading(requestId);
      const result = await userService.updateSupportRequestStatus(requestId, status);
      if (status === "closed") {
        const clearedRequesterId = result?.requesterId || null;
        const clearedUsername = (result?.requesterUsername || "")
          .toString()
          .trim()
          .toLowerCase();
        setSupportRequests((prev) =>
          prev.filter((req) => {
            const reqRequesterId = req?.requesterId?._id || null;
            const reqUsername = (req?.requesterUsername || "")
              .toString()
              .trim()
              .toLowerCase();

            if (clearedRequesterId && reqRequesterId === clearedRequesterId) {
              return false;
            }
            if (!clearedRequesterId && clearedUsername && reqUsername === clearedUsername) {
              return false;
            }
            return req._id !== requestId;
          }),
        );
        toast.success("Đã xử lý, hội thoại hỗ trợ đã được làm mới");
      } else {
        await loadSupportRequests();
        toast.success("Đã mở lại yêu cầu");
      }
      await loadPendingSignals();
    } catch (error) {
      console.error("Lỗi cập nhật trạng thái hỗ trợ", error);
      toast.error("Không thể cập nhật trạng thái");
    } finally {
      setSupportStatusLoading(null);
    }
  };

  const handleLockUser = async (userId: string, locked: boolean, reason = "") => {
    try {
      setLockDialogLoading(true);
      await userService.lockUser(userId, locked, reason);
      toast.success(locked ? "Đã khóa tài khoản" : "Đã mở khóa");
      await Promise.all([loadUsers(), active === "support" ? loadSupportRequests() : Promise.resolve()]);
      setSupportRequests((prev) =>
        prev.map((req) => {
          if (req?.requesterId?._id !== userId) return req;
          return {
            ...req,
            requesterId: {
              ...req.requesterId,
              isLocked: locked,
            },
          };
        }),
      );
    } catch (error) {
      console.error("Lỗi lock user", error);
      toast.error("Không thể cập nhật trạng thái");
    } finally {
      setLockDialogLoading(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    const confirmed = window.confirm(
      `Xác nhận xóa tài khoản ${user.displayName || user.username}? Hành động này không thể hoàn tác.`,
    );
    if (!confirmed) return;

    try {
      await userService.deleteUserByAdmin(user._id);
      toast.success("Đã xóa tài khoản người dùng");
      await Promise.all([loadUsers(), active === "support" ? loadSupportRequests() : Promise.resolve()]);
      setSupportRequests((prev) =>
        prev.filter((req) => req?.requesterId?._id !== user._id),
      );
    } catch (error: any) {
      console.error("Lỗi xóa tài khoản người dùng", error);
      toast.error(error?.response?.data?.message || "Không thể xóa tài khoản");
    }
  };

  const handleAdjustStreak = async (action: "increase" | "decrease" | "reset") => {
    const conversationId = streakConversationId.trim();
    if (!conversationId) {
      toast.error("Vui lòng nhập Conversation ID");
      return;
    }

    const parsed = Number(streakAmount);
    const amount =
      Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;

    try {
      setStreakActionLoading(action);
      const result = await userService.adjustConversationStreakAdmin(conversationId, {
        action,
        amount,
        reason: streakReason.trim() || undefined,
      });
      toast.success(result?.message || "Đã cập nhật chuỗi");
    } catch (error: any) {
      console.error("Lỗi khi chỉnh chuỗi", error);
      toast.error(error?.response?.data?.message || "Không thể cập nhật chuỗi");
    } finally {
      setStreakActionLoading(null);
    }
  };

  const handleResolveConversationByDisplayNames = async () => {
    const nameA = streakDisplayNameA.trim();
    const nameB = streakDisplayNameB.trim();

    if (!nameA || !nameB) {
      toast.error("Vui lòng nhập đủ 2 tên hiển thị");
      return;
    }

    try {
      setStreakResolveLoading(true);
      const result = await userService.resolveDirectConversationByDisplayNamesAdmin(
        nameA,
        nameB,
      );
      const foundId = result?.conversation?._id?.toString?.() || "";
      if (foundId) {
        setStreakConversationId(foundId);
        toast.success(`Đã tìm thấy đoạn chat: ${foundId}`);
      } else {
        toast.error("Không lấy được Conversation ID");
      }
    } catch (error: any) {
      console.error("Lỗi khi tìm conversation theo tên hiển thị", error);
      toast.error(error?.response?.data?.message || "Không thể tìm đoạn chat");
    } finally {
      setStreakResolveLoading(false);
    }
  };

  const handleVerifyUser = async (userId: string, verified: boolean) => {
    try {
      await userService.toggleUserVerification(userId, verified);
      toast.success(verified ? "Đã xác minh tài khoản" : "Đã bỏ xác minh");
      await Promise.all([loadUsers(), loadVerificationRequests()]);
      await loadPendingSignals();
    } catch (error) {
      console.error("Lỗi verify user", error);
      toast.error("Không thể cập nhật xác minh");
    }
  };

  const handleReviewVerificationRequest = async (requestId: string, approved: boolean) => {
    try {
      setVerificationActionLoadingId(requestId);
      const selectedRequest = verificationRequests.find((item) => item?._id === requestId);
      await userService.resolveVerificationRequestAdmin(
        requestId,
        approved,
        undefined,
        selectedRequest?.requestedTier || "basic",
      );
      toast.success(approved ? "Đã duyệt tích xanh" : "Đã từ chối yêu cầu");
      await Promise.all([loadUsers(), loadVerificationRequests()]);
      await loadPendingSignals();
    } catch (error: any) {
      console.error("Lỗi duyệt yêu cầu tích xanh", error);
      toast.error(error?.response?.data?.message || "Không thể duyệt yêu cầu");
    } finally {
      setVerificationActionLoadingId(null);
    }
  };

  const handleResetPassword = async (userId: string, nextPass?: string) => {
    try {
      setResetDialogLoading(true);
      const result = await userService.resetUserPassword(userId, nextPass || undefined);
      toast.success(`Mật khẩu mới: ${result?.tempPassword}`);
    } catch (error) {
      console.error("Lỗi reset password", error);
      toast.error("Không thể reset mật khẩu");
    } finally {
      setResetDialogLoading(false);
    }
  };

  const handleWarnUser = async (userId: string, reason: string) => {
    try {
      setWarnDialogLoading(true);
      await userService.warnUser(userId, reason);
      toast.success("Đã cảnh cáo người dùng");
    } catch (error) {
      console.error("Lỗi cảnh cáo user", error);
      toast.error("Không thể cảnh cáo user");
    } finally {
      setWarnDialogLoading(false);
    }
  };

  const openLockDialog = (target: User, mode: "lock" | "unlock") => {
    setLockDialogTarget(target);
    setLockDialogMode(mode);
    setLockDialogReason("");
    setLockDialogOpen(true);
  };

  const openResetDialog = (target: User) => {
    setResetDialogTarget(target);
    setResetDialogPassword("");
    setResetDialogOpen(true);
  };

  const openWarnDialog = (target: User) => {
    setWarnDialogTarget(target);
    setWarnDialogReason("");
    setWarnDialogOpen(true);
  };

  const handleUpdatePostStatus = async (
    postId: string,
    status: "active" | "hidden" | "deleted",
  ) => {
    try {
      await postService.updateAdminPostStatus(postId, status);

      if (status === "deleted") {
        setPostList((prev) => prev.filter((post) => post?._id !== postId));
        setPostReports((prev) =>
          prev.filter((report) => report?.postId?._id !== postId),
        );
        toast.success("Đã xóa bài viết và loại khỏi danh sách");
        return;
      }

      setPostList((prev) =>
        prev.map((post) =>
          post?._id === postId
            ? {
                ...post,
                status,
              }
            : post,
        ),
      );
      setPostReports((prev) =>
        prev.map((report) =>
          report?.postId?._id === postId
            ? {
                ...report,
                postId: {
                  ...report.postId,
                  status,
                },
              }
            : report,
        ),
      );

      toast.success("Đã cập nhật trạng thái bài viết");
    } catch (error) {
      console.error("Lỗi update post status", error);
      toast.error("Không thể cập nhật bài viết");
    }
  };

  const handlePostStatus = async (
    postId: string,
    status: "active" | "hidden" | "deleted",
  ) => {
    await handleUpdatePostStatus(postId, status);
  };

  const postStatusMeta: Record<"active" | "hidden" | "deleted", { label: string; className: string }> = {
    active: { label: "Hoạt động", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    hidden: { label: "Ẩn", className: "bg-amber-50 text-amber-700 border-amber-200" },
    deleted: { label: "Đã xoá", className: "bg-rose-50 text-rose-700 border-rose-200" },
  };

  const handleSearchAdminCandidate = async () => {
    const keyword = adminSearchKeyword.trim();
    if (!keyword) return;
    try {
      setAdminLoading(true);
      const user = await userService.searchUserByUsername(keyword);
      setAdminCandidate(user);
    } catch (error) {
      console.error("Lỗi tìm admin", error);
      toast.error("Không thể tìm user");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleSearchNotifyTarget = async () => {
    const keyword = notifyKeyword.trim();
    if (!keyword) return;
    try {
      setNotifySearchLoading(true);
      const user = await userService.searchUserByUsername(keyword);
      if (!user) {
        toast.error("Không tìm thấy người dùng");
        setNotifyTarget(null);
        return;
      }
      setNotifyTarget(user);
    } catch (error) {
      console.error("Lỗi tìm user gửi thông báo", error);
      toast.error("Không thể tìm người dùng");
    } finally {
      setNotifySearchLoading(false);
    }
  };

  const handleSendAdminNotification = async () => {
    if (!notifyTitle.trim() || !notifyMessage.trim()) {
      toast.error("Vui lòng nhập tiêu đề và nội dung");
      return;
    }

    if (notifyMode === "selected" && !notifyTarget?._id) {
      toast.error("Vui lòng chọn người dùng nhận thông báo");
      return;
    }

    try {
      setNotifyLoading(true);
      await userService.sendAdminNotification({
        title: notifyTitle.trim(),
        description: notifyMessage.trim(),
        mode: notifyMode,
        targetUserIds: notifyMode === "selected" && notifyTarget?._id ? [notifyTarget._id] : undefined,
      });
      toast.success("Đã gửi thông báo");
      setNotifyDialogOpen(false);
      setNotifyTitle("");
      setNotifyMessage("");
      setNotifyKeyword("");
      setNotifyTarget(null);
      setNotifyMode("all");
    } catch (error) {
      console.error("Lỗi gửi thông báo admin", error);
      toast.error("Không thể gửi thông báo");
    } finally {
      setNotifyLoading(false);
    }
  };

  const handleOpenBannerDialog = async () => {
    setBannerDialogOpen(true);
    try {
      const current = await userService.getBanner();
      setBannerPreview(current?.bannerUrl || "");
      setBannerUrl(current?.bannerUrl || "");
    } catch {
      // ignore
    }
  };

  const handleSelectBannerFile = (file?: File | null) => {
    if (!file) {
      setBannerFile(null);
      return;
    }
    setBannerFile(file);
    setBannerUrl("");
    const preview = URL.createObjectURL(file);
    setBannerPreview(preview);
  };

  const handleUpdateBanner = async () => {
    if (!bannerFile && !bannerUrl.trim()) {
      toast.error("Vui lòng chọn ảnh hoặc nhập URL banner");
      return;
    }

    try {
      setBannerLoading(true);
      const result = await userService.updateBanner({
        file: bannerFile || undefined,
        bannerUrl: bannerUrl.trim() || undefined,
      });
      toast.success("Đã cập nhật banner");
      const nextUrl = result?.bannerUrl || bannerUrl.trim();
      setBannerPreview(nextUrl);
      setBannerDialogOpen(false);
    } catch (error) {
      console.error("Lỗi cập nhật banner", error);
      toast.error("Không thể cập nhật banner");
    } finally {
      setBannerLoading(false);
    }
  };

  const handleClearBanner = async () => {
    try {
      setBannerLoading(true);
      await userService.updateBanner({ clear: true });
      setBannerPreview("");
      setBannerUrl("");
      setBannerFile(null);
      toast.success("Đã gỡ banner");
    } catch (error) {
      console.error("Lỗi gỡ banner", error);
      toast.error("Không thể gỡ banner");
    } finally {
      setBannerLoading(false);
    }
  };

  const handleTransferAdmin = async () => {
    if (!adminCandidate?._id) return;
    const ok = window.confirm(
      `Chuyển quyền admin cho ${adminCandidate.displayName || adminCandidate.username}?`
    );
    if (!ok) return;
    try {
      await userService.transferAdminRole(adminCandidate._id);
      toast.success("Đã chuyển quyền admin");
      setAdminCandidate(null);
      setAdminSearchKeyword("");
    } catch (error) {
      console.error("Lỗi chuyển admin", error);
      toast.error("Không thể chuyển quyền admin");
    }
  };

  const openSupportReply = (target: User, requestId: string) => {
    setSupportReplyTarget(target);
    setSupportReplyRequestId(requestId);
    setSupportReplyMessage("");
    setSupportReplyOpen(true);
  };

  const handleSendSupportReply = async () => {
    if (!supportReplyTarget?._id || !supportReplyRequestId || !supportReplyMessage.trim()) {
      toast.error("Vui lòng nhập nội dung phản hồi");
      return;
    }
    try {
      setSupportReplyLoading(true);
      const result = await userService.replySupportRequest(
        supportReplyRequestId,
        supportReplyMessage.trim(),
      );
      await userService.sendAdminNotification({
        title: "Phản hồi hỗ trợ từ HiChat",
        description: supportReplyMessage.trim(),
        mode: "selected",
        targetUserIds: [supportReplyTarget._id],
      });
      setSupportRequests((prev) =>
        prev.map((req) =>
          req._id === supportReplyRequestId ? result?.request || req : req,
        ),
      );
      toast.success("Đã gửi phản hồi (chưa đóng yêu cầu)");
      setSupportReplyOpen(false);
      setSupportReplyTarget(null);
      setSupportReplyRequestId(null);
      setSupportReplyMessage("");
    } catch (error) {
      console.error("Lỗi gửi phản hồi hỗ trợ", error);
      toast.error("Không thể gửi phản hồi");
    } finally {
      setSupportReplyLoading(false);
    }
  };

  const handleExportDashboardReport = () => {
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        section: active,
        dashboard: dashboard || {},
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hichat-admin-report-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Đã xuất báo cáo");
    } catch {
      toast.error("Không thể xuất báo cáo");
    }
  };

  useEffect(() => {
    if (active === "dashboard") loadDashboard();
    if (active === "users") {
      loadUsers();
      loadVerificationRequests();
    }
    if (active === "posts") loadPosts();
    if (active === "reports") loadReports();
    if (active === "groups") loadGroupReports();
    if (active === "support") loadSupportRequests();
  }, [active, reportStatusFilter]);

  useEffect(() => {
    loadPendingSignals();
    const timer = setInterval(() => {
      loadPendingSignals();
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 text-slate-900">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              HiChat Management Console
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Bảng quản trị hệ thống
            </h1>
            <p className="text-sm text-slate-500">
              {activeSectionMeta?.label || "Tổng quan"} · {activeSectionMeta?.description || "Điều hành nền tảng"}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="relative border-slate-300 bg-white hover:bg-slate-50"
              >
                <Bell className="h-5 w-5" />
                {totalPendingSignals > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">
                    {totalPendingSignals > 99 ? "99+" : totalPendingSignals}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem
                onClick={() => setActive("users")}
                className="flex items-center justify-between"
              >
                <span>Yêu cầu tích xanh</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {pendingSignals.verification}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setReportStatusFilter("pending");
                  setActive("reports");
                }}
                className="flex items-center justify-between"
              >
                <span>Báo cáo cần xử lý</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {pendingSignals.reports}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setActive("support")}
                className="flex items-center justify-between"
              >
                <span>Hỗ trợ mới</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {pendingSignals.support}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setActive("groups")}
                className="flex items-center justify-between"
              >
                <span>Báo cáo nhóm</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {pendingSignals.groups}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_1fr]">
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-5">
          <div className="mb-3 rounded-xl bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Điều hướng</p>
            <p className="text-sm font-semibold text-slate-700">Các phân hệ quản trị</p>
          </div>
          <div className="space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition",
                  active === item.id
                    ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm"
                    : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                )}
              >
                <span className={cn("shrink-0", active === item.id ? "text-blue-600" : "text-slate-500")}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
                {getSectionPendingCount(item.id) > 0 ? (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                    {getSectionPendingCount(item.id) > 99 ? "99+" : getSectionPendingCount(item.id)}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-6">
          {active === "dashboard" && (
            <section className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Tổng người dùng", value: dashboard?.totalUsers ?? 0, icon: <Users /> },
                  { label: "Tổng bài viết", value: dashboard?.totalPosts ?? 0, icon: <FileText /> },
                  { label: "Tin nhắn hôm nay", value: dashboard?.messagesToday ?? 0, icon: <MessageCircle /> },
                  { label: "Tài khoản bị báo cáo", value: dashboard?.reportedAccounts ?? 0, icon: <Ban /> },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500">{item.label}</p>
                        <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                        {item.icon}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Biểu đồ tăng trưởng người dùng</p>
                    <p className="text-xs text-slate-500">14 ngày gần nhất</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={loadDashboard} disabled={dashboardLoading}>
                    Làm mới
                  </Button>
                </div>
                <div className="mt-4 grid grid-cols-7 gap-2 md:grid-cols-14">
                  {(dashboard?.growth || []).map((point) => (
                    <div key={point.date} className="flex flex-col items-center gap-2">
                      <div className="flex h-24 w-full items-end">
                        <div
                          className="w-full rounded-lg bg-violet-500/80"
                          style={{ height: `${Math.max(8, (point.count / growthMax) * 96)}px` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500">{point.date.slice(5)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold text-slate-700">Số cuộc gọi hôm nay</p>
                  <p className="mt-2 text-2xl font-semibold">{dashboard?.callsToday ?? 0}</p>
                  <p className="mt-1 text-xs text-slate-500">Tạm thời chưa ghi log cuộc gọi.</p>
                </div>
                <div className="rounded-2xl border bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold text-slate-700">Hành động nhanh</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => setNotifyDialogOpen(true)}
                    >
                      <Megaphone className="h-4 w-4" />
                      Thông báo
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleOpenBannerDialog}>
                      Cập nhật banner
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleExportDashboardReport}>
                      Xuất báo cáo
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {active === "users" && (
            <section className="space-y-5">
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={userKeyword}
                      onChange={(e) => setUserKeyword(e.target.value)}
                      placeholder="Tìm theo username, email, tên hiển thị"
                      className="pl-9"
                    />
                  </div>
                  <select
                    className="h-10 rounded-lg border px-3 text-sm"
                    value={userStatus}
                    onChange={(e) => setUserStatus(e.target.value as any)}
                  >
                    <option value="all">Tất cả</option>
                    <option value="active">Đang hoạt động</option>
                    <option value="banned">Bị khóa</option>
                  </select>
                  <Button onClick={loadUsers} disabled={userLoading}>Tải danh sách</Button>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Kiểm duyệt tích xanh</p>
                    <p className="text-xs text-slate-500">
                      Yêu cầu chờ duyệt: {verificationRequests.length}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={loadVerificationRequests}
                    disabled={verificationLoading}
                  >
                    {verificationLoading ? "Đang tải..." : "Làm mới"}
                  </Button>
                </div>
                <div className="grid gap-3">
                  {verificationRequests.length === 0 && (
                    <p className="text-sm text-slate-500">Không có yêu cầu tích xanh đang chờ.</p>
                  )}
                  {verificationRequests.map((request) => (
                    <div
                      key={request._id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          {request?.userId?.displayName || "Người dùng"}
                          <span className="ml-2 text-slate-400">
                            @{request?.userId?.username || "unknown"}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">
                          Gửi lúc: {formatDateTime(request?.createdAt)}
                        </p>
                        <p className="text-xs text-slate-500">
                          Gói yêu cầu: {(request?.requestedTier || "basic").toUpperCase()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleReviewVerificationRequest(request._id, true)}
                          disabled={verificationActionLoadingId === request._id}
                        >
                          Duyệt tích xanh
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReviewVerificationRequest(request._id, false)}
                          disabled={verificationActionLoadingId === request._id}
                        >
                          Từ chối
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="mb-3">
                  <p className="text-sm font-semibold">Quản lý chuỗi hội thoại</p>
                  <p className="text-xs text-slate-500">
                    Có thể nhập tên hiển thị để tự tìm Conversation ID, sau đó tăng/giảm/hủy chuỗi.
                  </p>
                </div>
                <div className="mb-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <Input
                    value={streakDisplayNameA}
                    onChange={(e) => setStreakDisplayNameA(e.target.value)}
                    placeholder="Tên hiển thị A"
                  />
                  <Input
                    value={streakDisplayNameB}
                    onChange={(e) => setStreakDisplayNameB(e.target.value)}
                    placeholder="Tên hiển thị B"
                  />
                  <Button
                    variant="outline"
                    onClick={handleResolveConversationByDisplayNames}
                    disabled={streakResolveLoading}
                  >
                    {streakResolveLoading ? "Đang tìm..." : "Tìm đoạn chat"}
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-[1.6fr_0.8fr]">
                  <Input
                    value={streakConversationId}
                    onChange={(e) => setStreakConversationId(e.target.value)}
                    placeholder="Nhập Conversation ID (chat trực tiếp/nhóm)"
                  />
                  <Input
                    value={streakAmount}
                    onChange={(e) => setStreakAmount(e.target.value)}
                    placeholder="Số lượng (mặc định 1)"
                  />
                </div>
                <Textarea
                  value={streakReason}
                  onChange={(e) => setStreakReason(e.target.value)}
                  placeholder="Lý do thao tác (không bắt buộc)"
                  className="mt-3 min-h-[72px]"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleAdjustStreak("increase")}
                    disabled={streakActionLoading !== null}
                  >
                    {streakActionLoading === "increase" ? "Đang tăng..." : "Tăng chuỗi"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAdjustStreak("decrease")}
                    disabled={streakActionLoading !== null}
                  >
                    {streakActionLoading === "decrease" ? "Đang giảm..." : "Giảm chuỗi"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-200 text-rose-700 hover:bg-rose-50"
                    onClick={() => handleAdjustStreak("reset")}
                    disabled={streakActionLoading !== null}
                  >
                    {streakActionLoading === "reset" ? "Đang hủy..." : "Hủy chuỗi"}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="grid gap-3">
                  {userList.length === 0 && (
                    <p className="text-sm text-slate-500">Chưa có user nào.</p>
                  )}
                  {userList.map((user) => (
                    <div key={user._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">
                          <span className="inline-flex items-center gap-1">
                            {user.displayName}
                            {user.isVerified ? <VerifiedBadge className="h-3.5 w-3.5" /> : null}
                          </span>{" "}
                          <span className="text-slate-400">(@{user.username})</span>
                        </p>
                        <p className="text-xs text-slate-500">{user.email || "Không có email"}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>Bài viết: {user.postCount || 0}</span>
                          <span>Ngày tham gia: {formatDate(user.createdAt)}</span>
                          <span>Đăng nhập gần nhất: {formatDateTime(user.lastLoginAt)}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => openResetDialog(user)}>
                          Reset mật khẩu
                        </Button>
                        <Button
                          size="sm"
                          variant={user.isVerified ? "outline" : "default"}
                          onClick={() => handleVerifyUser(user._id, !user.isVerified)}
                        >
                          {user.isVerified ? "Bỏ xác minh" : "Xác minh"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            "gap-1.5 border-2 transition",
                            user.isLocked
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          )}
                          onClick={() => openLockDialog(user, user.isLocked ? "unlock" : "lock")}
                        >
                          {user.isLocked ? (
                            <>
                              <Lock className="h-3.5 w-3.5" /> Mở khóa
                            </>
                          ) : (
                            <>
                              <Ban className="h-3.5 w-3.5" /> Khóa
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          onClick={() => handleDeleteUser(user)}
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Xoá tài khoản
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {active === "posts" && (
            <section className="space-y-5">
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={postKeyword}
                      onChange={(e) => setPostKeyword(e.target.value)}
                      placeholder="Tìm theo nội dung bài viết"
                      className="pl-9"
                    />
                  </div>
                  <select
                    className="h-10 rounded-lg border px-3 text-sm"
                    value={postStatus}
                    onChange={(e) => setPostStatus(e.target.value as any)}
                  >
                    <option value="all">Tất cả</option>
                    <option value="active">Hoạt động</option>
                    <option value="hidden">Ẩn</option>
                    <option value="deleted">Đã xoá</option>
                  </select>
                  <Button onClick={loadPosts} disabled={postLoading}>Tải bài viết</Button>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="grid gap-3">
                  {postList.length === 0 && (
                    <p className="text-sm text-slate-500">Chưa có bài viết.</p>
                  )}
                  {postList.map((post) => (
                    <div key={post._id} className="rounded-xl border px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {post.authorId?.displayName || "Người dùng"}
                            <span className="ml-2 text-xs text-slate-400">@{post.authorId?.username}</span>
                          </p>
                          <p className="mt-1 text-sm text-slate-700 line-clamp-2">{post.content || "(Không có nội dung)"}</p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>Thích: {post.likeCount || 0}</span>
                            <span>Bình luận: {post.commentCount || 0}</span>
                            <span>Chia sẻ: {post.shareCount || 0}</span>
                            <span>Ngày: {formatDateTime(post.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "gap-2 border-2 px-3 text-xs font-semibold",
                                  postStatusMeta[(post.status || "active") as "active" | "hidden" | "deleted"]
                                    .className
                                )}
                              >
                                {postStatusMeta[(post.status || "active") as "active" | "hidden" | "deleted"].label}
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[140px]">
                              {(["active", "hidden", "deleted"] as const).map((status) => (
                                <DropdownMenuItem
                                  key={status}
                                  onClick={() => handlePostStatus(post._id, status)}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <span>{postStatusMeta[status].label}</span>
                                  <span
                                    className={cn(
                                      "h-2 w-2 rounded-full",
                                      status === "active"
                                        ? "bg-emerald-500"
                                        : status === "hidden"
                                          ? "bg-amber-500"
                                          : "bg-rose-500"
                                    )}
                                  />
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {active === "reports" && (
            <section className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-emerald-50 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Danh sách báo cáo</p>
                    <p className="text-xs text-slate-500">Theo dõi xử lý báo cáo user và bài viết</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(["all", "pending", "resolved"] as const).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={reportStatusFilter === status ? "default" : "outline"}
                        onClick={() => setReportStatusFilter(status)}
                      >
                        {status === "all"
                            ? "Tất cả"
                            : status === "pending"
                            ? `Chờ xử lý (${reportSummary.pendingCount})`
                            : `Đã xử lý (${reportSummary.resolvedCount})`}
                      </Button>
                    ))}
                    <Button size="sm" variant="outline" onClick={loadReports} disabled={reportLoading}>
                      Làm mới
                    </Button>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">Báo cáo người dùng</p>
                  <span className="text-xs text-slate-500">{reports.length} báo cáo</span>
                </div>
                <div className="grid gap-3">
                  {reports.length === 0 && (
                    <p className="text-sm text-slate-500">Chưa có báo cáo.</p>
                  )}
                  {lockedAccountSpecialReports.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-sm font-semibold text-amber-900">
                        Báo cáo đặc biệt từ chat tài khoản bị khóa
                      </p>
                      <p className="text-xs text-amber-800">
                        {lockedAccountSpecialReports.length} báo cáo hỗ trợ xác minh từ người dùng.
                      </p>
                    </div>
                  )}
                  {lockedAccountSpecialReports.map((report) => (
                    <div key={report._id} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-amber-900">
                            {report.reporterId?.displayName || "Người dùng"} gửi đánh giá cho{" "}
                            {report.targetId?.displayName || "Người dùng"}
                          </p>
                          <p className="text-sm text-amber-800">Nội dung báo cáo: {cleanReportReason(report.reason)}</p>
                          {report.detail ? (
                            <p className="text-xs text-amber-700">Thông tin bổ sung: {report.detail}</p>
                          ) : null}
                          <p className="mt-1 text-xs text-amber-700">
                            <Calendar className="mr-1 inline h-3 w-3" />
                            {formatDateTime(report.createdAt)}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className={cn(
                              "rounded-full px-2 py-0.5 font-semibold",
                              report?.isResolved
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700",
                            )}>
                              {report?.isResolved ? "Đã xử lý" : "Chờ xử lý"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reportActionLoadingId === `user-${report._id}`}
                            onClick={() => handleResolveUserReport(report._id, !report?.isResolved)}
                          >
                            {report?.isResolved ? "Xoá lịch sử đã xử lý" : "Đã xử lý"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-2 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                            onClick={() => {
                              if (report.targetId?._id) {
                                openLockDialog(report.targetId, "lock");
                              }
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Khóa user
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              report.targetId?._id
                                ? openWarnDialog(report.targetId)
                                : null
                            }
                          >
                            Cảnh cáo
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {normalUserReports.map((report) => (
                    <div key={report._id} className="rounded-xl border px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {report.reporterId?.displayName || "Người dùng"} báo cáo{" "}
                            {report.targetId?.displayName || "Người dùng"}
                          </p>
                          <p className="text-sm text-slate-600">Nội dung báo cáo: {cleanReportReason(report.reason)}</p>
                          {report.detail ? (
                            <p className="text-xs text-slate-500">Thông tin bổ sung: {report.detail}</p>
                          ) : null}
                          <p className="mt-1 text-xs text-slate-400">
                            <Calendar className="mr-1 inline h-3 w-3" />
                            {formatDateTime(report.createdAt)}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className={cn(
                              "rounded-full px-2 py-0.5 font-semibold",
                              report?.isResolved
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700",
                            )}>
                              {report?.isResolved ? "Đã xử lý" : "Chờ xử lý"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reportActionLoadingId === `user-${report._id}`}
                            onClick={() => handleResolveUserReport(report._id, !report?.isResolved)}
                          >
                            {report?.isResolved ? "Xoá lịch sử đã xử lý" : "Đã xử lý"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-2 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                            onClick={() => {
                              if (report.targetId?._id) {
                                openLockDialog(report.targetId, "lock");
                              }
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Khóa user
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              report.targetId?._id
                                ? openWarnDialog(report.targetId)
                                : null
                            }
                          >
                            Cảnh cáo
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="my-4 h-px bg-slate-200" />

                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">Báo cáo bài viết</p>
                  <span className="text-xs text-slate-500">{postReports.length} báo cáo</span>
                </div>
                <div className="grid gap-3">
                  {postReports.length === 0 && (
                    <p className="text-sm text-slate-500">Chưa có báo cáo bài viết.</p>
                  )}
                  {postReports.map((report) => (
                    <div key={report._id} className="rounded-xl border px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {report.reporterId?.displayName || "Người dùng"} báo cáo bài viết của{" "}
                            {report.postId?.authorId?.displayName || "Người dùng"}
                          </p>
                          <p className="text-sm text-slate-600">Nội dung báo cáo: {cleanReportReason(report.reason)}</p>
                          {report.detail ? (
                            <p className="text-xs text-slate-500">Thông tin bổ sung: {report.detail}</p>
                          ) : null}
                          {report.postId?.content ? (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                              Nội dung: {report.postId.content}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-slate-400">
                            <Calendar className="mr-1 inline h-3 w-3" />
                            {formatDateTime(report.createdAt)}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className={cn(
                              "rounded-full px-2 py-0.5 font-semibold",
                              report?.isResolved
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700",
                            )}>
                              {report?.isResolved ? "Đã xử lý" : "Chờ xử lý"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reportActionLoadingId === `post-${report._id}`}
                            onClick={() => handleResolvePostReport(report._id, !report?.isResolved)}
                          >
                            {report?.isResolved ? "Xoá lịch sử đã xử lý" : "Đã xử lý"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (report.postId?._id) {
                                handleUpdatePostStatus(report.postId._id, "hidden");
                              }
                            }}
                          >
                            Ẩn bài viết
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => {
                              if (report.postId?._id) {
                                handleUpdatePostStatus(report.postId._id, "deleted");
                              }
                            }}
                          >
                            Xoá bài viết
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {active === "groups" && (
            <section className="space-y-5">
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Báo cáo nhóm</p>
                    <p className="text-xs text-slate-500">User báo cáo nhóm vi phạm</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={loadGroupReports} disabled={groupReportLoading}>
                    Làm mới
                  </Button>
                </div>
              </div>
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="grid gap-3">
                  {groupReports.length === 0 && (
                    <p className="text-sm text-slate-500">Chưa có báo cáo nhóm.</p>
                  )}
                  {groupReports.map((report) => {
                    const group = report.conversationId?.group;
                    const creator = group?.createdBy;
                    return (
                      <div key={report._id} className="rounded-xl border px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">
                              {report.reporterId?.displayName || "Người dùng"} báo cáo nhóm{" "}
                              {group?.name || "Nhóm chat"}
                            </p>
                            <p className="text-sm text-slate-600">Nội dung báo cáo: {cleanReportReason(report.reason)}</p>
                            {report.detail ? (
                              <p className="text-xs text-slate-500">Thông tin bổ sung: {report.detail}</p>
                            ) : null}
                            {creator ? (
                              <p className="mt-1 text-xs text-slate-500">
                                Chủ nhóm: {creator.displayName || creator.username}
                              </p>
                            ) : null}
                            <p className="mt-1 text-xs text-slate-400">
                              <Calendar className="mr-1 inline h-3 w-3" />
                              {formatDateTime(report.createdAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (creator?._id) {
                                  openWarnDialog(creator);
                                }
                              }}
                            >
                              Cảnh cáo chủ nhóm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              onClick={() => {
                                if (creator?._id) {
                                  openLockDialog(creator, "lock");
                                }
                              }}
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Khóa chủ nhóm
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {active === "support" && (
            <section className="space-y-5">
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Hỗ trợ mở khóa tài khoản</p>
                    <p className="text-xs text-slate-500">
                      Yêu cầu từ người dùng bị khóa hoặc cần trợ giúp.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={loadSupportRequests} disabled={supportLoading}>
                    Làm mới
                  </Button>
                </div>
              </div>
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="grid gap-3">
                  {supportRequests.length === 0 && (
                    <p className="text-sm text-slate-500">Chưa có yêu cầu hỗ trợ.</p>
                  )}
                  {supportRequests.map((request) => {
                    const requester = request.requesterId;
                    const displayName =
                      requester?.displayName ||
                      request.requesterName ||
                      "Người dùng";
                    const username =
                      requester?.username || request.requesterUsername || "unknown";
                    const isLocked = requester?.isLocked ?? false;
                    return (
                      <div
                        key={request._id}
                        className="rounded-xl border bg-white px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">
                              {displayName}{" "}
                              <span className="text-slate-400">(@{username})</span>
                            </p>
                            <p className="mt-1 text-sm text-slate-700">
                              {request.message}
                            </p>
                            {request?.adminReply?.message ? (
                              <div className="mt-2 rounded-lg border border-emerald-200/70 bg-emerald-50 px-3 py-2">
                                <p className="text-xs font-semibold text-emerald-700">
                                  Phản hồi admin: {request?.adminReply?.adminName || "Quản trị viên"}
                                </p>
                                <p className="text-sm text-emerald-800">
                                  {request.adminReply.message}
                                </p>
                              </div>
                            ) : null}
                            <p className="mt-2 text-xs text-slate-400">
                              <Calendar className="mr-1 inline h-3 w-3" />
                              {formatDateTime(request.createdAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleSupportStatus(request._id, "closed")}
                              disabled={supportStatusLoading === request._id}
                            >
                              Đã xử lý
                            </Button>
                            {requester?._id ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "gap-1.5 border-2 transition",
                                  isLocked
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                )}
                                onClick={() => openLockDialog(requester, isLocked ? "unlock" : "lock")}
                              >
                                {isLocked ? (
                                  <>
                                    <Lock className="h-3.5 w-3.5" /> Mở khóa
                                  </>
                                ) : (
                                  <>
                                    <Ban className="h-3.5 w-3.5" /> Khóa
                                  </>
                                )}
                              </Button>
                            ) : null}
                            {requester?._id ? (
                              <Button size="sm" variant="outline" onClick={() => openWarnDialog(requester)}>
                                Cảnh cáo
                              </Button>
                            ) : null}
                            {requester?._id ? (
                              <Button size="sm" onClick={() => openSupportReply(requester, request._id)}>
                                Gửi phản hồi
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {active === "roles" && (
            <section className="space-y-5">
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold">Chuyển quyền admin</p>
                <p className="text-xs text-slate-500">
                  Chỉ có 1 admin. Chọn admin mới để thay thế admin hiện tại.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={adminSearchKeyword}
                      onChange={(e) => setAdminSearchKeyword(e.target.value)}
                      placeholder="Nhập username hoặc tên hiển thị"
                      className="pl-9"
                    />
                  </div>
                  <Button onClick={handleSearchAdminCandidate} disabled={adminLoading}>
                    Tìm user
                  </Button>
                </div>

                {adminCandidate && (
                  <div className="mt-4 rounded-xl border px-4 py-3">
                    <p className="text-sm font-semibold">
                      {adminCandidate.displayName} (@{adminCandidate.username})
                    </p>
                    <p className="text-xs text-slate-500">{adminCandidate.email || "Không có email"}</p>
                    <Button className="mt-3" onClick={handleTransferAdmin}>
                      Chuyển quyền admin
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold">Vai trò gợi ý (MVP)</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {[
                    { label: "Quản trị tối cao", icon: <UserCheck className="h-4 w-4" /> },
                    { label: "Kiểm duyệt", icon: <Shield className="h-4 w-4" /> },
                    { label: "Hỗ trợ", icon: <UserX className="h-4 w-4" /> },
                  ].map((role) => (
                    <div key={role.label} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-slate-600">
                      {role.icon}
                      {role.label}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {active === "system" && (
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold">Cài đặt hệ thống</p>
              <p className="mt-1 text-xs text-slate-500">
                Cấu hình giới hạn đăng bài, giới hạn tin nhắn, bộ lọc từ khóa cấm (đang phát triển).
              </p>
            </section>
          )}

          {active === "logs" && (
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold">Nhật ký & Bảo mật</p>
              <p className="mt-1 text-xs text-slate-500">
                Nhật ký hành động admin và phát hiện bất thường (đang phát triển).
              </p>
            </section>
          )}

          {["content"].includes(active) && (
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold">Tính năng đang phát triển</p>
              <p className="mt-1 text-xs text-slate-500">
                Mục này cần thêm dữ liệu log trước khi triển khai đầy đủ.
              </p>
            </section>
          )}
        </main>
      </div>
      </div>
      <Dialog open={supportReplyOpen} onOpenChange={setSupportReplyOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-lg rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Phản hồi hỗ trợ</DialogTitle>
            <DialogDescription>
              Gửi thông báo mở khóa hoặc hướng dẫn tới người dùng.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-4 py-4">
            <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-medium">
                {supportReplyTarget?.displayName || "Người dùng"}
              </p>
              <p className="text-xs text-muted-foreground">
                @{supportReplyTarget?.username || "unknown"}
              </p>
            </div>
            <Textarea
              value={supportReplyMessage}
              onChange={(e) => setSupportReplyMessage(e.target.value)}
              placeholder="Nhập phản hồi gửi user..."
              className="min-h-[110px]"
            />
          </div>
          <DialogFooter className="px-4 py-3">
            <Button variant="outline" onClick={() => setSupportReplyOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleSendSupportReply} disabled={supportReplyLoading}>
              {supportReplyLoading ? "Đang gửi..." : "Gửi phản hồi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={notifyDialogOpen} onOpenChange={setNotifyDialogOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-lg rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-center text-lg font-bold">
              Thông báo từ admin
            </DialogTitle>
            <DialogDescription className="text-center">
              Gửi thông báo tới toàn bộ người dùng hoặc chọn một người cụ thể.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Chọn đối tượng nhận</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={notifyMode === "all" ? "default" : "outline"}
                  onClick={() => {
                    setNotifyMode("all");
                    setNotifyTarget(null);
                    setNotifyKeyword("");
                  }}
                >
                  Tất cả người dùng
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={notifyMode === "selected" ? "default" : "outline"}
                  onClick={() => setNotifyMode("selected")}
                >
                  Chọn người dùng
                </Button>
              </div>
            </div>

            {notifyMode === "selected" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Tìm người dùng</label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={notifyKeyword}
                      onChange={(e) => setNotifyKeyword(e.target.value)}
                      placeholder="Nhập username hoặc tên hiển thị"
                      className="pl-9"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleSearchNotifyTarget}
                    disabled={notifySearchLoading}
                  >
                    {notifySearchLoading ? "Đang tìm..." : "Tìm user"}
                  </Button>
                </div>
                {notifyTarget ? (
                  <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">
                    <p className="font-medium">
                      {notifyTarget.displayName || "Người dùng"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{notifyTarget.username || "unknown"}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Tiêu đề</label>
              <Input
                value={notifyTitle}
                onChange={(e) => setNotifyTitle(e.target.value)}
                placeholder="Nhập tiêu đề thông báo"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nội dung</label>
              <Textarea
                value={notifyMessage}
                onChange={(e) => setNotifyMessage(e.target.value)}
                placeholder="Nhập nội dung thông báo"
                className="min-h-[120px]"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNotifyDialogOpen(false)}
              disabled={notifyLoading}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleSendAdminNotification}
              disabled={notifyLoading}
            >
              {notifyLoading ? "Đang gửi..." : "Gửi thông báo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bannerDialogOpen}
        onOpenChange={(open) => {
          setBannerDialogOpen(open);
          if (!open && bannerPreview?.startsWith("blob:")) {
            URL.revokeObjectURL(bannerPreview);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-lg rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-center text-lg font-bold">Cập nhật banner</DialogTitle>
            <DialogDescription className="text-center">
              Tải ảnh banner hoặc nhập URL ảnh.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-4 py-4">
            {bannerPreview ? (
              <div className="overflow-hidden rounded-2xl border">
                <img src={bannerPreview} alt="Banner preview" className="h-40 w-full object-cover" />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-slate-500">
                Chưa có banner
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Tải ảnh banner</label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => handleSelectBannerFile(e.target.files?.[0])}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Hoặc nhập URL ảnh</label>
              <Input
                value={bannerUrl}
                onChange={(e) => {
                  setBannerUrl(e.target.value);
                  if (e.target.value.trim()) {
                    setBannerFile(null);
                    setBannerPreview(e.target.value.trim());
                  }
                }}
                placeholder="https://example.com/banner.jpg"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleClearBanner}
              disabled={bannerLoading}
            >
              Gỡ banner
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBannerDialogOpen(false)}
                disabled={bannerLoading}
              >
                Hủy
              </Button>
              <Button type="button" onClick={handleUpdateBanner} disabled={bannerLoading}>
                {bannerLoading ? "Đang lưu..." : "Lưu banner"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-2xl p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-center text-lg font-bold">
            {lockDialogMode === "lock" ? "Khóa tài khoản" : "Mở khóa tài khoản"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {lockDialogMode === "lock"
              ? "Nhập lý do khóa để gửi thông báo rõ ràng cho người dùng."
              : "Xác nhận mở khóa tài khoản này."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 py-4">
          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">
              {lockDialogTarget?.displayName || "Người dùng"}
            </p>
            <p className="text-xs text-muted-foreground">
              @{lockDialogTarget?.username || "unknown"}
            </p>
          </div>
          {lockDialogMode === "lock" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Lý do khóa</label>
              <Input
                value={lockDialogReason}
                onChange={(e) => setLockDialogReason(e.target.value)}
                placeholder="Nhập lý do khóa tài khoản"
              />
            </div>
          )}
        </div>
        <DialogFooter className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLockDialogOpen(false)}
            disabled={lockDialogLoading}
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant={lockDialogMode === "lock" ? "destructive" : "default"}
            disabled={lockDialogLoading}
            onClick={async () => {
              if (!lockDialogTarget?._id) return;
              await handleLockUser(
                lockDialogTarget._id,
                lockDialogMode === "lock",
                lockDialogReason.trim(),
              );
              setLockDialogOpen(false);
            }}
          >
            {lockDialogMode === "lock" ? "Khóa tài khoản" : "Mở khóa"}
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-2xl p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-center text-lg font-bold">
            Reset mật khẩu
          </DialogTitle>
          <DialogDescription className="text-center">
            Tạo mật khẩu mới cho user hoặc để trống để hệ thống tạo ngẫu nhiên.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 py-4">
          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">
              {resetDialogTarget?.displayName || "Người dùng"}
            </p>
            <p className="text-xs text-muted-foreground">
              @{resetDialogTarget?.username || "unknown"}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Mật khẩu mới (tùy chọn)</label>
            <Input
              value={resetDialogPassword}
              onChange={(e) => setResetDialogPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới (>=6 ký tự)"
              type="text"
            />
          </div>
        </div>
        <DialogFooter className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setResetDialogOpen(false)}
            disabled={resetDialogLoading}
          >
            Hủy
          </Button>
          <Button
            type="button"
            disabled={resetDialogLoading}
            onClick={async () => {
              if (!resetDialogTarget?._id) return;
              await handleResetPassword(
                resetDialogTarget._id,
                resetDialogPassword.trim() || undefined,
              );
              setResetDialogOpen(false);
            }}
          >
            Reset mật khẩu
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
      <Dialog open={warnDialogOpen} onOpenChange={setWarnDialogOpen}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-center text-lg font-bold">
              Cảnh cáo người dùng
            </DialogTitle>
            <DialogDescription className="text-center">
              Nhập nội dung cảnh cáo để gửi thông báo tới người dùng.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 py-4">
            <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-medium">
                {warnDialogTarget?.displayName || "Người dùng"}
              </p>
              <p className="text-xs text-muted-foreground">
                @{warnDialogTarget?.username || "unknown"}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nội dung cảnh cáo</label>
              <Input
                value={warnDialogReason}
                onChange={(e) => setWarnDialogReason(e.target.value)}
                placeholder="Nhập lý do cảnh cáo"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setWarnDialogOpen(false)}
              disabled={warnDialogLoading}
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={warnDialogLoading}
              onClick={async () => {
                if (!warnDialogTarget?._id) return;
                await handleWarnUser(warnDialogTarget._id, warnDialogReason.trim());
                setWarnDialogOpen(false);
              }}
            >
              Gửi cảnh cáo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminAntiScamPage;
