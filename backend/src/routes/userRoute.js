import express from "express";
import {
  acceptRelationshipRequest,
  authMe,
  blockAndReportUser,
  changePassword,
  declineRelationshipRequest,
  deleteMyAccount,
  getRelationshipRequests,
  getMyVerificationRequest,
  getMyVerifiedPrivileges,
  getUserFriendsById,
  getUserProfileById,
  followUser,
  listAdmins,
  createExamAttempt,
  getMyExamState,
  listMyExamAttempts,
  listExamAttemptsAdmin,
  upsertMyExamState,
  listAdminAuditLogs,
  listUserReports,
  resolveUserReport,
  hideUserReport,
  deleteUserReport,
  getAdminDashboard,
  listUsersAdmin,
  toggleUserVerification,
  resetUserPassword,
  transferAdminRole,
  lockUser,
  listVerificationRequestsAdmin,
  searchUserByUsername,
  sendRelationshipRequest,
  sendAdminNotification,
  submitVerificationRequest,
  getAppBanner,
  updateAppBanner,
  updateProfile,
  updateOnlineVisibility,
  updateNotificationSettings,
  resolveVerificationRequestAdmin,
  unfollowUser,
  updateUserRole,
  warnUser,
  deleteUserByAdmin,
  adjustConversationStreakAdmin,
  resolveDirectConversationByDisplayNamesAdmin,
  uploadAvatar,
  uploadCover,
} from "../controllers/userController.js";
import { uploadSingleImage } from "../middlewares/uploadMiddleware.js";
import { requireAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/me", authMe);
router.get("/search", searchUserByUsername);
router.get("/relationship-requests", getRelationshipRequests);
router.post("/relationship-requests", sendRelationshipRequest);
router.post("/relationship-requests/:requestId/accept", acceptRelationshipRequest);
router.post("/relationship-requests/:requestId/decline", declineRelationshipRequest);
router.patch("/profile", updateProfile);
router.post("/uploadAvatar", uploadSingleImage("file"), uploadAvatar);
router.post("/uploadCover", uploadSingleImage("file"), uploadCover);
router.patch("/password", changePassword);
router.patch("/notifications", updateNotificationSettings);
router.patch("/online-visibility", updateOnlineVisibility);
router.get("/verification-request/me", getMyVerificationRequest);
router.get("/verification/privileges", getMyVerifiedPrivileges);
router.post("/verification-request", submitVerificationRequest);
router.get("/banner", getAppBanner);
router.get("/admin/users", requireAdmin, listAdmins);
router.get("/admin/audit-logs", requireAdmin, listAdminAuditLogs);
router.get("/admin/exams/attempts", requireAdmin, listExamAttemptsAdmin);
router.get("/admin/reports", requireAdmin, listUserReports);
router.patch("/admin/reports/:reportId/resolve", requireAdmin, resolveUserReport);
router.patch("/admin/reports/:reportId/hide", requireAdmin, hideUserReport);
router.delete("/admin/reports/:reportId", requireAdmin, deleteUserReport);
router.patch("/admin/users/:userId/role", requireAdmin, updateUserRole);
router.patch("/admin/users/:userId/warn", requireAdmin, warnUser);
router.patch("/admin/users/:userId/lock", requireAdmin, lockUser);
router.post("/admin/notify", requireAdmin, sendAdminNotification);
router.post("/admin/banner", requireAdmin, uploadSingleImage("file"), updateAppBanner);
router.get("/admin/dashboard", requireAdmin, getAdminDashboard);
router.get("/admin/users/list", requireAdmin, listUsersAdmin);
router.get("/admin/verification-requests", requireAdmin, listVerificationRequestsAdmin);
router.patch(
  "/admin/verification-requests/:requestId/resolve",
  requireAdmin,
  resolveVerificationRequestAdmin,
);
router.patch("/admin/users/:userId/verify", requireAdmin, toggleUserVerification);
router.patch(
  "/admin/users/:userId/reset-password",
  requireAdmin,
  resetUserPassword,
);
router.delete("/admin/users/:userId", requireAdmin, deleteUserByAdmin);
router.patch(
  "/admin/conversations/:conversationId/streak",
  requireAdmin,
  adjustConversationStreakAdmin,
);
router.post(
  "/admin/conversations/resolve-direct-by-display-name",
  requireAdmin,
  resolveDirectConversationByDisplayNamesAdmin,
);
router.post("/admin/transfer", requireAdmin, transferAdminRole);
router.post("/block-report", blockAndReportUser);
router.post("/exams/attempts", createExamAttempt);
router.get("/exams/attempts/me", listMyExamAttempts);
router.get("/exams/state", getMyExamState);
router.put("/exams/state", upsertMyExamState);
router.delete("/me", deleteMyAccount);
router.post("/:userId/follow", followUser);
router.delete("/:userId/follow", unfollowUser);
router.get("/:userId/friends", getUserFriendsById);
router.get("/:userId", getUserProfileById);

export default router;
