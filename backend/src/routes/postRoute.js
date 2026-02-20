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
} from "../controllers/postController.js";
import { uploadPostMedia } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.post("/", uploadPostMedia("media"), createPost);
router.get("/feed", getPostFeed);
router.patch("/:postId", uploadPostMedia("media"), updatePost);
router.delete("/:postId", deletePost);
router.post("/:postId/like", togglePostLike);
router.post("/:postId/share", sharePost);
router.get("/:postId/comments", getPostComments);
router.post("/:postId/comments", addPostComment);

export default router;
