import express from "express";

import {
  acceptDirectRequest,
  rejectDirectRequest,
  sendDirectMessage,
  sendGroupMessage,
  uploadChatMedia,
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

export default router;
