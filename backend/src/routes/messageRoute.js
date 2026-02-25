import express from "express";

import {
  acceptDirectRequest,
  acceptDirectStreakMode,
  rejectDirectStreakMode,
  rejectDirectRequest,
  requestDirectStreakMode,
  sendDirectMessage,
  sendGroupMessage,
  uploadChatMedia,
  voteLockedRecipientIncident,
} from "../controllers/messageController.js";
import {
  checkGroupMembership,
} from "../middlewares/friendMiddleware.js";
import { uploadChatMediaSingle } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.post("/direct", sendDirectMessage);
router.post("/group", checkGroupMembership, sendGroupMessage);
router.post("/upload-media", uploadChatMediaSingle("file"), uploadChatMedia);
router.patch("/direct/:conversationId/accept", acceptDirectRequest);
router.patch("/direct/:conversationId/reject", rejectDirectRequest);
router.patch("/direct/:conversationId/streak-mode/request", requestDirectStreakMode);
router.patch("/direct/:conversationId/streak-mode/accept", acceptDirectStreakMode);
router.patch("/direct/:conversationId/streak-mode/reject", rejectDirectStreakMode);
router.post("/direct/locked-recipient-vote", voteLockedRecipientIncident);

export default router;
