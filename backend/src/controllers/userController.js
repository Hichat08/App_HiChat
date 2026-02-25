import { uploadImageFromBuffer } from "../middlewares/uploadMiddleware.js";
import User from "../models/User.js";
import Friend from "../models/Friend.js";
import bcrypt from "bcrypt";
import Session from "../models/Session.js";
import FriendRequest from "../models/FriendRequest.js";
import Conversation from "../models/Conversation.js";
import UserBlock from "../models/UserBlock.js";
import UserReport from "../models/UserReport.js";
import AdminAuditLog from "../models/AdminAuditLog.js";
import RelationshipRequest from "../models/RelationshipRequest.js";
import UserRestriction from "../models/UserRestriction.js";
import { io, setUserOnlineVisibility } from "../socket/index.js";
import Post from "../models/Post.js";
import { uploadMediaFromBuffer } from "../middlewares/uploadMiddleware.js";
import { emitAdminReportNotification } from "../utils/adminNotificationHelper.js";
import DeletedAccount from "../models/DeletedAccount.js";
import AppConfig from "../models/AppConfig.js";
import Message from "../models/Message.js";
import SupportRequest from "../models/SupportRequest.js";
import UserFollow from "../models/UserFollow.js";
import VerificationRequest from "../models/VerificationRequest.js";
import {
  getVerifiedPrivilegeSnapshot,
  normalizeVerificationTier,
} from "../utils/verifiedPrivilegeHelper.js";
import { toVietnamDateKey } from "../utils/streakDateHelper.js";

const DISPLAY_NAME_COOLDOWN_DAYS = 7;
const EMAIL_COOLDOWN_DAYS = 30;
const PHONE_COOLDOWN_DAYS = 30;

const normalizePhone = (value = "") => value.toString().replace(/\D/g, "");
const normalizeDisplayName = (value = "") =>
  value.toString().trim().replace(/\s+/g, " ");
const escapeRegex = (value = "") =>
  value.toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const daysBetween = (from, to = new Date()) => {
  if (!from) return Number.POSITIVE_INFINITY;
  const diffMs = new Date(to).getTime() - new Date(from).getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
};

const toFriendPair = (a, b) => {
  const aStr = a?.toString?.() || "";
  const bStr = b?.toString?.() || "";
  return aStr < bStr
    ? { userA: aStr, userB: bStr }
    : { userA: bStr, userB: aStr };
};

const escapeSvgText = (value = "") =>
  value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const createRelationshipHeartSvg = (selfName, partnerName) => {
  const safeSelf = escapeSvgText((selfName || "Bạn").slice(0, 40));
  const safePartner = escapeSvgText((partnerName || "Người ấy").slice(0, 40));
  const subtitle = escapeSvgText("Hôm nay tụi mình chính thức hẹn hò");
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff7ab6"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#ffd6ec" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#ffd6ec" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <circle cx="540" cy="420" r="290" fill="url(#glow)"/>
  <text x="540" y="430" text-anchor="middle" font-size="220" fill="white">❤</text>
  <text x="540" y="585" text-anchor="middle" font-size="120" fill="white">❤</text>
  <text x="540" y="740" text-anchor="middle" fill="white" font-size="64" font-family="Arial, sans-serif" font-weight="700">${safeSelf} &amp; ${safePartner}</text>
  <text x="540" y="810" text-anchor="middle" fill="rgba(255,255,255,0.92)" font-size="38" font-family="Arial, sans-serif">${subtitle}</text>
</svg>`.trim();
};

const createAutoRelationshipPostForUser = async ({
  authorId,
  authorName,
  partnerName,
}) => {
  try {
    const svg = createRelationshipHeartSvg(authorName, partnerName);
    const buffer = Buffer.from(svg, "utf8");
    const uploaded = await uploadMediaFromBuffer(buffer, "image/svg+xml");
    if (!uploaded?.secure_url) return;

    await Post.create({
      authorId,
      content: "💖 Tụi mình chính thức hẹn hò!",
      media: [{ url: uploaded.secure_url, type: "image" }],
      visibility: "public",
      allowedViewerIds: [],
    });
  } catch (error) {
    console.error("Lỗi khi tự động đăng bài hẹn hò", error);
  }
};

export const authMe = async (req, res) => {
  try {
    const user = req.user; // lấy từ authMiddleware

    return res.status(200).json({
      user,
    });
  } catch (error) {
    console.error("Lỗi khi gọi authMe", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const searchUserByUsername = async (req, res) => {
  try {
    const { username, phone, keyword } = req.query;
    const value = (keyword || username || phone || "").toString().trim();

    if (!value) {
      return res.status(400).json({
        message: "Cần cung cấp username hoặc số điện thoại trong query.",
      });
    }

    const lowered = value.toLowerCase();
    const normalizedPhone = normalizePhone(value);
    const escapedText = escapeRegex(value);
    const escapedPhone = escapeRegex(normalizedPhone);

    const candidates = await User.find({
      $or: [
        { username: { $regex: escapedText, $options: "i" } },
        { displayName: { $regex: escapedText, $options: "i" } },
        ...(normalizedPhone
          ? [{ phone: { $regex: escapedPhone, $options: "i" } }]
          : []),
      ],
    })
      .select("_id displayName username avatarUrl role isVerified")
      .limit(30)
      .lean();

    const score = (user) => {
      const uname = (user.username || "").toLowerCase();
      const dname = (user.displayName || "").toLowerCase();
      const verifiedBoost = user?.isVerified ? 20 : 0;
      if (uname === lowered || dname === lowered) return 100;
      if (uname.startsWith(lowered) || dname.startsWith(lowered)) return 80 + verifiedBoost;
      if (uname.includes(lowered) || dname.includes(lowered)) return 60 + verifiedBoost;
      return 10 + verifiedBoost;
    };

    const users = (candidates || []).sort((a, b) => {
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      if (!!b?.isVerified !== !!a?.isVerified) return b?.isVerified ? 1 : -1;
      return (a.displayName || "").localeCompare(b.displayName || "", "vi");
    });

    return res.status(200).json({
      users,
      user: users[0] || null,
    });
  } catch (error) {
    console.error("Lỗi xảy ra khi searchUserByUsername", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const uploadAvatar = async (req, res) => {
  try {
    const file = req.file;
    const userId = req.user._id;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await uploadImageFromBuffer(file.buffer, {}, file.mimetype);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        avatarUrl: result.secure_url,
        avatarId: result.public_id,
      },
      {
        new: true,
      },
    ).select("avatarUrl");

    if (!updatedUser.avatarUrl) {
      return res.status(400).json({ message: "Avatar trả về null" });
    }

    return res.status(200).json({ avatarUrl: updatedUser.avatarUrl });
  } catch (error) {
    console.error("Lỗi xảy ra khi upload avatar", error);
    return res.status(500).json({ message: "Upload failed" });
  }
};

export const uploadCover = async (req, res) => {
  try {
    const file = req.file;
    const userId = req.user._id;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await uploadImageFromBuffer(
      file.buffer,
      { folder: "hichat/covers" },
      file.mimetype,
    );

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        coverUrl: result.secure_url,
        coverId: result.public_id,
      },
      {
        new: true,
      },
    ).select("coverUrl");

    if (!updatedUser?.coverUrl) {
      return res.status(400).json({ message: "Cover trả về null" });
    }

    return res.status(200).json({ coverUrl: updatedUser.coverUrl });
  } catch (error) {
    console.error("Lỗi xảy ra khi upload cover", error);
    return res.status(500).json({ message: "Upload failed" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const {
      displayName,
      username,
      email,
      phone,
      bio,
      currentCity,
      hometown,
      birthday,
      relationshipStatus,
      contactInfoVisibility,
    } = req.body || {};

    const user = await User.findById(userId).select(
      "_id username email phone bio currentCity hometown birthday relationshipStatus relationshipPartnerId contactInfoVisibility displayName displayNameUpdatedAt emailUpdatedAt phoneUpdatedAt createdAt",
    );

    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    if (
      typeof username === "string" &&
      username.trim().toLowerCase() !== user.username.toLowerCase()
    ) {
      return res
        .status(400)
        .json({ message: "Tên đăng nhập là cố định, không thể thay đổi" });
    }

    const updatePayload = {};

    if (typeof displayName === "string") {
      const nextDisplayName = normalizeDisplayName(displayName);
      if (nextDisplayName && nextDisplayName !== user.displayName) {
        const passedDays = daysBetween(user.displayNameUpdatedAt);
        if (passedDays < DISPLAY_NAME_COOLDOWN_DAYS) {
          return res.status(400).json({
            message: `Tên hiển thị chỉ được đổi sau mỗi ${DISPLAY_NAME_COOLDOWN_DAYS} ngày`,
            remainingDays: DISPLAY_NAME_COOLDOWN_DAYS - passedDays,
          });
        }
        const duplicateDisplayName = await User.exists({
          _id: { $ne: userId },
          displayName: {
            $regex: `^${escapeRegex(nextDisplayName)}$`,
            $options: "i",
          },
        });
        if (duplicateDisplayName) {
          return res
            .status(409)
            .json({ message: "Tên hiển thị đã được sử dụng" });
        }
        updatePayload.displayName = nextDisplayName;
        updatePayload.displayNameUpdatedAt = new Date();
      }
    }

    if (typeof email === "string") {
      const nextEmail = email.trim().toLowerCase();
      if (nextEmail && nextEmail !== user.email) {
        const emailLastUpdatedAt = user.emailUpdatedAt || user.createdAt;
        const passedDays = daysBetween(emailLastUpdatedAt);
        if (passedDays < EMAIL_COOLDOWN_DAYS) {
          return res.status(400).json({
            message: `Email chỉ được đổi sau mỗi ${EMAIL_COOLDOWN_DAYS} ngày`,
            remainingDays: EMAIL_COOLDOWN_DAYS - passedDays,
          });
        }

        const duplicateEmail = await User.exists({
          _id: { $ne: userId },
          email: nextEmail,
        });
        if (duplicateEmail) {
          return res.status(409).json({ message: "Email đã được sử dụng" });
        }

        updatePayload.email = nextEmail;
        updatePayload.emailUpdatedAt = new Date();
      }
    }

    if (typeof phone === "string") {
      const nextPhone = normalizePhone(phone);
      if (nextPhone && nextPhone !== user.phone) {
        if (nextPhone.length < 9) {
          return res
            .status(400)
            .json({ message: "Số điện thoại không hợp lệ" });
        }

        const phoneLastUpdatedAt = user.phoneUpdatedAt || user.createdAt;
        const passedDays = daysBetween(phoneLastUpdatedAt);
        if (passedDays < PHONE_COOLDOWN_DAYS) {
          return res.status(400).json({
            message: `Số điện thoại chỉ được đổi sau mỗi ${PHONE_COOLDOWN_DAYS} ngày`,
            remainingDays: PHONE_COOLDOWN_DAYS - passedDays,
          });
        }

        const duplicatePhone = await User.exists({
          _id: { $ne: userId },
          phone: nextPhone,
        });
        if (duplicatePhone) {
          return res
            .status(409)
            .json({ message: "Số điện thoại đã được sử dụng" });
        }
        updatePayload.phone = nextPhone;
        updatePayload.phoneUpdatedAt = new Date();
      }
    }

    if (typeof bio === "string") {
      updatePayload.bio = bio.trim();
    }

    if (typeof currentCity === "string") {
      updatePayload.currentCity = currentCity.trim();
    }

    if (typeof hometown === "string") {
      const normalizedHometown = hometown.trim();
      if (!normalizedHometown) {
        return res.status(400).json({ message: "Quê quán là bắt buộc" });
      }
      updatePayload.hometown = normalizedHometown;
    }

    if (typeof birthday === "string") {
      const normalizedBirthday = birthday.trim();
      if (!normalizedBirthday) {
        updatePayload.birthday = null;
      } else {
        const parsedBirthday = new Date(normalizedBirthday);
        if (Number.isNaN(parsedBirthday.getTime())) {
          return res.status(400).json({ message: "Ngày sinh không hợp lệ" });
        }
        updatePayload.birthday = parsedBirthday;
      }
    }

    if (typeof relationshipStatus === "string") {
      const normalizedRelationshipStatus = relationshipStatus.trim();
      const allowedRelationshipStatus = new Set([
        "single",
        "in_relationship",
        "married",
        "",
      ]);
      if (!allowedRelationshipStatus.has(normalizedRelationshipStatus)) {
        return res
          .status(400)
          .json({ message: "Trạng thái mối quan hệ không hợp lệ" });
      }
      if (
        normalizedRelationshipStatus === "in_relationship" &&
        !user.relationshipPartnerId
      ) {
        return res.status(400).json({
          message:
            "Vui lòng gửi lời mời hẹn hò để cập nhật trạng thái đang hẹn hò",
        });
      }
      updatePayload.relationshipStatus = normalizedRelationshipStatus;

      if (normalizedRelationshipStatus !== "in_relationship") {
        const oldPartnerId = user.relationshipPartnerId?.toString?.();
        updatePayload.relationshipPartnerId = null;
        if (oldPartnerId) {
          await User.findByIdAndUpdate(oldPartnerId, {
            $set: {
              relationshipStatus: "single",
              relationshipPartnerId: null,
            },
          });

          const pair = toFriendPair(userId, oldPartnerId);
          const friendship = await Friend.findOne(pair).lean();
          const nextType = friendship ? "friends" : null;
          const nextStatus = friendship ? "active" : "none";

          const conversation = await Conversation.findOne({
            type: "direct",
            "participants.userId": { $all: [userId, oldPartnerId] },
          });

          if (conversation) {
            const currentStatus = conversation.streakMode?.status || "none";
            const currentType = conversation.streakMode?.type || null;
            if (currentStatus !== nextStatus || currentType !== nextType) {
              conversation.streakMode = {
                type: nextType,
                status: nextStatus,
                requestedBy: null,
                requestedAt: null,
                acceptedUserIds: [],
                activatedAt:
                  nextStatus === "active"
                    ? conversation.streakMode?.activatedAt || new Date()
                    : null,
              };
              if (currentStatus !== nextStatus) {
                conversation.streak.count = 0;
                conversation.streak.lastCountedDay = null;
                conversation.streak.missLevel = 0;
                conversation.lastMessageDayBy = new Map();
              }
            }

            if (conversation.directThemeId === "rose") {
              conversation.directThemeId = "violet";
            }

            await conversation.save();

            const payload = {
              _id: conversation._id,
              streakMode: {
                type: conversation.streakMode?.type || null,
                status: conversation.streakMode?.status || "none",
                requestedBy: null,
                requestedAt: null,
                acceptedUserIds: [],
                activatedAt: conversation.streakMode?.activatedAt || null,
              },
              directThemeId: conversation.directThemeId || "violet",
              streakCount: conversation.streak?.count || 0,
              streakMissLevel: conversation.streak?.missLevel || 0,
              streakCompletedToday: false,
              streakAtRisk: false,
              streakExpiresAt: null,
              streakRecoveryMode: null,
              streakLost: false,
            };

            conversation.participants.forEach((participant) => {
              io.to(participant.userId.toString()).emit(
                "direct-streak-mode-updated",
                payload,
              );
            });

            io.to(conversation._id.toString()).emit(
              "conversation-theme-updated",
              {
                conversationId: conversation._id.toString(),
                directThemeId: conversation.directThemeId || "violet",
              },
            );
          }
        }
      }
    }

    if (typeof contactInfoVisibility === "string") {
      const normalizedContactInfoVisibility = contactInfoVisibility.trim();
      const allowedVisibility = new Set(["only_me", "public", "friends"]);
      if (!allowedVisibility.has(normalizedContactInfoVisibility)) {
        return res
          .status(400)
          .json({ message: "Quyền xem thông tin liên lạc không hợp lệ" });
      }
      updatePayload.contactInfoVisibility = normalizedContactInfoVisibility;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updatePayload },
      { new: true },
    )
      .select("-hashedPassword")
      .populate("relationshipPartnerId", "_id displayName username avatarUrl");

    return res.status(200).json({
      message: "Đã cập nhật thông tin cá nhân",
      user: {
        ...updatedUser.toObject(),
        relationshipPartner: updatedUser.relationshipPartnerId
          ? {
              _id: updatedUser.relationshipPartnerId._id,
              displayName: updatedUser.relationshipPartnerId.displayName,
              username: updatedUser.relationshipPartnerId.username,
              avatarUrl: updatedUser.relationshipPartnerId.avatarUrl ?? null,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật thông tin cá nhân", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getUserProfileById = async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user._id.toString();
    const targetId = userId.toString();
    const isMe = viewerId === targetId;

    const userSelect =
      "_id username displayName avatarUrl coverUrl bio currentCity hometown birthday relationshipStatus relationshipPartnerId contactInfoVisibility createdAt email phone displayNameUpdatedAt emailUpdatedAt phoneUpdatedAt isVerified verifiedAt verificationTier verificationSource";

    const user = await User.findById(userId)
      .select(userSelect)
      .populate("relationshipPartnerId", "_id displayName username avatarUrl");

    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const getFriendIds = async (id) => {
      const rows = await Friend.find({
        $or: [{ userA: id }, { userB: id }],
      })
        .select("userA userB")
        .lean();

      const set = new Set();
      rows.forEach((row) => {
        const a = row.userA.toString();
        const b = row.userB.toString();
        set.add(a === id ? b : a);
      });
      return Array.from(set);
    };

    const targetFriendIds = await getFriendIds(targetId);
    const friendCount = targetFriendIds.length;

    const [userA, userB] =
      viewerId < targetId ? [viewerId, targetId] : [targetId, viewerId];
    const friendship = await Friend.findOne({ userA, userB }).lean();

    let mutualFriendIds = [];
    if (viewerId !== targetId) {
      const viewerFriendIds = await getFriendIds(viewerId);
      const viewerSet = new Set(viewerFriendIds);
      mutualFriendIds = targetFriendIds.filter((id) => viewerSet.has(id));
    } else {
      mutualFriendIds = targetFriendIds;
    }

    const previewIds = mutualFriendIds.slice(0, 7);
    const mutualFriends = previewIds.length
      ? await User.find({ _id: { $in: previewIds } })
          .select("_id displayName username avatarUrl")
          .lean()
      : [];

    const contactVisibility = user.contactInfoVisibility || "friends";
    const canViewContactInfo =
      isMe ||
      contactVisibility === "public" ||
      (contactVisibility === "friends" && !!friendship);
    const userPayload = {
      ...user.toObject(),
      relationshipPartner: user.relationshipPartnerId
        ? {
            _id: user.relationshipPartnerId._id,
            displayName: user.relationshipPartnerId.displayName,
            username: user.relationshipPartnerId.username,
            avatarUrl: user.relationshipPartnerId.avatarUrl ?? null,
          }
        : null,
    };

    if (!canViewContactInfo) {
      delete userPayload.email;
      delete userPayload.phone;
    }

    if (!isMe) {
      delete userPayload.contactInfoVisibility;
    }

    const [followerCount, followingCount, followRow] = await Promise.all([
      UserFollow.countDocuments({ followingId: targetId }),
      UserFollow.countDocuments({ followerId: targetId }),
      viewerId === targetId
        ? Promise.resolve(null)
        : UserFollow.findOne({ followerId: viewerId, followingId: targetId })
            .select("_id")
            .lean(),
    ]);

    return res.status(200).json({
      user: userPayload,
      isMe,
      isFriend: !!friendship,
      friendCount,
      mutualCount: mutualFriendIds.length,
      mutualFriends,
      followerCount,
      followingCount,
      isFollowing: !!followRow,
      verifiedPrivileges: getVerifiedPrivilegeSnapshot(userPayload),
    });
  } catch (error) {
    console.error("Lỗi khi lấy trang cá nhân người dùng", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const followUser = async (req, res) => {
  try {
    const followerId = req.user._id.toString();
    const followingId = req.params.userId?.toString?.();

    if (!followingId) {
      return res.status(400).json({ message: "Thiếu userId" });
    }

    if (followerId === followingId) {
      return res.status(400).json({ message: "Không thể tự theo dõi chính mình" });
    }

    const targetExists = await User.exists({ _id: followingId });
    if (!targetExists) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    await UserFollow.updateOne(
      { followerId, followingId },
      { $setOnInsert: { followerId, followingId } },
      { upsert: true },
    );

    const [followerCount, followingCount] = await Promise.all([
      UserFollow.countDocuments({ followingId }),
      UserFollow.countDocuments({ followerId: followingId }),
    ]);

    return res.status(200).json({
      message: "Đã theo dõi",
      isFollowing: true,
      followerCount,
      followingCount,
    });
  } catch (error) {
    console.error("Lỗi khi theo dõi người dùng", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const unfollowUser = async (req, res) => {
  try {
    const followerId = req.user._id.toString();
    const followingId = req.params.userId?.toString?.();

    if (!followingId) {
      return res.status(400).json({ message: "Thiếu userId" });
    }

    if (followerId === followingId) {
      return res.status(400).json({ message: "Không thể bỏ theo dõi chính mình" });
    }

    await UserFollow.deleteOne({ followerId, followingId });

    const [followerCount, followingCount] = await Promise.all([
      UserFollow.countDocuments({ followingId }),
      UserFollow.countDocuments({ followerId: followingId }),
    ]);

    return res.status(200).json({
      message: "Đã bỏ theo dõi",
      isFollowing: false,
      followerCount,
      followingCount,
    });
  } catch (error) {
    console.error("Lỗi khi bỏ theo dõi người dùng", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const sendRelationshipRequest = async (req, res) => {
  try {
    const fromUserId = req.user._id.toString();
    const toUserId = req.body?.toUserId?.toString?.();

    if (!toUserId) {
      return res.status(400).json({ message: "Thiếu người dùng muốn hẹn hò" });
    }

    if (fromUserId === toUserId) {
      return res
        .status(400)
        .json({ message: "Không thể gửi lời mời hẹn hò cho chính mình" });
    }

    const [fromUser, toUser] = await Promise.all([
      User.findById(fromUserId).select(
        "_id relationshipStatus relationshipPartnerId",
      ),
      User.findById(toUserId).select(
        "_id relationshipStatus relationshipPartnerId",
      ),
    ]);

    if (!toUser) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    if (!fromUser) {
      return res.status(404).json({ message: "Người gửi không tồn tại" });
    }

    const pair = toFriendPair(fromUserId, toUserId);
    const friendship = await Friend.findOne(pair).lean();
    if (!friendship) {
      return res.status(403).json({
        message: "Chỉ có thể gửi lời mời hẹn hò cho bạn bè",
      });
    }

    if (fromUser.relationshipPartnerId || toUser.relationshipPartnerId) {
      return res
        .status(400)
        .json({ message: "Một trong hai người đã có trạng thái hẹn hò" });
    }

    const blocked = await UserBlock.findOne({
      $or: [
        { blockerId: fromUserId, blockedId: toUserId },
        { blockerId: toUserId, blockedId: fromUserId },
      ],
    }).lean();
    if (blocked) {
      return res
        .status(403)
        .json({ message: "Không thể gửi lời mời vì có quan hệ chặn" });
    }

    const existing = await RelationshipRequest.findOne({
      status: "pending",
      $or: [
        { from: fromUserId, to: toUserId },
        { from: toUserId, to: fromUserId },
      ],
    }).lean();

    if (existing) {
      return res
        .status(400)
        .json({ message: "Đã có lời mời hẹn hò đang chờ xử lý" });
    }

    const request = await RelationshipRequest.create({
      from: fromUserId,
      to: toUserId,
      status: "pending",
    });

    return res.status(201).json({
      message: "Đã gửi lời mời hẹn hò",
      request,
    });
  } catch (error) {
    console.error("Lỗi khi gửi lời mời hẹn hò", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getRelationshipRequests = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    const [received, sent] = await Promise.all([
      RelationshipRequest.find({ to: userId, status: "pending" })
        .populate("from", "_id displayName username avatarUrl")
        .sort({ createdAt: -1 })
        .lean(),
      RelationshipRequest.find({ from: userId, status: "pending" })
        .populate("to", "_id displayName username avatarUrl")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    return res.status(200).json({ received, sent });
  } catch (error) {
    console.error("Lỗi khi lấy lời mời hẹn hò", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const acceptRelationshipRequest = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { requestId } = req.params;

    const request = await RelationshipRequest.findById(requestId);
    if (!request || request.status !== "pending") {
      return res.status(404).json({ message: "Không tìm thấy lời mời hẹn hò" });
    }

    if (request.to.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xử lý lời mời này" });
    }

    const fromUserId = request.from.toString();
    const toUserId = request.to.toString();

    const [fromUser, toUser] = await Promise.all([
      User.findById(fromUserId).select("_id displayName relationshipPartnerId"),
      User.findById(toUserId).select("_id displayName relationshipPartnerId"),
    ]);

    if (!fromUser || !toUser) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    if (fromUser.relationshipPartnerId || toUser.relationshipPartnerId) {
      return res
        .status(400)
        .json({ message: "Một trong hai người đã có trạng thái hẹn hò" });
    }

    const pair = toFriendPair(fromUserId, toUserId);
    const friendship = await Friend.findOne(pair).lean();
    if (!friendship) {
      return res.status(403).json({
        message: "Hai người phải là bạn bè để xác nhận hẹn hò",
      });
    }

    await Promise.all([
      User.findByIdAndUpdate(fromUserId, {
        $set: {
          relationshipStatus: "in_relationship",
          relationshipPartnerId: toUserId,
        },
      }),
      User.findByIdAndUpdate(toUserId, {
        $set: {
          relationshipStatus: "in_relationship",
          relationshipPartnerId: fromUserId,
        },
      }),
      RelationshipRequest.findByIdAndUpdate(requestId, {
        $set: { status: "accepted" },
      }),
      RelationshipRequest.updateMany(
        {
          status: "pending",
          $or: [
            { from: fromUserId },
            { to: fromUserId },
            { from: toUserId },
            { to: toUserId },
          ],
          _id: { $ne: requestId },
        },
        { $set: { status: "declined" } },
      ),
    ]);

    const conversation = await Conversation.findOne({
      type: "direct",
      "participants.userId": { $all: [fromUserId, toUserId] },
    });

    if (conversation) {
      conversation.streakMode = {
        type: "love",
        status: "active",
        requestedBy: null,
        requestedAt: null,
        acceptedUserIds: [],
        activatedAt: new Date(),
      };
      conversation.directThemeId = "rose";
      await conversation.save();

      const payload = {
        _id: conversation._id,
        streakMode: {
          type: "love",
          status: "active",
          requestedBy: null,
          requestedAt: null,
          acceptedUserIds: [],
          activatedAt: conversation.streakMode.activatedAt,
        },
        directThemeId: conversation.directThemeId || "violet",
        streakCount: conversation.streak?.count || 0,
        streakMissLevel: conversation.streak?.missLevel || 0,
        streakCompletedToday: false,
        streakAtRisk: false,
        streakExpiresAt: null,
        streakRecoveryMode: null,
        streakLost: false,
      };

      conversation.participants.forEach((participant) => {
        io.to(participant.userId.toString()).emit(
          "direct-streak-mode-updated",
          payload,
        );
      });
      io.to(conversation._id.toString()).emit("conversation-theme-updated", {
        conversationId: conversation._id.toString(),
        directThemeId: conversation.directThemeId || "violet",
      });
    }

    // Auto-create a heart post for the user who accepted the relationship request.
    await createAutoRelationshipPostForUser({
      authorId: toUserId,
      authorName: toUser.displayName || "Bạn",
      partnerName: fromUser.displayName || "Người ấy",
    });

    const updatedMe = await User.findById(toUserId)
      .select("-hashedPassword")
      .populate("relationshipPartnerId", "_id displayName username avatarUrl");

    return res.status(200).json({
      message: "Bạn đã đồng ý lời mời hẹn hò",
      user: {
        ...updatedMe.toObject(),
        relationshipPartner: updatedMe.relationshipPartnerId
          ? {
              _id: updatedMe.relationshipPartnerId._id,
              displayName: updatedMe.relationshipPartnerId.displayName,
              username: updatedMe.relationshipPartnerId.username,
              avatarUrl: updatedMe.relationshipPartnerId.avatarUrl ?? null,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Lỗi khi đồng ý lời mời hẹn hò", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const declineRelationshipRequest = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { requestId } = req.params;

    const request = await RelationshipRequest.findById(requestId);
    if (!request || request.status !== "pending") {
      return res.status(404).json({ message: "Không tìm thấy lời mời hẹn hò" });
    }

    if (request.to.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xử lý lời mời này" });
    }

    await RelationshipRequest.findByIdAndUpdate(requestId, {
      $set: { status: "declined" },
    });

    return res.status(200).json({ message: "Đã từ chối lời mời hẹn hò" });
  } catch (error) {
    console.error("Lỗi khi từ chối lời mời hẹn hò", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getUserFriendsById = async (req, res) => {
  try {
    const { userId } = req.params;

    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const friendships = await Friend.find({
      $or: [{ userA: userId }, { userB: userId }],
    })
      .populate("userA", "_id displayName avatarUrl username isVerified")
      .populate("userB", "_id displayName avatarUrl username isVerified")
      .lean();

    const friends = friendships
      .map((f) =>
        f.userA?._id?.toString() === userId.toString() ? f.userB : f.userA,
      )
      .filter(Boolean);

    return res.status(200).json({ friends });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách bạn bè theo userId", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id.toString();

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Cần cung cấp mật khẩu hiện tại và mật khẩu mới" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Mật khẩu mới phải có ít nhất 6 ký tự" });
    }

    const user = await User.findById(userId).select(
      "hashedPassword username displayName",
    );
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.hashedPassword);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Mật khẩu hiện tại không chính xác" });
    }

    user.hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.save();

    await Session.deleteMany({ userId });
    res.clearCookie("refreshToken");

    return res.status(200).json({
      message: "Đổi mật khẩu thành công. Vui lòng đăng nhập lại.",
    });
  } catch (error) {
    console.error("Lỗi khi đổi mật khẩu", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const {
      messageAlerts,
      friendRequestAlerts,
      securityAlerts,
      callSoundEnabled,
      messageSoundEnabled,
    } = req.body || {};

    const updatePayload = {
      ...(typeof messageAlerts === "boolean" ? { messageAlerts } : {}),
      ...(typeof friendRequestAlerts === "boolean"
        ? { friendRequestAlerts }
        : {}),
      ...(typeof securityAlerts === "boolean" ? { securityAlerts } : {}),
      ...(typeof callSoundEnabled === "boolean" ? { callSoundEnabled } : {}),
      ...(typeof messageSoundEnabled === "boolean"
        ? { messageSoundEnabled }
        : {}),
    };

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          notificationSettings: {
            messageAlerts:
              updatePayload.messageAlerts ??
              req.user.notificationSettings?.messageAlerts ??
              true,
            callSoundEnabled:
              updatePayload.callSoundEnabled ??
              req.user.notificationSettings?.callSoundEnabled ??
              true,
            messageSoundEnabled:
              updatePayload.messageSoundEnabled ??
              req.user.notificationSettings?.messageSoundEnabled ??
              true,
            friendRequestAlerts:
              updatePayload.friendRequestAlerts ??
              req.user.notificationSettings?.friendRequestAlerts ??
              true,
            securityAlerts:
              updatePayload.securityAlerts ??
              req.user.notificationSettings?.securityAlerts ??
              true,
          },
        },
      },
      { new: true },
    ).select("notificationSettings");

    return res.status(200).json({
      message: "Đã cập nhật cài đặt thông báo",
      notificationSettings: updatedUser?.notificationSettings,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật cài đặt thông báo", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const blockAndReportUser = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { username, reason, detail, blockUser = true } = req.body || {};

    if (!username || !reason) {
      return res
        .status(400)
        .json({ message: "Thiếu username hoặc lý do báo cáo" });
    }

    const target = await User.findOne({
      username: username.toLowerCase().trim(),
    }).select("_id username displayName avatarUrl");

    if (!target) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy người dùng cần báo cáo" });
    }

    if (target._id.toString() === userId) {
      return res
        .status(400)
        .json({ message: "Bạn không thể tự chặn hoặc tự báo cáo chính mình" });
    }

    const reportDoc = await UserReport.create({
      reporterId: userId,
      targetId: target._id,
      reason: reason.trim(),
      detail: detail?.trim() || "",
    });

    emitAdminReportNotification({
      reportId: reportDoc?._id,
      reporter: {
        _id: userId,
        displayName: req.user?.displayName || "Người dùng",
        avatarUrl: req.user?.avatarUrl ?? null,
      },
      target: {
        _id: target._id?.toString?.() || target._id,
        displayName: target.displayName || target.username || "Người dùng",
        avatarUrl: target.avatarUrl ?? null,
      },
      reason: reason.trim(),
      detail: detail?.trim() || "",
      createdAt:
        reportDoc?.createdAt?.toISOString?.() || new Date().toISOString(),
    });

    if (blockUser) {
      await UserBlock.updateOne(
        { blockerId: userId, blockedId: target._id },
        { $setOnInsert: { reason: detail?.trim() || reason.trim() } },
        { upsert: true },
      );

      // clear friendship/request between two users when blocked
      const [a, b] =
        userId < target._id.toString()
          ? [userId, target._id.toString()]
          : [target._id.toString(), userId];

      await Promise.all([
        Friend.deleteOne({ userA: a, userB: b }),
        FriendRequest.deleteMany({
          $or: [
            { from: userId, to: target._id },
            { from: target._id, to: userId },
          ],
        }),
      ]);
    }

    return res.status(200).json({
      message: blockUser
        ? "Đã chặn và gửi báo cáo thành công"
        : "Đã gửi báo cáo thành công",
    });
  } catch (error) {
    console.error("Lỗi khi chặn & báo cáo người dùng", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

const purgeUserAccountData = async ({ userId, username, displayName }) => {
  await Promise.all([
    Session.deleteMany({ userId }),
    Friend.deleteMany({ $or: [{ userA: userId }, { userB: userId }] }),
    FriendRequest.deleteMany({ $or: [{ from: userId }, { to: userId }] }),
    UserBlock.deleteMany({
      $or: [{ blockerId: userId }, { blockedId: userId }],
    }),
    UserRestriction.deleteMany({
      $or: [{ userId }, { restrictedUserId: userId }],
    }),
    UserReport.deleteMany({
      $or: [{ reporterId: userId }, { targetId: userId }],
    }),
    UserFollow.deleteMany({
      $or: [{ followerId: userId }, { followingId: userId }],
    }),
    VerificationRequest.deleteMany({ userId }),
  ]);

  if (username) {
    try {
      await DeletedAccount.updateOne(
        { username: username.toLowerCase() },
        {
          $set: {
            username: username.toLowerCase(),
            displayName: displayName || "",
            deletedAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      console.error("Lỗi khi lưu thông tin tài khoản đã xoá", error);
    }
  }

  const conversations = await Conversation.find({
    "participants.userId": userId,
  }).select("_id type participants group");

  for (const convo of conversations) {
    if (convo.type === "direct") {
      await Message.deleteMany({ conversationId: convo._id });
      await Conversation.deleteOne({ _id: convo._id });
      continue;
    }

    convo.participants = convo.participants.filter(
      (p) => p.userId.toString() !== userId,
    );
    convo.unreadCounts?.delete?.(userId);
    convo.seenBy = (convo.seenBy || []).filter(
      (id) => id.toString() !== userId,
    );

    if (convo.group?.createdBy?.toString() === userId) {
      convo.group.createdBy = convo.participants[0]?.userId ?? null;
    }

    if (!convo.participants.length) {
      await Message.deleteMany({ conversationId: convo._id });
      await Conversation.deleteOne({ _id: convo._id });
    } else {
      await convo.save();
    }
  }

  await User.deleteOne({ _id: userId });
};

export const deleteMyAccount = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { password } = req.body || {};

    if (!password) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập mật khẩu để xác nhận" });
    }

    const user = await User.findById(userId).select("hashedPassword");
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const isMatch = await bcrypt.compare(password, user.hashedPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu không chính xác" });
    }

    await purgeUserAccountData({
      userId,
      username: user.username,
      displayName: user.displayName,
    });
    res.clearCookie("refreshToken");

    return res.status(200).json({ message: "Đã xoá tài khoản thành công" });
  } catch (error) {
    console.error("Lỗi khi xoá tài khoản", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const deleteUserByAdmin = async (req, res) => {
  try {
    const actorId = req.user?._id?.toString();
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "Thiếu userId" });
    }

    if (actorId === userId.toString()) {
      return res.status(400).json({ message: "Không thể tự xóa tài khoản admin bằng thao tác này" });
    }

    const targetUser = await User.findById(userId).select("_id username displayName role");
    if (!targetUser) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    if (targetUser.role === "admin") {
      return res.status(400).json({ message: "Không thể xóa tài khoản admin" });
    }

    await purgeUserAccountData({
      userId: targetUser._id.toString(),
      username: targetUser.username,
      displayName: targetUser.displayName,
    });

    await AdminAuditLog.create({
      actorId,
      targetId: userId,
      action: "delete_user",
      reason: "admin_delete_user",
      ip: req.ip || req.headers["x-forwarded-for"] || "",
    }).catch(() => null);

    return res.status(200).json({ message: "Đã xóa tài khoản người dùng" });
  } catch (error) {
    console.error("Lỗi khi admin xóa tài khoản người dùng", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateOnlineVisibility = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { showOnlineStatus } = req.body || {};

    if (typeof showOnlineStatus !== "boolean") {
      return res
        .status(400)
        .json({ message: "showOnlineStatus phải là giá trị boolean" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { showOnlineStatus } },
      { new: true },
    ).select("_id showOnlineStatus");

    setUserOnlineVisibility(userId, showOnlineStatus);

    return res.status(200).json({
      message: "Đã cập nhật trạng thái hiển thị online",
      showOnlineStatus: updatedUser?.showOnlineStatus ?? showOnlineStatus,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật hiển thị online", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, reason } = req.body || {};
    const actorId = req.user?._id?.toString();

    const allowedRoles = new Set(["user", "admin"]);
    if (!allowedRoles.has(role)) {
      return res.status(400).json({ message: "Role không hợp lệ" });
    }

    if (role === "admin") {
      const existingAdmin = await User.findOne({
        role: "admin",
        _id: { $ne: userId },
      }).select("_id");
      if (existingAdmin) {
        return res
          .status(400)
          .json({ message: "Chỉ cho phép 1 admin duy nhất" });
      }
    }

    if (role !== "admin") {
      const otherAdminCount = await User.countDocuments({
        role: "admin",
        _id: { $ne: userId },
      });

      // prevent removing the last remaining admin
      if (otherAdminCount === 0) {
        return res
          .status(400)
          .json({ message: "Không thể hạ cấp admin duy nhất" });
      }
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { role } },
      { new: true },
    ).select("_id username displayName role");

    if (!updated) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const action = role === "admin" ? "grant_admin" : "revoke_admin";
    await AdminAuditLog.create({
      actorId,
      targetId: userId,
      action,
      reason: typeof reason === "string" ? reason.trim() : "",
      ip: req.ip || req.headers["x-forwarded-for"] || "",
    });

    return res.status(200).json({
      message: "Đã cập nhật quyền",
      user: updated,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật role", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const listAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: "admin" })
      .select("_id username displayName avatarUrl role createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ admins });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách admin", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getSupportAdmin = async (req, res) => {
  try {
    const admin = await User.findOne({ role: "admin" })
      .select("_id username displayName avatarUrl role createdAt")
      .sort({ createdAt: -1 })
      .lean();

    if (!admin?._id) {
      return res.status(404).json({ message: "Không tìm thấy admin hỗ trợ" });
    }

    return res.status(200).json({ admin });
  } catch (error) {
    console.error("Lỗi khi lấy admin hỗ trợ", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const sendSupportMessage = async (req, res) => {
  try {
    const userId = req.user?._id?.toString?.();
    const { message } = req.body || {};

    if (!message || !message.toString().trim()) {
      return res.status(400).json({ message: "Vui lòng nhập nội dung hỗ trợ" });
    }

    const admin = await User.findOne({ role: "admin" })
      .select("_id username displayName avatarUrl")
      .lean();

    const requesterName =
      req.user?.displayName || req.user?.username || "Người dùng";
    const requesterUsername = (req.user?.username || "").toString().trim().toLowerCase();

    await SupportRequest.create({
      requesterId: userId || null,
      requesterName,
      requesterUsername,
      message: message.toString().trim(),
    });

    if (!admin?._id) {
      console.warn("sendSupportMessage: no admin found to notify");
      return res
        .status(200)
        .json({
          message: "Đã gửi yêu cầu hỗ trợ. Hiện không có admin, sẽ xử lý sớm.",
        });
    }

    emitAdminReportNotification({
      reportId: `support-${Date.now()}`,
      reporter: {
        _id: userId,
        displayName: requesterName,
        avatarUrl: req.user?.avatarUrl ?? null,
      },
      target: {
        _id: admin._id?.toString?.() || admin._id,
        displayName: admin.displayName || admin.username || "Admin",
        avatarUrl: admin.avatarUrl ?? null,
      },
      reason: "Yêu cầu mở khóa tài khoản",
      detail: message.toString().trim(),
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({ message: "Đã gửi yêu cầu hỗ trợ" });
  } catch (error) {
    console.error("Lỗi khi gửi yêu cầu hỗ trợ", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const sendSupportMessagePublic = async (req, res) => {
  try {
    const { message, displayName, username } = req.body || {};

    if (!message || !message.toString().trim()) {
      return res.status(400).json({ message: "Vui lòng nhập nội dung hỗ trợ" });
    }

    const admin = await User.findOne({ role: "admin" })
      .select("_id username displayName avatarUrl")
      .lean();

    const normalizedUsername = (username || "").toString().trim().toLowerCase();
    const linkedUser = normalizedUsername
      ? await User.findOne({ username: normalizedUsername })
          .select("_id username displayName avatarUrl")
          .lean()
      : null;

    const requesterName =
      linkedUser?.displayName ||
      (displayName || "").toString().trim() ||
      linkedUser?.username ||
      normalizedUsername ||
      "Người dùng";

    // create support request regardless of admin existence
    await SupportRequest.create({
      requesterId: linkedUser?._id || null,
      requesterName,
      requesterUsername:
        linkedUser?.username?.toString?.().trim?.().toLowerCase?.() ||
        normalizedUsername,
      message: message.toString().trim(),
    });

    if (!admin?._id) {
      // no admin to notify, still count as success
      console.warn("sendSupportMessagePublic: no admin found to notify");
      return res.status(200).json({
        message:
          "Đã gửi yêu cầu hỗ trợ. Hiện tại không có admin nào, chúng tôi sẽ kiểm tra mail/hotline sớm.",
      });
    }

    emitAdminReportNotification({
      reportId: `support-${Date.now()}`,
      reporter: {
        _id: linkedUser?._id || null,
        displayName: requesterName,
        avatarUrl: linkedUser?.avatarUrl ?? null,
      },
      target: {
        _id: admin._id?.toString?.() || admin._id,
        displayName: admin.displayName || admin.username || "Admin",
        avatarUrl: admin.avatarUrl ?? null,
      },
      reason: "Yêu cầu mở khóa tài khoản",
      detail: message.toString().trim(),
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({ message: "Đã gửi yêu cầu hỗ trợ" });
  } catch (error) {
    console.error("Lỗi khi gửi yêu cầu hỗ trợ public", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const listSupportRequestsPublic = async (req, res) => {
  try {
    const username = (req.query?.username || "").toString().trim().toLowerCase();
    if (!username) {
      return res.status(400).json({ message: "Thiếu username" });
    }

    const rows = await SupportRequest.find({
      requesterUsername: username,
      status: "open",
    })
      .sort({ _id: -1 })
      .limit(20)
      .select("_id requesterName requesterUsername message status adminReply createdAt updatedAt")
      .lean();

    return res.status(200).json({ requests: rows });
  } catch (error) {
    console.error("Lỗi khi lấy hỗ trợ public", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const listSupportRequests = async (req, res) => {
  try {
    const { limit = 50, cursor } = req.query || {};
    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

    const query = cursor ? { _id: { $lt: cursor } } : {};

    const rows = await SupportRequest.find(query)
      .sort({ _id: -1 })
      .limit(parsedLimit)
      .populate("requesterId", "_id displayName username avatarUrl isLocked isVerified")
      .lean();

    const missingUsernames = Array.from(
      new Set(
        rows
          .filter((row) => !row?.requesterId && row?.requesterUsername)
          .map((row) => row.requesterUsername.toString().trim().toLowerCase())
          .filter(Boolean),
      ),
    );

    if (missingUsernames.length > 0) {
      const users = await User.find({ username: { $in: missingUsernames } })
        .select("_id displayName username avatarUrl isLocked isVerified")
        .lean();
      const userMap = new Map(
        users.map((user) => [user.username?.toString?.().toLowerCase?.(), user]),
      );

      for (const row of rows) {
        if (row?.requesterId || !row?.requesterUsername) continue;
        const key = row.requesterUsername.toString().trim().toLowerCase();
        const matched = userMap.get(key);
        if (matched) {
          row.requesterId = matched;
        }
      }
    }

    rows.sort((a, b) => {
      const aVerified = a?.requesterId?.isVerified ? 1 : 0;
      const bVerified = b?.requesterId?.isVerified ? 1 : 0;
      if (bVerified !== aVerified) return bVerified - aVerified;
      const aCreated = new Date(a?.createdAt || 0).getTime();
      const bCreated = new Date(b?.createdAt || 0).getTime();
      return bCreated - aCreated;
    });

    const nextCursor =
      rows.length === parsedLimit ? rows[rows.length - 1]._id : null;

    return res.status(200).json({ requests: rows, nextCursor });
  } catch (error) {
    console.error("Lỗi khi lấy hỗ trợ người dùng", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateSupportRequestStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body || {};

    if (!["open", "closed"].includes(status)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ" });
    }

    const found = await SupportRequest.findById(requestId)
      .select("_id requesterId requesterUsername")
      .lean();

    if (!found) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu hỗ trợ" });
    }

    if (status === "closed") {
      const normalizedUsername = (found.requesterUsername || "")
        .toString()
        .trim()
        .toLowerCase();
      const deleteQuery = found.requesterId
        ? {
            $or: [
              { requesterId: found.requesterId },
              ...(normalizedUsername ? [{ requesterUsername: normalizedUsername }] : []),
            ],
          }
        : normalizedUsername
          ? {
              requesterUsername: normalizedUsername,
            }
          : { _id: found._id };

      const deleted = await SupportRequest.deleteMany(deleteQuery);
      return res.status(200).json({
        message: "Đã xử lý và làm mới hội thoại hỗ trợ",
        cleared: true,
        clearedCount: deleted?.deletedCount || 0,
        requesterId: found.requesterId?.toString?.() || null,
        requesterUsername: normalizedUsername || null,
      });
    }

    const updated = await SupportRequest.findByIdAndUpdate(
      requestId,
      { $set: { status } },
      { new: true },
    ).lean();

    return res.status(200).json({ request: updated });
  } catch (error) {
    console.error("Lỗi khi cập nhật trạng thái hỗ trợ", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const replySupportRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { message } = req.body || {};
    const content = (message || "").toString().trim();

    if (!content) {
      return res.status(400).json({ message: "Vui lòng nhập nội dung phản hồi" });
    }

    const updated = await SupportRequest.findByIdAndUpdate(
      requestId,
      {
        $set: {
          status: "open",
          adminReply: {
            message: content,
            adminName:
              req.user?.displayName || req.user?.username || "Quản trị viên",
            createdAt: new Date(),
          },
        },
      },
      { new: true },
    )
      .populate("requesterId", "_id displayName username avatarUrl isLocked")
      .lean();

    if (!updated) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu hỗ trợ" });
    }

    return res.status(200).json({
      message: "Đã gửi phản hồi hỗ trợ",
      request: updated,
    });
  } catch (error) {
    console.error("Lỗi khi phản hồi hỗ trợ", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getAdminDashboard = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalUsers, totalPosts, messagesToday, reportedAccounts] =
      await Promise.all([
        User.countDocuments({}),
        Post.countDocuments({ status: { $ne: "deleted" } }),
        Message.countDocuments({ createdAt: { $gte: today } }),
        UserReport.countDocuments({}),
      ]);

    const growthDays = 14;
    const start = new Date();
    start.setDate(start.getDate() - (growthDays - 1));
    start.setHours(0, 0, 0, 0);

    const growthRows = await User.aggregate([
      { $match: { createdAt: { $gte: start } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: "Asia/Ho_Chi_Minh",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const growthMap = new Map(growthRows.map((row) => [row._id, row.count]));
    const growth = [];
    for (let i = 0; i < growthDays; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      growth.push({ date: key, count: growthMap.get(key) || 0 });
    }

    return res.status(200).json({
      totalUsers,
      totalPosts,
      messagesToday,
      callsToday: 0,
      reportedAccounts,
      growth,
    });
  } catch (error) {
    console.error("Lỗi khi lấy dashboard admin", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const listUsersAdmin = async (req, res) => {
  try {
    const {
      keyword = "",
      status = "all",
      limit = 30,
      cursor,
    } = req.query || {};
    const parsedLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);

    const query = {};
    if (status === "active") query.isLocked = false;
    if (status === "banned") query.isLocked = true;

    if (keyword) {
      const escaped = keyword.toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { username: { $regex: escaped, $options: "i" } },
        { displayName: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ];
    }

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    let users = await User.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit + 1)
      .select(
        "_id username displayName avatarUrl email isLocked lockReason lockedAt role isVerified verifiedAt verificationTier verificationSource createdAt lastLoginAt",
      )
      .lean();

    let nextCursor = null;
    if (users.length > parsedLimit) {
      const next = users[users.length - 1];
      nextCursor = next?.createdAt?.toISOString?.() || null;
      users = users.slice(0, parsedLimit);
    }

    const userIds = users.map((u) => u._id);
    const postCounts = userIds.length
      ? await Post.aggregate([
          {
            $match: { authorId: { $in: userIds }, status: { $ne: "deleted" } },
          },
          { $group: { _id: "$authorId", count: { $sum: 1 } } },
        ])
      : [];
    const postCountMap = new Map(
      postCounts.map((row) => [row._id.toString(), row.count]),
    );

    const formatted = users.map((user) => ({
      ...user,
      postCount: postCountMap.get(user._id.toString()) || 0,
    }));

    return res.status(200).json({ users: formatted, nextCursor });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách user admin", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const submitVerificationRequest = async (req, res) => {
  try {
    const userId = req.user?._id?.toString();
    const { requestedTier = "basic", requestMethod = "manual" } = req.body || {};
    const normalizedTier =
      normalizeVerificationTier(requestedTier) === "none"
        ? "basic"
        : normalizeVerificationTier(requestedTier);
    const normalizedMethod = ["manual", "id", "subscription"].includes(
      (requestMethod || "").toString().trim().toLowerCase(),
    )
      ? (requestMethod || "").toString().trim().toLowerCase()
      : "manual";
    if (!userId) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }

    const user = await User.findById(userId).select(
      "_id isVerified verificationTier verificationSource",
    );
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Tài khoản đã được xác minh" });
    }

    const existing = await VerificationRequest.findOne({ userId })
      .select("_id status")
      .lean();

    if (existing?.status === "pending") {
      return res.status(400).json({ message: "Yêu cầu xác minh đang chờ duyệt" });
    }

    const request = await VerificationRequest.findOneAndUpdate(
      { userId },
      {
        $set: {
          status: "pending",
          requestedTier: normalizedTier,
          requestMethod: normalizedMethod,
          note: "",
          reviewedBy: null,
          reviewedAt: null,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    return res.status(200).json({
      message: "Đã gửi yêu cầu xác minh, vui lòng chờ admin duyệt",
      request,
    });
  } catch (error) {
    console.error("Lỗi khi gửi yêu cầu xác minh", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getMyVerificationRequest = async (req, res) => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }

    const [user, request] = await Promise.all([
      User.findById(userId)
        .select("_id isVerified verifiedAt verificationTier verificationSource")
        .lean(),
      VerificationRequest.findOne({ userId })
        .select("_id status requestedTier requestMethod note reviewedAt updatedAt createdAt")
        .lean(),
    ]);

    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    return res.status(200).json({
      isVerified: !!user.isVerified,
      verifiedAt: user.verifiedAt || null,
      verificationTier: user.verificationTier || "none",
      verificationSource: user.verificationSource || "none",
      request: request || null,
      privileges: getVerifiedPrivilegeSnapshot(user),
    });
  } catch (error) {
    console.error("Lỗi khi lấy trạng thái yêu cầu xác minh", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getMyVerifiedPrivileges = async (req, res) => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }

    const user = await User.findById(userId)
      .select("_id isVerified verificationTier verificationSource verifiedAt")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    return res.status(200).json({
      isVerified: !!user.isVerified,
      verificationTier: user.verificationTier || "none",
      verificationSource: user.verificationSource || "none",
      verifiedAt: user.verifiedAt || null,
      privileges: getVerifiedPrivilegeSnapshot(user),
    });
  } catch (error) {
    console.error("Lỗi khi lấy đặc quyền tích xanh", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const listVerificationRequestsAdmin = async (req, res) => {
  try {
    const { status = "pending", limit = 30 } = req.query || {};
    const parsedLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);

    const query = {};
    if (status === "pending" || status === "approved" || status === "rejected") {
      query.status = status;
    }

    const requests = await VerificationRequest.find(query)
      .sort({ updatedAt: -1 })
      .limit(parsedLimit)
      .populate(
        "userId",
        "_id username displayName avatarUrl isVerified verificationTier verificationSource createdAt",
      )
      .populate("reviewedBy", "_id username displayName")
      .lean();

    return res.status(200).json({ requests });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách yêu cầu xác minh", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const resolveVerificationRequestAdmin = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { approved, note, approvedTier } = req.body || {};
    const actorId = req.user?._id?.toString();
    const resolvedTier =
      normalizeVerificationTier(approvedTier) === "none"
        ? normalizeVerificationTier(request?.requestedTier)
        : normalizeVerificationTier(approvedTier);

    if (typeof approved !== "boolean") {
      return res.status(400).json({ message: "approved phải là boolean" });
    }

    const request = await VerificationRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu xác minh" });
    }

    const nextStatus = approved ? "approved" : "rejected";
    request.status = nextStatus;
    request.note = typeof note === "string" ? note.trim() : "";
    request.reviewedBy = actorId;
    request.reviewedAt = new Date();
    await request.save();

    const user = await User.findByIdAndUpdate(
      request.userId,
      {
        $set: {
          isVerified: approved,
          verifiedAt: approved ? new Date() : null,
          verificationTier: approved ? (resolvedTier === "none" ? "basic" : resolvedTier) : "none",
          verificationSource: approved
            ? request.requestMethod || "manual"
            : "none",
        },
      },
      { new: true },
    ).select(
      "_id username displayName isVerified verifiedAt verificationTier verificationSource",
    );

    return res.status(200).json({
      message: approved ? "Đã duyệt tích xanh" : "Đã từ chối yêu cầu tích xanh",
      request,
      user,
    });
  } catch (error) {
    console.error("Lỗi khi duyệt yêu cầu xác minh", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const toggleUserVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    const { verified, tier = "basic", source = "manual" } = req.body || {};
    const actorId = req.user?._id?.toString();
    const normalizedTier =
      normalizeVerificationTier(tier) === "none" ? "basic" : normalizeVerificationTier(tier);
    const normalizedSource = ["manual", "id", "subscription"].includes(
      (source || "").toString().trim().toLowerCase(),
    )
      ? (source || "").toString().trim().toLowerCase()
      : "manual";

    const nextVerified = !!verified;
    const updated = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          isVerified: nextVerified,
          verifiedAt: nextVerified ? new Date() : null,
          verificationTier: nextVerified ? normalizedTier : "none",
          verificationSource: nextVerified ? normalizedSource : "none",
        },
      },
      { new: true },
    ).select(
      "_id username displayName isVerified verifiedAt verificationTier verificationSource",
    );

    if (!updated) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    await VerificationRequest.findOneAndUpdate(
      { userId },
      {
        $set: {
          status: nextVerified ? "approved" : "rejected",
          requestedTier: normalizedTier,
          requestMethod: normalizedSource,
          reviewedBy: actorId || null,
          reviewedAt: new Date(),
          note: "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);

    return res.status(200).json({
      message: nextVerified ? "Đã xác minh tài khoản" : "Đã bỏ xác minh",
      user: updated,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật xác minh user", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body || {};

    const tempPassword =
      typeof newPassword === "string" && newPassword.trim().length >= 6
        ? newPassword.trim()
        : Math.random().toString(36).slice(2, 10);

    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { hashedPassword } },
      { new: true },
    ).select("_id username displayName");

    if (!updated) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    await Session.deleteMany({ userId });

    return res.status(200).json({
      message: "Đã đặt lại mật khẩu",
      tempPassword,
    });
  } catch (error) {
    console.error("Lỗi khi reset mật khẩu", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const transferAdminRole = async (req, res) => {
  try {
    const actorId = req.user?._id?.toString();
    const { newAdminId } = req.body || {};

    if (!newAdminId) {
      return res.status(400).json({ message: "Thiếu userId admin mới" });
    }

    const currentAdmin = await User.findOne({ role: "admin" }).select("_id");
    if (!currentAdmin) {
      return res.status(404).json({ message: "Không tìm thấy admin hiện tại" });
    }

    if (currentAdmin._id.toString() === newAdminId.toString()) {
      return res.status(400).json({ message: "User này đã là admin" });
    }

    const newAdmin = await User.findById(newAdminId).select(
      "_id username displayName",
    );
    if (!newAdmin) {
      return res.status(404).json({ message: "Không tìm thấy admin mới" });
    }

    await User.findByIdAndUpdate(currentAdmin._id, { $set: { role: "user" } });
    await User.findByIdAndUpdate(newAdmin._id, { $set: { role: "admin" } });

    await AdminAuditLog.create({
      actorId,
      targetId: newAdmin._id,
      action: "grant_admin",
      reason: "transfer_admin",
      ip: req.ip || req.headers["x-forwarded-for"] || "",
    });

    return res.status(200).json({
      message: "Đã chuyển quyền admin",
      newAdmin: {
        _id: newAdmin._id,
        username: newAdmin.username,
        displayName: newAdmin.displayName,
      },
    });
  } catch (error) {
    console.error("Lỗi khi chuyển quyền admin", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const listAdminAuditLogs = async (req, res) => {
  try {
    const { limit = 50, cursor } = req.query || {};
    const query = {};

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    let logs = await AdminAuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit) + 1)
      .populate("actorId", "_id username displayName avatarUrl")
      .populate("targetId", "_id username displayName avatarUrl")
      .lean();

    let nextCursor = null;
    if (logs.length > Number(limit)) {
      const nextItem = logs[logs.length - 1];
      nextCursor = nextItem.createdAt?.toISOString?.() || null;
      logs = logs.slice(0, Number(limit));
    }

    return res.status(200).json({ logs, nextCursor });
  } catch (error) {
    console.error("Lỗi khi lấy audit log admin", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const listUserReports = async (req, res) => {
  try {
    const { limit = 50, cursor, status = "all", includeHidden = "false" } = req.query || {};
    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const query = {};

    const showHidden = includeHidden === "true";
    if (!showHidden) {
      query.isHidden = { $ne: true };
    }

    if (status === "pending") {
      query.$or = [{ isResolved: false }, { isResolved: { $exists: false } }];
    } else if (status === "resolved") {
      query.isResolved = true;
    }

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    let reports = await UserReport.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit + 1)
      .populate("reporterId", "_id username displayName avatarUrl")
      .populate("targetId", "_id username displayName avatarUrl")
      .populate("resolvedBy", "_id username displayName avatarUrl")
      .populate("hiddenBy", "_id username displayName avatarUrl")
      .lean();

    let nextCursor = null;
    if (reports.length > parsedLimit) {
      const nextItem = reports[reports.length - 1];
      nextCursor = nextItem.createdAt?.toISOString?.() || null;
      reports = reports.slice(0, parsedLimit);
    }

    const [pendingCount, resolvedCount] = await Promise.all([
      UserReport.countDocuments({
        isHidden: { $ne: true },
        $or: [{ isResolved: false }, { isResolved: { $exists: false } }],
      }),
      UserReport.countDocuments({
        isResolved: true,
      }),
    ]);

    return res.status(200).json({
      reports,
      nextCursor,
      summary: {
        pendingCount,
        resolvedCount,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách report", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const resolveUserReport = async (req, res) => {
  try {
    const actorId = req.user?._id?.toString();
    const { reportId } = req.params;
    const { resolved = true } = req.body || {};
    const nextResolved = !!resolved;

    const updated = await UserReport.findByIdAndUpdate(
      reportId,
      {
        $set: {
          isResolved: nextResolved,
          resolvedAt: nextResolved ? new Date() : null,
          resolvedBy: nextResolved ? actorId : null,
        },
      },
      { new: true },
    )
      .populate("reporterId", "_id username displayName avatarUrl")
      .populate("targetId", "_id username displayName avatarUrl")
      .populate("resolvedBy", "_id username displayName avatarUrl")
      .populate("hiddenBy", "_id username displayName avatarUrl")
      .lean();

    if (!updated) {
      return res.status(404).json({ message: "Không tìm thấy báo cáo" });
    }

    return res.status(200).json({
      message: nextResolved ? "Đã đánh dấu xử lý báo cáo" : "Đã bỏ trạng thái xử lý",
      report: updated,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật xử lý báo cáo user", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const hideUserReport = async (req, res) => {
  try {
    const actorId = req.user?._id?.toString();
    const { reportId } = req.params;
    const { hidden = true } = req.body || {};
    const nextHidden = !!hidden;

    const updated = await UserReport.findByIdAndUpdate(
      reportId,
      {
        $set: {
          isHidden: nextHidden,
          hiddenAt: nextHidden ? new Date() : null,
          hiddenBy: nextHidden ? actorId : null,
        },
      },
      { new: true },
    )
      .populate("reporterId", "_id username displayName avatarUrl")
      .populate("targetId", "_id username displayName avatarUrl")
      .populate("resolvedBy", "_id username displayName avatarUrl")
      .populate("hiddenBy", "_id username displayName avatarUrl")
      .lean();

    if (!updated) {
      return res.status(404).json({ message: "Không tìm thấy báo cáo" });
    }

    return res.status(200).json({
      message: nextHidden ? "Đã ẩn báo cáo khỏi danh sách" : "Đã hiển thị lại báo cáo",
      report: updated,
    });
  } catch (error) {
    console.error("Lỗi khi ẩn báo cáo user", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const deleteUserReport = async (req, res) => {
  try {
    const { reportId } = req.params;

    const deleted = await UserReport.findByIdAndDelete(reportId).lean();
    if (!deleted) {
      return res.status(404).json({ message: "Không tìm thấy báo cáo" });
    }

    return res.status(200).json({ message: "Đã xóa lịch sử báo cáo" });
  } catch (error) {
    console.error("Lỗi khi xóa lịch sử báo cáo user", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const warnUser = async (req, res) => {
  try {
    const actorId = req.user?._id?.toString();
    const { userId } = req.params;
    const { reason } = req.body || {};

    const cleanedReason = typeof reason === "string" ? reason.trim() : "";
    if (!cleanedReason) {
      return res.status(400).json({ message: "Vui lòng nhập lý do cảnh báo" });
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      {
        $inc: { warningCount: 1 },
        $set: { lastWarningAt: new Date(), lastWarningReason: cleanedReason },
      },
      { new: true },
    ).select(
      "_id username displayName warningCount lastWarningAt lastWarningReason",
    );

    if (!updated) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    await AdminAuditLog.create({
      actorId,
      targetId: userId,
      action: "warn_user",
      reason: cleanedReason,
      ip: req.ip || req.headers["x-forwarded-for"] || "",
    });

    io.to(userId.toString()).emit("admin-notification", {
      type: "warn",
      targetId: userId.toString(),
      title: "Bạn nhận cảnh báo từ quản trị viên",
      description: cleanedReason,
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({
      message: "Đã cảnh báo người dùng",
      user: updated,
    });
  } catch (error) {
    console.error("Lỗi khi cảnh báo người dùng", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const lockUser = async (req, res) => {
  try {
    const actorId = req.user?._id?.toString();
    const { userId } = req.params;
    const { locked, reason } = req.body || {};
    const nextLocked = typeof locked === "boolean" ? locked : true;
    const cleanedReason = typeof reason === "string" ? reason.trim() : "";

    const updated = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          isLocked: nextLocked,
          lockReason: nextLocked ? cleanedReason : "",
          lockedAt: nextLocked ? new Date() : null,
        },
      },
      { new: true },
    ).select("_id username displayName isLocked lockReason lockedAt");

    if (!updated) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    await AdminAuditLog.create({
      actorId,
      targetId: userId,
      action: nextLocked ? "lock_user" : "unlock_user",
      reason: cleanedReason,
      ip: req.ip || req.headers["x-forwarded-for"] || "",
    });

    io.to(userId.toString()).emit("admin-notification", {
      type: nextLocked ? "lock" : "unlock",
      targetId: userId.toString(),
      title: nextLocked
        ? "Tài khoản của bạn đã bị khóa"
        : "Tài khoản của bạn đã được mở khóa",
      description: nextLocked
        ? cleanedReason || "Vui lòng liên hệ hỗ trợ để biết thêm chi tiết."
        : "Bạn có thể đăng nhập và sử dụng lại bình thường.",
      isLocked: nextLocked,
      lockReason: nextLocked ? cleanedReason : "",
      lockedAt: nextLocked ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({
      message: nextLocked ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản",
      user: updated,
    });
  } catch (error) {
    console.error("Lỗi khi khóa/mở khóa tài khoản", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const adjustConversationStreakAdmin = async (req, res) => {
  try {
    const actorId = req.user?._id?.toString();
    const { conversationId } = req.params;
    const { action, amount, reason } = req.body || {};

    const normalizedAction = (action || "").toString().trim().toLowerCase();
    if (!["increase", "decrease", "reset"].includes(normalizedAction)) {
      return res.status(400).json({ message: "Hành động không hợp lệ" });
    }

    const parsedAmount = Number(amount);
    const step =
      Number.isFinite(parsedAmount) && parsedAmount > 0
        ? Math.floor(parsedAmount)
        : 1;
    const safeReason = typeof reason === "string" ? reason.trim() : "";

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy đoạn chat" });
    }

    const previousCount = Number(conversation?.streak?.count || 0);
    let nextCount = previousCount;

    if (normalizedAction === "increase") {
      nextCount = previousCount + step;
    } else if (normalizedAction === "decrease") {
      nextCount = Math.max(previousCount - step, 0);
    } else {
      nextCount = 0;
    }

    conversation.streak.count = nextCount;
    conversation.streak.missLevel = 0;
    conversation.streak.lastCountedDay = nextCount > 0 ? toVietnamDateKey(new Date()) : null;

    if (normalizedAction === "reset") {
      conversation.lastMessageDayBy = new Map();
    }

    await conversation.save();

    const payload = {
      conversationId: conversation._id.toString(),
      streakCount: nextCount,
      streakCompletedToday: false,
      streakAtRisk: false,
      streakExpiresAt: null,
      streakRecoveryMode: null,
      streakLost: nextCount === 0,
    };

    (conversation.participants || []).forEach((participant) => {
      const uid = participant?.userId?.toString?.();
      if (uid) {
        io.to(uid).emit("streak-updated", payload);
      }
    });

    await AdminAuditLog.create({
      actorId,
      targetId: conversation._id,
      action:
        normalizedAction === "increase"
          ? "admin_increase_streak"
          : normalizedAction === "decrease"
            ? "admin_decrease_streak"
            : "admin_reset_streak",
      reason:
        safeReason ||
        `Admin ${normalizedAction} streak ${step} cho conversation ${conversation._id.toString()}`,
      ip: req.ip || req.headers["x-forwarded-for"] || "",
    });

    return res.status(200).json({
      message:
        normalizedAction === "increase"
          ? "Đã tăng chuỗi thành công"
          : normalizedAction === "decrease"
            ? "Đã giảm chuỗi thành công"
            : "Đã hủy chuỗi thành công",
      conversation: {
        _id: conversation._id,
        type: conversation.type,
        streakCount: nextCount,
        streakMissLevel: conversation.streak?.missLevel || 0,
        streakLastCountedDay: conversation.streak?.lastCountedDay || null,
      },
    });
  } catch (error) {
    console.error("Lỗi khi admin chỉnh chuỗi", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const resolveDirectConversationByDisplayNamesAdmin = async (req, res) => {
  try {
    const { displayNameA, displayNameB } = req.body || {};
    const nameA = typeof displayNameA === "string" ? displayNameA.trim() : "";
    const nameB = typeof displayNameB === "string" ? displayNameB.trim() : "";

    if (!nameA || !nameB) {
      return res.status(400).json({
        message: "Vui lòng nhập đủ 2 tên hiển thị",
      });
    }

    const userA = await User.findOne({
      displayName: { $regex: `^${escapeRegex(nameA)}$`, $options: "i" },
    })
      .select("_id displayName username")
      .lean();
    const userB = await User.findOne({
      displayName: { $regex: `^${escapeRegex(nameB)}$`, $options: "i" },
    })
      .select("_id displayName username")
      .lean();

    if (!userA || !userB) {
      return res.status(404).json({
        message: "Không tìm thấy người dùng theo tên hiển thị",
      });
    }

    const conversation = await Conversation.findOne({
      type: "direct",
      "participants.userId": { $all: [userA._id, userB._id] },
    })
      .select("_id type participants streak streakMode")
      .lean();

    if (!conversation) {
      return res.status(404).json({
        message: "Không tìm thấy đoạn chat trực tiếp giữa hai người dùng này",
      });
    }

    return res.status(200).json({
      message: "Đã tìm thấy đoạn chat",
      conversation: {
        _id: conversation._id,
        type: conversation.type,
        streakCount: conversation?.streak?.count || 0,
        streakMode: conversation?.streakMode || null,
      },
      users: [userA, userB],
    });
  } catch (error) {
    console.error("Lỗi khi tìm direct conversation theo tên hiển thị", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const sendAdminNotification = async (req, res) => {
  try {
    const actorId = req.user?._id?.toString();
    const { title, description, mode, targetUserIds } = req.body || {};

    const safeTitle = typeof title === "string" ? title.trim() : "";
    const safeDescription =
      typeof description === "string" ? description.trim() : "";

    if (!safeTitle || !safeDescription) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập đầy đủ tiêu đề và nội dung" });
    }

    let targets = [];
    if (mode === "all") {
      targets = await User.find({}).select("_id").lean();
    } else {
      const ids = Array.isArray(targetUserIds)
        ? targetUserIds.map((id) => id?.toString()).filter(Boolean)
        : [];
      if (ids.length === 0) {
        return res
          .status(400)
          .json({ message: "Vui lòng chọn người dùng nhận thông báo" });
      }
      targets = await User.find({ _id: { $in: ids } })
        .select("_id")
        .lean();
    }

    const createdAt = new Date().toISOString();
    targets.forEach((target) => {
      io.to(target._id.toString()).emit("admin-notification", {
        type: "admin_message",
        title: safeTitle,
        description: safeDescription,
        createdAt,
      });
    });

    await AdminAuditLog.create({
      actorId,
      targetId: targets.length === 1 ? targets[0]._id : undefined,
      action: mode === "all" ? "broadcast_notification" : "notify_user",
      reason: safeTitle,
      ip: req.ip || req.headers["x-forwarded-for"] || "",
    });

    return res.status(200).json({
      message: "Đã gửi thông báo",
      total: targets.length,
    });
  } catch (error) {
    console.error("Lỗi khi gửi thông báo admin", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getAppBanner = async (req, res) => {
  try {
    const config = await AppConfig.findOne({ key: "global" })
      .select("bannerUrl")
      .lean();
    return res.status(200).json({ bannerUrl: config?.bannerUrl || "" });
  } catch (error) {
    console.error("Lỗi khi lấy banner", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateAppBanner = async (req, res) => {
  try {
    const file = req.file;
    const { bannerUrl, clear } = req.body || {};

    let nextUrl = "";
    let nextId = "";

    if (clear === true || clear === "true") {
      nextUrl = "";
      nextId = "";
    } else if (file) {
      const result = await uploadImageFromBuffer(
        file.buffer,
        { folder: "hichat/banners" },
        file.mimetype,
      );
      nextUrl = result.secure_url;
      nextId = result.public_id;
    } else if (typeof bannerUrl === "string" && bannerUrl.trim()) {
      nextUrl = bannerUrl.trim();
      nextId = "";
    } else {
      return res
        .status(400)
        .json({ message: "Vui lòng chọn ảnh hoặc nhập URL banner" });
    }

    const updated = await AppConfig.findOneAndUpdate(
      { key: "global" },
      { $set: { bannerUrl: nextUrl, bannerId: nextId } },
      { upsert: true, new: true },
    ).select("bannerUrl");

    return res.status(200).json({
      message: "Đã cập nhật banner",
      bannerUrl: updated?.bannerUrl || "",
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật banner", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
