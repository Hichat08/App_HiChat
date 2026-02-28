// @ts-nocheck
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const ADMIN_BYPASS = false;

const isAdminDevPath = (path = "") =>
  path.startsWith("/api/users/admin") ||
  path.startsWith("/api/posts/admin") ||
  path.startsWith("/api/users/support/admin") ||
  path.startsWith("/api/conversations/admin");

// authorization - xác minh user là ai
export const protectedRoute = (req, res, next) => {
  try {
    // lấy token từ header
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

    if (ADMIN_BYPASS && isAdminDevPath(req.path) && !token) {
      User.findOne({ role: "admin" })
        .select("-hashedPassword")
        .then((adminUser) => {
          if (!adminUser) {
            return res.status(403).json({ message: "Không tìm thấy tài khoản admin để bypass" });
          }
          req.user = adminUser;
          return next();
        })
        .catch((error) => {
          console.error("Lỗi ADMIN_BYPASS", error);
          return res.status(500).json({ message: "Lỗi hệ thống" });
        });
      return;
    }

    if (!token) {
      return res.status(401).json({ message: "Không tìm thấy access token" });
    }

    // xác nhận token hợp lệ
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, decodedUser) => {
      if (err) {
        if (ADMIN_BYPASS && isAdminDevPath(req.path)) {
          const adminUser = await User.findOne({ role: "admin" }).select("-hashedPassword");
          if (adminUser) {
            req.user = adminUser;
            return next();
          }
        }
        console.error(err);

        return res
          .status(403)
          .json({ message: "Access token hết hạn hoặc không đúng" });
      }

      // tìm user
      const user = await User.findById(decodedUser.userId).select("-hashedPassword");

      if (!user) {
        return res.status(404).json({ message: "người dùng không tồn tại." });
      }

      if (user.isLocked) {
        return res.status(423).json({
          message: "Tài khoản đã bị khóa",
          code: "USER_LOCKED",
          lockReason: user.lockReason || "",
          lockedAt: user.lockedAt,
        });
      }

      // trả user về trong req
      req.user = user;
      next();
    });
  } catch (error) {
    console.error("Lỗi khi xác minh JWT trong authMiddleware", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Cho phép user bị khóa truy cập các endpoint hỗ trợ (vẫn yêu cầu token hợp lệ).
export const protectedRouteAllowLocked = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Không tìm thấy access token" });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, decodedUser) => {
      if (err) {
        console.error(err);
        return res
          .status(403)
          .json({ message: "Access token hết hạn hoặc không đúng" });
      }

      const user = await User.findById(decodedUser.userId).select("-hashedPassword");

      if (!user) {
        return res.status(404).json({ message: "người dùng không tồn tại." });
      }

      req.user = user;
      next();
    });
  } catch (error) {
    console.error("Lỗi khi xác minh JWT trong authMiddleware", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const requireAdmin = (req, res, next) => {
  try {
    if (ADMIN_BYPASS) {
      console.warn("ADMIN_BYPASS đang bật - bỏ qua kiểm tra quyền admin");
      return next();
    }
    const role = req.user?.role || "user";
    if (role !== "admin") {
      return res.status(403).json({ message: "Bạn không có quyền admin" });
    }
    return next();
  } catch (error) {
    console.error("Lỗi khi kiểm tra quyền admin", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
