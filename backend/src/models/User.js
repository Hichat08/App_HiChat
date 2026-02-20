import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    hashedPassword: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    emailUpdatedAt: {
      type: Date,
      default: null,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    displayNameUpdatedAt: {
      type: Date,
      default: null,
    },
    avatarUrl: {
      type: String, // link CDN để hiển thị hình
    },
    avatarId: {
      type: String, // Cloudinary public_id để xoá hình
    },
    coverUrl: {
      type: String,
    },
    coverId: {
      type: String,
    },
    bio: {
      type: String,
      maxlength: 500, // tuỳ
    },
    currentCity: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    hometown: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    birthday: {
      type: Date,
      default: null,
    },
    relationshipStatus: {
      type: String,
      enum: ["single", "in_relationship", "married", ""],
      default: "",
    },
    relationshipPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    contactInfoVisibility: {
      type: String,
      enum: ["only_me", "public", "friends"],
      default: "friends",
    },
    phone: {
      type: String,
      unique: true,
      sparse: true, // cho phép null, nhưng không được trùng
    },
    phoneUpdatedAt: {
      type: Date,
      default: null,
    },
    notificationSettings: {
      messageAlerts: {
        type: Boolean,
        default: true,
      },
      friendRequestAlerts: {
        type: Boolean,
        default: true,
      },
      securityAlerts: {
        type: Boolean,
        default: true,
      },
    },
    showOnlineStatus: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);
export default User;
