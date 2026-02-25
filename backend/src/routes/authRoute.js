import express from "express";
import {
  refreshToken,
  signIn,
  signOut,
  signUp,
} from "../controllers/authController.js";
import {
  listSupportRequestsPublic,
  sendSupportMessagePublic,
} from "../controllers/userController.js";

const router = express.Router();

router.post("/signup", signUp);

router.post("/signin", signIn);

router.post("/signout", signOut);

router.post("/refresh", refreshToken);
router.post("/support/message-public", sendSupportMessagePublic);
router.get("/support/messages-public", listSupportRequestsPublic);

export default router;
