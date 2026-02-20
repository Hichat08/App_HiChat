import express from "express";
import {
  addGroupMembers,
  clearConversationMessages,
  createConversation,
  getConversations,
  getMessages,
  markAsSeen,
  toggleBlockConversationUser,
  toggleRestrictConversationUser,
  updateGroupAvatar,
} from "../controllers/conversationController.js";
import { checkFriendship } from "../middlewares/friendMiddleware.js";
import { uploadSingleImage } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.post("/", checkFriendship, createConversation);
router.post("/:conversationId/members", checkFriendship, addGroupMembers);
router.post("/:conversationId/avatar", uploadSingleImage("file"), updateGroupAvatar);
router.get("/", getConversations);
router.get("/:conversationId/messages", getMessages);
router.delete("/:conversationId/messages", clearConversationMessages);
router.patch("/:conversationId/block", toggleBlockConversationUser);
router.patch("/:conversationId/restrict", toggleRestrictConversationUser);
router.patch("/:conversationId/seen", markAsSeen);

export default router;
