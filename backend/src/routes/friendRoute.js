import express from "express";

import {
  acceptFriendRequest,
  sendFriendRequest,
  declineFriendRequest,
  getAllFriends,
  getFriendRequests,
  getFriendSuggestions,
  removeFriend,
  voteFriendLockIncident,
} from "../controllers/friendController.js";

const router = express.Router();

router.post("/requests", sendFriendRequest);

router.post("/requests/:requestId/accept", acceptFriendRequest);
router.post("/requests/:requestId/decline", declineFriendRequest);

router.get("/", getAllFriends);
router.get("/requests", getFriendRequests);
router.get("/suggestions", getFriendSuggestions);
router.delete("/:friendId", removeFriend);
router.post("/lock-votes", voteFriendLockIncident);

export default router;
