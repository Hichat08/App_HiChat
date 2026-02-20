import express from "express";
import {
  acceptRelationshipRequest,
  authMe,
  blockAndReportUser,
  changePassword,
  declineRelationshipRequest,
  deleteMyAccount,
  getRelationshipRequests,
  getUserFriendsById,
  getUserProfileById,
  searchUserByUsername,
  sendRelationshipRequest,
  updateProfile,
  updateOnlineVisibility,
  updateNotificationSettings,
  uploadAvatar,
  uploadCover,
} from "../controllers/userController.js";
import { uploadSingleImage } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.get("/me", authMe);
router.get("/search", searchUserByUsername);
router.get("/relationship-requests", getRelationshipRequests);
router.post("/relationship-requests", sendRelationshipRequest);
router.post("/relationship-requests/:requestId/accept", acceptRelationshipRequest);
router.post("/relationship-requests/:requestId/decline", declineRelationshipRequest);
router.get("/:userId/friends", getUserFriendsById);
router.get("/:userId", getUserProfileById);
router.patch("/profile", updateProfile);
router.post("/uploadAvatar", uploadSingleImage("file"), uploadAvatar);
router.post("/uploadCover", uploadSingleImage("file"), uploadCover);
router.patch("/password", changePassword);
router.patch("/notifications", updateNotificationSettings);
router.patch("/online-visibility", updateOnlineVisibility);
router.post("/block-report", blockAndReportUser);
router.delete("/me", deleteMyAccount);

export default router;
