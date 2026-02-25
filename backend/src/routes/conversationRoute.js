import express from "express";
import {
  addGroupMembers,
  clearConversationMessages,
  createConversation,
  getConversations,
  getMessages,
  markAsSeen,
  reportConversation,
  listGroupReports,
  resolveGroupReport,
  hideGroupReport,
  toggleConversationArchive,
  toggleConversationE2EE,
  toggleConversationMute,
  toggleConversationReadReceipt,
  toggleBlockConversationUser,
  toggleRestrictConversationUser,
  updateDirectConversationTheme,
  updateConversationNickname,
  updateGroupNickname,
  updateGroupName,
  leaveGroup,
  updateGroupAvatar,
} from "../controllers/conversationController.js";
import { checkFriendship } from "../middlewares/friendMiddleware.js";
import { requireAdmin } from "../middlewares/authMiddleware.js";
import { uploadSingleImage } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.post("/", checkFriendship, createConversation);
router.post("/:conversationId/members", checkFriendship, addGroupMembers);
router.post("/:conversationId/avatar", uploadSingleImage("file"), updateGroupAvatar);
router.patch("/:conversationId/name", updateGroupName);
router.patch("/:conversationId/leave", leaveGroup);
router.get("/", getConversations);
router.get("/:conversationId/messages", getMessages);
router.delete("/:conversationId/messages", clearConversationMessages);
router.patch("/:conversationId/block", toggleBlockConversationUser);
router.patch("/:conversationId/restrict", toggleRestrictConversationUser);
router.patch("/:conversationId/theme", updateDirectConversationTheme);
router.patch("/:conversationId/nickname", updateConversationNickname);
router.patch("/:conversationId/group-nickname", updateGroupNickname);
router.patch("/:conversationId/mute", toggleConversationMute);
router.patch("/:conversationId/read-receipt", toggleConversationReadReceipt);
router.patch("/:conversationId/archive", toggleConversationArchive);
router.patch("/:conversationId/e2ee", toggleConversationE2EE);
router.post("/:conversationId/report", reportConversation);
router.get("/admin/group-reports", requireAdmin, listGroupReports);
router.patch("/admin/group-reports/:reportId/resolve", requireAdmin, resolveGroupReport);
router.patch("/admin/group-reports/:reportId/hide", requireAdmin, hideGroupReport);
router.patch("/:conversationId/seen", markAsSeen);

export default router;
