import express from "express";
import {
  getSupportAdmin,
  listSupportRequestsPublic,
  listSupportRequests,
  replySupportRequest,
  sendSupportMessage,
  sendSupportMessagePublic,
  updateSupportRequestStatus,
} from "../controllers/userController.js";
import {
  protectedRouteAllowLocked,
  protectedRoute,
  requireAdmin,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.all("/health", (req, res) => {
  return res.status(200).json({ ok: true });
});

// public + allow locked
router.get("/admin", protectedRouteAllowLocked, getSupportAdmin);
router.post("/message", protectedRouteAllowLocked, sendSupportMessage);
router.post("/message-public", sendSupportMessagePublic);
router.get("/messages-public", listSupportRequestsPublic);

// admin
router.get("/admin/support-requests", protectedRoute, requireAdmin, listSupportRequests);
router.patch(
  "/admin/support-requests/:requestId/status",
  protectedRoute,
  requireAdmin,
  updateSupportRequestStatus,
);
router.patch(
  "/admin/support-requests/:requestId/reply",
  protectedRoute,
  requireAdmin,
  replySupportRequest,
);

export default router;
