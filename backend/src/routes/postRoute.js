import express from "express";
import {
  addPostComment,
  createPost,
  deletePost,
  getPostComments,
  getPostFeed,
  sharePost,
  togglePostLike,
  updatePost,
  listAdminPosts,
  updateAdminPostStatus,
  reportPost,
  listPostReports,
  resolvePostReport,
  hidePostReport,
  deletePostReport,
} from "../controllers/postController.js";
import { uploadPostMedia } from "../middlewares/uploadMiddleware.js";
import { requireAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", uploadPostMedia("media"), createPost);
router.get("/feed", getPostFeed);
router.patch("/:postId", uploadPostMedia("media"), updatePost);
router.delete("/:postId", deletePost);
router.post("/:postId/like", togglePostLike);
router.post("/:postId/share", sharePost);
router.get("/:postId/comments", getPostComments);
router.post("/:postId/comments", addPostComment);
router.post("/:postId/report", reportPost);

router.get("/admin/list", requireAdmin, listAdminPosts);
router.patch("/admin/:postId/status", requireAdmin, updateAdminPostStatus);
router.get("/admin/reports", requireAdmin, listPostReports);
router.patch("/admin/reports/:reportId/resolve", requireAdmin, resolvePostReport);
router.patch("/admin/reports/:reportId/hide", requireAdmin, hidePostReport);
router.delete("/admin/reports/:reportId", requireAdmin, deletePostReport);

export default router;
