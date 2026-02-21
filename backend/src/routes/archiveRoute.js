import express from "express";
import {
  createArchiveItem,
  deleteArchiveItem,
  getMyArchiveItems,
  updateArchiveItem,
} from "../controllers/archiveController.js";

const router = express.Router();

router.get("/", getMyArchiveItems);
router.post("/", createArchiveItem);
router.patch("/:itemId", updateArchiveItem);
router.delete("/:itemId", deleteArchiveItem);

export default router;
