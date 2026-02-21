import { uploadImageFromBuffer } from "../middlewares/uploadMiddleware.js";
import User from "../models/User.js";
import Friend from "../models/Friend.js";
import bcrypt from "bcrypt";
import Session from "../models/Session.js";
import FriendRequest from "../models/FriendRequest.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import UserBlock from "../models/UserBlock.js";
import UserReport from "../models/UserReport.js";
import RelationshipRequest from "../models/RelationshipRequest.js";
import UserRestriction from "../models/UserRestriction.js";
import { setUserOnlineVisibility } from "../socket/index.js";

const DISPLAY_NAME_COOLDOWN_DAYS = 7;
const EMAIL_COOLDOWN_DAYS = 30;
const PHONE_COOLDOWN_DAYS = 30;

const normalizePhone = (value = "") => value.toString().replace(/\D/g, "");
const normalizeDisplayName = (value = "") =>
  value
    .toString()
    .trim()
    .replace(/\s+/g, " ");
const escapeRegex = (value = "") => value.toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const daysBetween = (from, to = new Date()) => {
  if (!from) return Number.POSITIVE_INFINITY;
  const diffMs = new Date(to).getTime() - new Date(from).getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
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
      return res
        .status(400)
        .json({ message: "Cần cung cấp username hoặc số điện thoại trong query." });
    }

    const lowered = value.toLowerCase();
    const normalizedPhone = normalizePhone(value);
    const escapedText = escapeRegex(value);
    const escapedPhone = escapeRegex(normalizedPhone);

    const candidates = await User.find({
      $or: [
        { username: { $regex: escapedText, $options: "i" } },
        { displayName: { $regex: escapedText, $options: "i" } },
        ...(normalizedPhone ? [{ phone: { $regex: escapedPhone, $options: "i" } }] : []),
      ],
    })
      .select("_id displayName username avatarUrl")
      .limit(30)
      .lean();

    const score = (user) => {
      const uname = (user.username || "").toLowerCase();
      const dname = (user.displayName || "").toLowerCase();
      if (uname === lowered || dname === lowered) return 100;
      if (uname.startsWith(lowered) || dname.startsWith(lowered)) return 80;
      if (uname.includes(lowered) || dname.includes(lowered)) return 60;
      return 10;
    };

    const users = (candidates || []).sort((a, b) => {
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
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
      }
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
      file.mimetype
    );

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        coverUrl: result.secure_url,
        coverId: result.public_id,
      },
      {
        new: true,
      }
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
          return res.status(409).json({ message: "Tên hiển thị đã được sử dụng" });
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
          return res.status(400).json({ message: "Số điện thoại không hợp lệ" });
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
          return res.status(409).json({ message: "Số điện thoại đã được sử dụng" });
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
      const allowedRelationshipStatus = new Set(["single", "in_relationship", "married", ""]);
      if (!allowedRelationshipStatus.has(normalizedRelationshipStatus)) {
        return res.status(400).json({ message: "Trạng thái mối quan hệ không hợp lệ" });
      }
      if (normalizedRelationshipStatus === "in_relationship" && !user.relationshipPartnerId) {
        return res.status(400).json({
          message: "Vui lòng gửi lời mời hẹn hò để cập nhật trạng thái đang hẹn hò",
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
        }
      }
    }

    if (typeof contactInfoVisibility === "string") {
      const normalizedContactInfoVisibility = contactInfoVisibility.trim();
      const allowedVisibility = new Set(["only_me", "public", "friends"]);
      if (!allowedVisibility.has(normalizedContactInfoVisibility)) {
        return res.status(400).json({ message: "Quyền xem thông tin liên lạc không hợp lệ" });
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
    const isMe = viewerId === userId.toString();

    const userSelect =
      "_id username displayName avatarUrl coverUrl bio currentCity hometown birthday relationshipStatus relationshipPartnerId contactInfoVisibility createdAt email phone displayNameUpdatedAt emailUpdatedAt phoneUpdatedAt";

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

    const targetFriendIds = await getFriendIds(userId.toString());
    const friendCount = targetFriendIds.length;

    const [userA, userB] =
      viewerId < userId ? [viewerId, userId] : [userId, viewerId];
    const friendship = await Friend.findOne({ userA, userB }).lean();

    let mutualFriendIds = [];
    if (viewerId !== userId.toString()) {
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

    return res.status(200).json({
      user: userPayload,
      isMe,
      isFriend: !!friendship,
      friendCount,
      mutualCount: mutualFriendIds.length,
      mutualFriends,
    });
  } catch (error) {
    console.error("Lỗi khi lấy trang cá nhân người dùng", error);
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
      return res.status(400).json({ message: "Không thể gửi lời mời hẹn hò cho chính mình" });
    }

    const [fromUser, toUser] = await Promise.all([
      User.findById(fromUserId).select("_id relationshipStatus relationshipPartnerId"),
      User.findById(toUserId).select("_id relationshipStatus relationshipPartnerId"),
    ]);

    if (!toUser) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    if (!fromUser) {
      return res.status(404).json({ message: "Người gửi không tồn tại" });
    }

    if (fromUser.relationshipPartnerId || toUser.relationshipPartnerId) {
      return res.status(400).json({ message: "Một trong hai người đã có trạng thái hẹn hò" });
    }

    const blocked = await UserBlock.findOne({
      $or: [
        { blockerId: fromUserId, blockedId: toUserId },
        { blockerId: toUserId, blockedId: fromUserId },
      ],
    }).lean();
    if (blocked) {
      return res.status(403).json({ message: "Không thể gửi lời mời vì có quan hệ chặn" });
    }

    const existing = await RelationshipRequest.findOne({
      status: "pending",
      $or: [
        { from: fromUserId, to: toUserId },
        { from: toUserId, to: fromUserId },
      ],
    }).lean();

    if (existing) {
      return res.status(400).json({ message: "Đã có lời mời hẹn hò đang chờ xử lý" });
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
      return res.status(403).json({ message: "Bạn không có quyền xử lý lời mời này" });
    }

    const fromUserId = request.from.toString();
    const toUserId = request.to.toString();

    const [fromUser, toUser] = await Promise.all([
      User.findById(fromUserId).select("_id relationshipPartnerId"),
      User.findById(toUserId).select("_id relationshipPartnerId"),
    ]);

    if (!fromUser || !toUser) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    if (fromUser.relationshipPartnerId || toUser.relationshipPartnerId) {
      return res.status(400).json({ message: "Một trong hai người đã có trạng thái hẹn hò" });
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
      RelationshipRequest.findByIdAndUpdate(requestId, { $set: { status: "accepted" } }),
      RelationshipRequest.updateMany(
        {
          status: "pending",
          $or: [{ from: fromUserId }, { to: fromUserId }, { from: toUserId }, { to: toUserId }],
          _id: { $ne: requestId },
        },
        { $set: { status: "declined" } },
      ),
    ]);

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
      return res.status(403).json({ message: "Bạn không có quyền xử lý lời mời này" });
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
      .populate("userA", "_id displayName avatarUrl username")
      .populate("userB", "_id displayName avatarUrl username")
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

    const user = await User.findById(userId).select("hashedPassword");
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.hashedPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu hiện tại không chính xác" });
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
    const { messageAlerts, friendRequestAlerts, securityAlerts } = req.body || {};

    const updatePayload = {
      ...(typeof messageAlerts === "boolean" ? { messageAlerts } : {}),
      ...(typeof friendRequestAlerts === "boolean" ? { friendRequestAlerts } : {}),
      ...(typeof securityAlerts === "boolean" ? { securityAlerts } : {}),
    };

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          notificationSettings: {
            messageAlerts:
              updatePayload.messageAlerts ?? req.user.notificationSettings?.messageAlerts ?? true,
            friendRequestAlerts:
              updatePayload.friendRequestAlerts ??
              req.user.notificationSettings?.friendRequestAlerts ??
              true,
            securityAlerts:
              updatePayload.securityAlerts ?? req.user.notificationSettings?.securityAlerts ?? true,
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
      return res.status(400).json({ message: "Thiếu username hoặc lý do báo cáo" });
    }

    const target = await User.findOne({ username: username.toLowerCase().trim() }).select(
      "_id username",
    );

    if (!target) {
      return res.status(404).json({ message: "Không tìm thấy người dùng cần báo cáo" });
    }

    if (target._id.toString() === userId) {
      return res
        .status(400)
        .json({ message: "Bạn không thể tự chặn hoặc tự báo cáo chính mình" });
    }

    await UserReport.create({
      reporterId: userId,
      targetId: target._id,
      reason: reason.trim(),
      detail: detail?.trim() || "",
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

export const deleteMyAccount = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { password } = req.body || {};

    if (!password) {
      return res.status(400).json({ message: "Vui lòng nhập mật khẩu để xác nhận" });
    }

    const user = await User.findById(userId).select("hashedPassword");
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const isMatch = await bcrypt.compare(password, user.hashedPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu không chính xác" });
    }

    await Promise.all([
      Session.deleteMany({ userId }),
      Friend.deleteMany({ $or: [{ userA: userId }, { userB: userId }] }),
      FriendRequest.deleteMany({ $or: [{ from: userId }, { to: userId }] }),
      UserBlock.deleteMany({ $or: [{ blockerId: userId }, { blockedId: userId }] }),
      UserRestriction.deleteMany({ $or: [{ userId }, { restrictedUserId: userId }] }),
      UserReport.deleteMany({ $or: [{ reporterId: userId }, { targetId: userId }] }),
    ]);

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
      convo.seenBy = (convo.seenBy || []).filter((id) => id.toString() !== userId);

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
    res.clearCookie("refreshToken");

    return res.status(200).json({ message: "Đã xoá tài khoản thành công" });
  } catch (error) {
    console.error("Lỗi khi xoá tài khoản", error);
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
