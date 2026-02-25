import mongoose from "mongoose";

const adminAuditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    action: {
      type: String,
      enum: [
        "grant_admin",
        "revoke_admin",
        "warn_user",
        "lock_user",
        "unlock_user",
        "delete_user",
        "admin_increase_streak",
        "admin_decrease_streak",
        "admin_reset_streak",
        "notify_user",
        "broadcast_notification",
      ],
      required: true,
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    ip: {
      type: String,
      trim: true,
      maxlength: 64,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

const AdminAuditLog = mongoose.model("AdminAuditLog", adminAuditLogSchema);
export default AdminAuditLog;
