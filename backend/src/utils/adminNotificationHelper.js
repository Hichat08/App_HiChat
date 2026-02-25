import User from "../models/User.js";
import { io } from "../socket/index.js";

export const emitAdminReportNotification = async ({
  reportId,
  reporter,
  target,
  reason,
  detail,
  createdAt,
  targetType,
  targetMeta,
}) => {
  try {
    const admin = await User.findOne({ role: "admin" }).select("_id").lean();
    if (!admin?._id) return;

    io.to(admin._id.toString()).emit("admin-report:new", {
      reportId: reportId?.toString?.() || reportId,
      reporter,
      target,
      reason,
      detail,
      createdAt,
      targetType,
      targetMeta,
    });
  } catch (error) {
    console.error("Lỗi khi gửi thông báo báo cáo tới admin", error);
  }
};
