import Conversation from "../models/Conversation.js";
import Friend from "../models/Friend.js";
import Message from "../models/Message.js";
import Post from "../models/Post.js";
import User from "../models/User.js";
import UserBlock from "../models/UserBlock.js";
import UserRestriction from "../models/UserRestriction.js";
import FriendLockVote from "../models/FriendLockVote.js";
import UserReport from "../models/UserReport.js";
import {
  buildNewMessagePayload,
  emitNewMessage,
  updateConversationAfterCreateMessage,
} from "../utils/messageHelper.js";
import { io, isUserOnline } from "../socket/index.js";
import { emitAdminReportNotification } from "../utils/adminNotificationHelper.js";
import {
  diffVietnamDateKeys,
  getVietnamDayEndISO,
  getVietnamYesterdayKey,
  reconcileMissLevel,
  toVietnamDateKey,
} from "../utils/streakDateHelper.js";
import { uploadMediaFromBuffer } from "../middlewares/uploadMiddleware.js";

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];
const STRANGER_MESSAGE_LIMIT = 3;
const STREAK_MODE_THEME_BY_TYPE = {
  love: "rose",
  dating: "sunset",
  friends: "ocean",
};
const STREAK_MODE_POST_META = {
  love: {
    icon: "❤",
    title: "Chuỗi tình yêu",
    subtitle: "Mỗi ngày yêu thương là một ngày rực rỡ.",
    content: "💖 Cột mốc chuỗi tình yêu mới!",
    from: "#ff5f9f",
    to: "#7c3aed",
    glow: "#ffd9ec",
  },
  dating: {
    icon: "❥",
    title: "Chuỗi hẹn hò",
    subtitle: "Giữ nhịp quan tâm, giữ nhịp hẹn hò.",
    content: "✨ Cột mốc chuỗi hẹn hò mới!",
    from: "#ff9a3d",
    to: "#ff4d4d",
    glow: "#ffe0b2",
  },
  friends: {
    icon: "✦",
    title: "Chuỗi bạn bè",
    subtitle: "Bạn bè xịn là phải điểm danh mỗi ngày.",
    content: "🔥 Cột mốc chuỗi bạn bè mới!",
    from: "#22c1c3",
    to: "#1d4ed8",
    glow: "#c7f5ff",
  },
};

const isStreakMilestone = (streakCount) => STREAK_MILESTONES.includes(streakCount);

const pair = (a, b) => (a < b ? [a, b] : [b, a]);

const isFriendPair = async (a, b) => {
  const [userA, userB] = pair(a.toString(), b.toString());
  const friend = await Friend.findOne({ userA, userB }).lean();
  return !!friend;
};

const isBlockedPair = async (a, b) => {
  const blocked = await UserBlock.findOne({
    $or: [
      { blockerId: a, blockedId: b },
      { blockerId: b, blockedId: a },
    ],
  }).lean();
  return !!blocked;
};

const isRestrictedPair = async (a, b) => {
  const restricted = await UserRestriction.findOne({
    $or: [
      { userId: a, restrictedUserId: b },
      { userId: b, restrictedUserId: a },
    ],
  }).lean();
  return !!restricted;
};

const isCouplePair = async (a, b) => {
  const userIds = [a.toString(), b.toString()];
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id relationshipStatus relationshipPartnerId")
    .lean();
  if (!users || users.length < 2) return false;

  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const userA = userById.get(userIds[0]);
  const userB = userById.get(userIds[1]);
  if (!userA || !userB) return false;

  return (
    userA.relationshipStatus === "in_relationship" &&
    userB.relationshipStatus === "in_relationship" &&
    userA.relationshipPartnerId?.toString() === userIds[1] &&
    userB.relationshipPartnerId?.toString() === userIds[0]
  );
};

const deriveDirectStreakMode = async (a, b, areFriends) => {
  if (!areFriends) {
    return { type: null, status: "none" };
  }

  const isCouple = await isCouplePair(a, b);
  return {
    type: isCouple ? "love" : "friends",
    status: "active",
  };
};

const applyDerivedStreakMode = (conversation, derived) => {
  if (!conversation || conversation.type !== "direct") return false;
  const currentType = conversation.streakMode?.type || null;
  const currentStatus = conversation.streakMode?.status || "none";
  const nextType = derived?.type || null;
  const nextStatus = derived?.status || "none";

  if (currentType === nextType && currentStatus === nextStatus) {
    return false;
  }

  conversation.streakMode = {
    type: nextType,
    status: nextStatus,
    requestedBy: null,
    requestedAt: null,
    acceptedUserIds: [],
    activatedAt: nextStatus === "active" ? new Date() : null,
  };
  const statusChanged = currentStatus !== nextStatus;
  if (statusChanged) {
    conversation.streak.count = 0;
    conversation.streak.lastCountedDay = null;
    conversation.streak.missLevel = 0;
    conversation.lastMessageDayBy = new Map();
  }

  return true;
};

const normalizeDirectRequestIfFriend = (conversation, areFriends) => {
  if (!areFriends || conversation.type !== "direct") return;

  conversation.directRequest = {
    status: "accepted",
    requesterId: null,
    responderId: null,
    requesterMessageCount: 0,
    respondedAt: new Date(),
    respondedBy: null,
  };
};

const emitDirectRequestUpdated = (conversation) => {
  const payload = {
    _id: conversation._id,
    directRequest: conversation.directRequest ?? {
      status: "none",
      requesterMessageCount: 0,
    },
  };

  conversation.participants.forEach((participant) => {
    io.to(participant.userId.toString()).emit("direct-request-updated", payload);
  });
};

const escapeSvgText = (value = "") =>
  value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const createStreakMilestoneSvg = ({
  modeType,
  milestone,
  authorName,
  partnerName,
}) => {
  const meta = STREAK_MODE_POST_META[modeType] || STREAK_MODE_POST_META.friends;
  const safeAuthor = escapeSvgText((authorName || "Bạn").slice(0, 36));
  const safePartner = escapeSvgText((partnerName || "Người ấy").slice(0, 36));
  const safeTitle = escapeSvgText(meta.title);
  const safeSubtitle = escapeSvgText(meta.subtitle);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${meta.from}"/>
      <stop offset="100%" stop-color="${meta.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="36%" r="58%">
      <stop offset="0%" stop-color="${meta.glow}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${meta.glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <circle cx="540" cy="360" r="300" fill="url(#glow)"/>
  <text x="540" y="350" text-anchor="middle" font-size="220" fill="white">${meta.icon}</text>
  <text x="540" y="510" text-anchor="middle" fill="white" font-size="82" font-family="Arial, sans-serif" font-weight="700">${safeTitle}</text>
  <text x="540" y="610" text-anchor="middle" fill="white" font-size="170" font-family="Arial, sans-serif" font-weight="800">${milestone} ngày</text>
  <text x="540" y="705" text-anchor="middle" fill="rgba(255,255,255,0.95)" font-size="38" font-family="Arial, sans-serif">${safeSubtitle}</text>
  <text x="540" y="790" text-anchor="middle" fill="white" font-size="52" font-family="Arial, sans-serif" font-weight="700">${safeAuthor} &amp; ${safePartner}</text>
</svg>`.trim();
};

const emitStreakMilestoneIfMatched = (conversation, streakCount) => {
  if (!isStreakMilestone(streakCount)) return;

  const payload = {
    conversationId: conversation._id,
    streakCount,
    milestone: streakCount,
  };

  conversation.participants.forEach((p) => {
    io.to(p.userId.toString()).emit("streak-milestone", payload);
  });
};

const createAutoStreakMilestonePostForConversation = async (conversation, streakCount) => {
  try {
    if (!conversation || conversation.type !== "direct") return;
    if (!isStreakMilestone(streakCount)) return;

    const modeType = conversation.streakMode?.type;
    const modeStatus = conversation.streakMode?.status;
    if (!modeType || !STREAK_MODE_POST_META[modeType] || modeStatus !== "active") return;

    const participantIds = (conversation.participants || [])
      .map((p) => p.userId?.toString?.())
      .filter(Boolean);
    if (participantIds.length !== 2) return;

    const users = await User.find({ _id: { $in: participantIds } })
      .select("_id displayName")
      .lean();
    if (!users?.length) return;

    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    await Promise.all(
      participantIds.map(async (authorId) => {
        const partnerId = participantIds.find((id) => id !== authorId) || authorId;
        const authorName = userById.get(authorId)?.displayName || "Bạn";
        const partnerName = userById.get(partnerId)?.displayName || "Người ấy";
        const svg = createStreakMilestoneSvg({
          modeType,
          milestone: streakCount,
          authorName,
          partnerName,
        });
        const buffer = Buffer.from(svg, "utf8");
        const uploaded = await uploadMediaFromBuffer(buffer, "image/svg+xml", {
          folder: "hichat/posts/streak-milestones",
          resource_type: "auto",
        });

        if (!uploaded?.secure_url) return;

        await Post.create({
          authorId,
          content: `${STREAK_MODE_POST_META[modeType].content} Mốc ${streakCount} ngày.`,
          media: [{ url: uploaded.secure_url, type: "image" }],
          visibility: "public",
          allowedViewerIds: [],
        });
      }),
    );
  } catch (error) {
    console.error("Lỗi khi tự động đăng bài cột mốc chuỗi", error);
  }
};

const emitStreakLost = (conversation) => {
  const payload = {
    conversationId: conversation._id,
    streakCount: 0,
    streakCompletedToday: false,
    streakAtRisk: false,
    streakExpiresAt: null,
    streakRecoveryMode: null,
    streakLost: true,
  };

  conversation.participants.forEach((p) => {
    io.to(p.userId.toString()).emit("streak-updated", payload);
  });
};

const normalizeStreakMode = (conversation) => {
  const mode = conversation?.streakMode || {};
  const acceptedRaw = Array.isArray(mode.acceptedUserIds) ? mode.acceptedUserIds : [];
  const acceptedUserIds = acceptedRaw.map((id) => id?.toString()).filter(Boolean);
  return {
    type: mode.type || null,
    status: mode.status || "none",
    requestedBy: mode.requestedBy?.toString() || null,
    requestedAt: mode.requestedAt || null,
    acceptedUserIds,
    activatedAt: mode.activatedAt || null,
  };
};

const emitDirectStreakModeUpdated = (conversation) => {
  if (!conversation || conversation.type !== "direct") return;

  const payload = {
    _id: conversation._id,
    streakMode: normalizeStreakMode(conversation),
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
    io.to(participant.userId.toString()).emit("direct-streak-mode-updated", payload);
  });
};

const createStreakModeTimelineMessage = async (conversation, actorId, content) => {
  if (!conversation?._id || !actorId || !content) return null;

  const message = await Message.create({
    conversationId: conversation._id,
    senderId: actorId,
    content,
  });

  updateConversationAfterCreateMessage(conversation, message, actorId);
  emitNewMessage(io, conversation, message);
  return message;
};

export const sendDirectMessage = async (req, res) => {
  try {
    const { recipientId, content, conversationId, imgUrl, audioUrl, videoUrl } = req.body;
    const senderId = req.user._id;
    const senderIdText = senderId.toString();

    let conversation;
    let createdNewDirectConversation = false;

    const safeContent = typeof content === "string" ? content.trim() : "";
    if (!safeContent && !imgUrl && !audioUrl && !videoUrl) {
      return res.status(400).json({ message: "Thiếu nội dung" });
    }

    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
    }

    if (conversation && conversation.type !== "direct") {
      return res.status(400).json({ message: "conversationId không phải đoạn chat trực tiếp" });
    }

    if (conversation) {
      const isParticipant = conversation.participants.some(
        (p) => p.userId.toString() === senderIdText,
      );
      if (!isParticipant) {
        return res.status(403).json({ message: "Bạn không thuộc cuộc trò chuyện này" });
      }
    }

    const directRecipientId =
      recipientId ||
      conversation?.participants.find((p) => p.userId.toString() !== senderIdText)?.userId?.toString();

    if (!directRecipientId) {
      return res.status(400).json({ message: "Thiếu người nhận tin nhắn" });
    }

    const recipient = await User.findById(directRecipientId)
      .select("_id displayName isLocked lockReason lockedAt")
      .lean();
    const senderProfile = await User.findById(senderId)
      .select("_id isVerified verificationTier")
      .lean();
    const isVerifiedSender = !!senderProfile?.isVerified;

    if (!recipient) {
      return res.status(404).json({ message: "Người nhận không tồn tại" });
    }

    if (recipient.isLocked) {
      const currentLockedAtSnapshot = recipient.lockedAt || null;
      let lockIncidentVote = {
        hasVoted: false,
        myVote: null,
      };

      if (currentLockedAtSnapshot) {
        const existingVote = await FriendLockVote.findOne({
          lockedUserId: recipient._id,
          voterId: senderId,
          lockedAtSnapshot: currentLockedAtSnapshot,
        })
          .select("vote")
          .lean();

        lockIncidentVote = {
          hasVoted: !!existingVote,
          myVote: existingVote?.vote || null,
        };
      }

      return res.status(423).json({
        message: "Không thể nhắn tin vì tài khoản người nhận đã bị khóa",
        code: "RECIPIENT_LOCKED",
        recipient: {
          _id: recipient._id,
          displayName: recipient.displayName || "",
          lockedAt: recipient.lockedAt || null,
          lockReason: recipient.lockReason || "",
        },
        lockIncidentVote,
      });
    }

    if (await isBlockedPair(senderIdText, directRecipientId)) {
      return res.status(403).json({ message: "Không thể nhắn tin do có quan hệ chặn" });
    }

    if (await isRestrictedPair(senderIdText, directRecipientId)) {
      return res.status(403).json({ message: "Không thể nhắn tin do có quan hệ hạn chế" });
    }

    const areFriends = await isFriendPair(senderIdText, directRecipientId);
    const derivedStreakMode = await deriveDirectStreakMode(
      senderIdText,
      directRecipientId,
      areFriends,
    );

    if (!conversation) {
      conversation = await Conversation.create({
        type: "direct",
        participants: [
          { userId: senderId, joinedAt: new Date() },
          { userId: directRecipientId, joinedAt: new Date() },
        ],
        lastMessageAt: new Date(),
        unreadCounts: new Map(),
        directRequest: areFriends || isVerifiedSender
          ? {
              status: "accepted",
              requesterId: null,
              responderId: null,
              requesterMessageCount: 0,
              respondedAt: new Date(),
              respondedBy: null,
            }
          : {
              status: "pending",
              requesterId: senderId,
              responderId: directRecipientId,
              requesterMessageCount: 0,
              respondedAt: null,
              respondedBy: null,
            },
        streakMode: {
          type: derivedStreakMode.type,
          status: derivedStreakMode.status,
          requestedBy: null,
          requestedAt: null,
          acceptedUserIds: [],
          activatedAt: derivedStreakMode.status === "active" ? new Date() : null,
        },
      });
      createdNewDirectConversation = true;
    }

    normalizeDirectRequestIfFriend(conversation, areFriends || isVerifiedSender);
    const streakModeChanged = applyDerivedStreakMode(conversation, derivedStreakMode);

    if (conversation.archivedBy && conversation.archivedBy instanceof Map) {
      if (conversation.archivedBy.get(senderIdText)) {
        conversation.archivedBy.delete(senderIdText);
      }
    }

    if (
      conversation.type === "direct" &&
      !areFriends &&
      !isVerifiedSender &&
      (!conversation.directRequest || conversation.directRequest.status === "none")
    ) {
      conversation.directRequest = {
        status: "pending",
        requesterId: senderId,
        responderId: directRecipientId,
        requesterMessageCount: 0,
        respondedAt: null,
        respondedBy: null,
      };
    }

    const directRequest = conversation.directRequest ?? {
      status: "none",
      requesterId: null,
      responderId: null,
      requesterMessageCount: 0,
      respondedAt: null,
      respondedBy: null,
    };

    if (directRequest.status === "rejected" && !areFriends && !isVerifiedSender) {
      return res.status(403).json({
        message: "Người này đã từ chối yêu cầu tin nhắn. Bạn cần kết bạn để nhắn tiếp.",
      });
    }

    if (directRequest.status === "pending" && !areFriends && !isVerifiedSender) {
      const requesterId = directRequest.requesterId?.toString();
      const responderId = directRequest.responderId?.toString();

      if (senderIdText === responderId) {
        return res.status(403).json({
          message: "Bạn cần chấp nhận yêu cầu trước khi nhắn tin.",
        });
      }

      if (requesterId && senderIdText !== requesterId) {
        return res.status(403).json({ message: "Yêu cầu tin nhắn không hợp lệ." });
      }

      if ((directRequest.requesterMessageCount || 0) >= STRANGER_MESSAGE_LIMIT) {
        return res.status(403).json({
          message: "Bạn đã gửi tối đa 3 tin nhắn làm quen. Hãy chờ người kia chấp nhận.",
        });
      }

      conversation.directRequest.requesterMessageCount =
        (directRequest.requesterMessageCount || 0) + 1;
    }

    const receiverOnline = isUserOnline(directRecipientId);
    const deliveredAt = receiverOnline ? new Date() : null;

    const message = await Message.create({
      conversationId: conversation._id,
      senderId,
      content: safeContent,
      imgUrl: typeof imgUrl === "string" ? imgUrl : undefined,
      videoUrl: typeof videoUrl === "string" ? videoUrl : undefined,
      audioUrl: typeof audioUrl === "string" ? audioUrl : undefined,
      deliveredAt,
    });

    updateConversationAfterCreateMessage(conversation, message, senderId);

    // --- STREAK LOGIC (direct conversations only) ---
    // streak counts when both participants have sent at least one message on the same calendar day.
    let directStreakChanged = false;
    const isDirectStreakActive =
      conversation.type === "direct" &&
      conversation.streakMode?.status === "active" &&
      !!conversation.streakMode?.type;

    if (isDirectStreakActive) {
      const today = toVietnamDateKey(new Date());
      const streak = conversation.streak || { count: 0, lastCountedDay: null, missLevel: 0 };

      const reconciled = reconcileMissLevel(streak, today);
      if (reconciled.streakLost) {
        conversation.streak.count = 0;
        conversation.streak.lastCountedDay = null;
        conversation.streak.missLevel = 0;
        emitStreakLost(conversation);
      } else if ((conversation.streak.missLevel || 0) !== reconciled.missLevel) {
        conversation.streak.missLevel = reconciled.missLevel;
      }

      // update sender's lastMessageDayBy
      const prevMap = conversation.lastMessageDayBy || new Map();
      prevMap.set(senderId.toString(), today);
      conversation.lastMessageDayBy = prevMap;

      // find other participant id
      const other = conversation.participants.find(
        (p) => p.userId.toString() !== senderId.toString(),
      );
      const otherId = other?.userId?.toString();
      const otherDay = otherId
        ? conversation.lastMessageDayBy.get(otherId)
        : null;

      const lastCounted = conversation.streak?.lastCountedDay || null;
      const missLevel = conversation.streak?.missLevel || 0;

      // if both messaged today and we haven't counted today yet -> increment or set to 1
      if (otherDay === today && lastCounted !== today) {
        const yesterday = getVietnamYesterdayKey(new Date());
        const prevCount = conversation.streak?.count || 0;
        const dayDiffFromLastCount = lastCounted
          ? diffVietnamDateKeys(lastCounted, today)
          : null;

        if (missLevel === 1) {
          // first miss: free restore, no increment
          conversation.streak.count = prevCount;
        } else if (missLevel === 2) {
          // second miss: restore with -1 penalty
          conversation.streak.count = Math.max(prevCount - 1, 0);
        } else if (lastCounted === yesterday) {
          conversation.streak.count = prevCount + 1;
        } else if (dayDiffFromLastCount === null || dayDiffFromLastCount > 1) {
          // hard reset after long gap
          conversation.streak.count = 1;
        } else {
          conversation.streak.count = prevCount + 1;
        }

        conversation.streak.lastCountedDay = today;
        conversation.streak.missLevel = 0;
        directStreakChanged = true;
      }
    }

    await conversation.save();

    if (streakModeChanged) {
      emitDirectStreakModeUpdated(conversation);
    }

    emitNewMessage(io, conversation, message);

    // Receiver may not have joined the new conversation room yet.
    if (createdNewDirectConversation) {
      io.to(directRecipientId.toString()).emit(
        "new-message",
        buildNewMessagePayload(conversation, message)
      );
    }

    emitDirectRequestUpdated(conversation);

    // emit streak update to both participants when changed
    if (isDirectStreakActive && conversation.streak && directStreakChanged) {
      const missLevel = conversation.streak.missLevel || 0;
      const payload = {
        conversationId: conversation._id,
        streakCount: conversation.streak.count || 0,
        streakCompletedToday: true,
        streakAtRisk: missLevel > 0,
        streakExpiresAt: getVietnamDayEndISO(new Date()),
        streakRecoveryMode:
          missLevel === 1 ? "free" : missLevel === 2 ? "minus_one" : null,
        streakLost: false,
      };

      conversation.participants.forEach((p) => {
        io.to(p.userId.toString()).emit("streak-updated", payload);
      });
      emitStreakMilestoneIfMatched(conversation, conversation.streak.count || 0);
      if (isStreakMilestone(conversation.streak.count || 0)) {
        void createAutoStreakMilestonePostForConversation(
          conversation,
          conversation.streak.count || 0,
        );
      }
    }

    return res.status(201).json({ message });
  } catch (error) {
    console.error("Lỗi xảy ra khi gửi tin nhắn trực tiếp", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const acceptDirectRequest = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId);

    if (!conversation || conversation.type !== "direct") {
      return res.status(404).json({ message: "Không tìm thấy đoạn chat trực tiếp" });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === userId,
    );

    if (!isParticipant) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác" });
    }

    const responderId = conversation.directRequest?.responderId?.toString() ?? null;
    const requesterId = conversation.directRequest?.requesterId?.toString() ?? null;

    if (responderId && responderId !== userId) {
      return res.status(403).json({ message: "Chỉ người nhận mới có thể chấp nhận" });
    }

    conversation.directRequest = {
      status: "accepted",
      requesterId,
      responderId: userId,
      requesterMessageCount: conversation.directRequest?.requesterMessageCount || 0,
      respondedAt: new Date(),
      respondedBy: userId,
    };

    await conversation.save();
    emitDirectRequestUpdated(conversation);

    return res.status(200).json({
      message: "Đã chấp nhận yêu cầu tin nhắn",
      directRequest: conversation.directRequest,
    });
  } catch (error) {
    console.error("Lỗi khi chấp nhận yêu cầu tin nhắn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const voteLockedRecipientIncident = async (req, res) => {
  try {
    const voterId = req.user?._id?.toString?.();
    const { targetUserId, vote } = req.body || {};

    if (!targetUserId || !["safe", "suspicious"].includes(vote)) {
      return res.status(400).json({
        message: "Dữ liệu bình chọn không hợp lệ",
      });
    }

    if (voterId === targetUserId.toString()) {
      return res.status(400).json({ message: "Không thể tự bình chọn cho chính mình" });
    }

    const targetUser = await User.findById(targetUserId)
      .select("_id username displayName avatarUrl isLocked lockReason lockedAt")
      .lean();

    if (!targetUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    if (!targetUser.isLocked || !targetUser.lockedAt) {
      return res.status(400).json({ message: "Tài khoản này hiện không bị khóa" });
    }

    const existingVote = await FriendLockVote.findOne({
      lockedUserId: targetUser._id,
      voterId,
      lockedAtSnapshot: targetUser.lockedAt,
    })
      .select("_id vote")
      .lean();

    if (existingVote) {
      return res.status(409).json({
        message: "Bạn đã chọn trước đó cho đợt xác minh này",
        hasVoted: true,
        myVote: existingVote.vote,
      });
    }

    await FriendLockVote.create({
      lockedUserId: targetUser._id,
      voterId,
      lockedAtSnapshot: targetUser.lockedAt,
      vote,
    });

    const reason =
      vote === "safe"
        ? "Báo cáo đặc biệt (tài khoản bị khóa): Không vi phạm"
        : "Báo cáo đặc biệt (tài khoản bị khóa): Có vi phạm";
    const detail = `Bình chọn từ người dùng chat trực tiếp. lockedAtSnapshot=${new Date(targetUser.lockedAt).toISOString()}`;

    const reportDoc = await UserReport.create({
      reporterId: voterId,
      targetId: targetUser._id,
      reason,
      detail,
    });

    emitAdminReportNotification({
      reportId: reportDoc?._id,
      reporter: {
        _id: voterId,
        displayName: req.user?.displayName || "Người dùng",
        avatarUrl: req.user?.avatarUrl ?? null,
      },
      target: {
        _id: targetUser._id?.toString?.() || targetUser._id,
        displayName: targetUser.displayName || targetUser.username || "Người dùng",
        avatarUrl: targetUser.avatarUrl ?? null,
      },
      reason,
      detail,
      createdAt:
        reportDoc?.createdAt?.toISOString?.() || new Date().toISOString(),
    });

    return res.status(200).json({
      message: "Đỗi ngũ đã tiếp nhận cảm ơn bạn đã hỗ trợ bộ phận xác minh.",
      hasVoted: true,
      myVote: vote,
    });
  } catch (error) {
    console.error("Lỗi khi bình chọn tài khoản bị khóa từ chat", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const rejectDirectRequest = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId);

    if (!conversation || conversation.type !== "direct") {
      return res.status(404).json({ message: "Không tìm thấy đoạn chat trực tiếp" });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.userId.toString() === userId,
    );

    if (!isParticipant) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác" });
    }

    const requesterId = conversation.directRequest?.requesterId?.toString() ?? null;
    const responderId = conversation.directRequest?.responderId?.toString() ?? null;

    if (responderId && responderId !== userId) {
      return res.status(403).json({ message: "Chỉ người nhận mới có thể từ chối" });
    }

    const participantIds = (conversation.participants || []).map((p) =>
      p.userId.toString(),
    );

    await Promise.all([
      Message.deleteMany({ conversationId: conversation._id }),
      Conversation.findByIdAndDelete(conversation._id),
    ]);

    participantIds.forEach((pid) => {
      io.to(pid).emit("conversation-removed", {
        conversationId: conversation._id.toString(),
        reason: "direct-request-rejected",
        requesterId,
        responderId,
        rejectedBy: userId,
      });
    });

    return res.status(200).json({
      message: "Đã từ chối yêu cầu tin nhắn và xóa đoạn chat",
      removedConversationId: conversation._id.toString(),
    });
  } catch (error) {
    console.error("Lỗi khi từ chối yêu cầu tin nhắn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const requestDirectStreakMode = async (req, res) => {
  try {
    return res.status(400).json({
      message: "Chuỗi hiện được tự động theo quan hệ bạn bè/cặp đôi, không thể chọn thủ công.",
    });
  } catch (error) {
    console.error("Lỗi khi đề nghị chuỗi direct", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const acceptDirectStreakMode = async (req, res) => {
  try {
    return res.status(400).json({
      message: "Chuỗi hiện được tự động theo quan hệ bạn bè/cặp đôi, không thể chọn thủ công.",
    });
  } catch (error) {
    console.error("Lỗi khi chấp nhận chuỗi direct", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const rejectDirectStreakMode = async (req, res) => {
  try {
    return res.status(400).json({
      message: "Chuỗi hiện được tự động theo quan hệ bạn bè/cặp đôi, không thể chọn thủ công.",
    });
  } catch (error) {
    console.error("Lỗi khi từ chối chuỗi direct", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const { conversationId, content, imgUrl, audioUrl, videoUrl } = req.body;
    const senderId = req.user._id;
    const conversation = req.conversation;
    const safeContent = typeof content === "string" ? content.trim() : "";

    if (!safeContent && !imgUrl && !audioUrl && !videoUrl) {
      return res.status(400).json("Thiếu nội dung");
    }

    const message = await Message.create({
      conversationId,
      senderId,
      content: safeContent,
      imgUrl: typeof imgUrl === "string" ? imgUrl : undefined,
      videoUrl: typeof videoUrl === "string" ? videoUrl : undefined,
      audioUrl: typeof audioUrl === "string" ? audioUrl : undefined,
    });

    updateConversationAfterCreateMessage(conversation, message, senderId);

    // --- GROUP STREAK LOGIC ---
    // group streak only increases when ALL members have sent at least 1 message in today (VN timezone)
    const today = toVietnamDateKey(message.createdAt);
    const yesterday = getVietnamYesterdayKey(message.createdAt);

    if (conversation.type === "group") {
      const dayMap = conversation.lastMessageDayBy || new Map();
      dayMap.set(senderId.toString(), today);
      conversation.lastMessageDayBy = dayMap;

      const allMembersMessagedToday = conversation.participants.every((p) => {
        const pid = p.userId.toString();
        return conversation.lastMessageDayBy.get(pid) === today;
      });

      const lastCounted = conversation.streak?.lastCountedDay || null;

      if (allMembersMessagedToday && lastCounted !== today) {
        const prevCount = conversation.streak?.count || 0;

        if (lastCounted === yesterday) {
          conversation.streak.count = prevCount + 1;
        } else {
          conversation.streak.count = 1;
        }

        conversation.streak.lastCountedDay = today;

        // emit streak update to all participants
        const payload = {
          conversationId: conversation._id,
          streakCount: conversation.streak.count || 0,
          streakCompletedToday: true,
          streakAtRisk: false,
          streakExpiresAt: getVietnamDayEndISO(new Date()),
        };

        conversation.participants.forEach((p) => {
          io.to(p.userId.toString()).emit("streak-updated", payload);
        });
        emitStreakMilestoneIfMatched(conversation, conversation.streak.count || 0);
      }
    }

    await conversation.save();
    emitNewMessage(io, conversation, message);

    return res.status(201).json({ message });
  } catch (error) {
    console.error("Lỗi xảy ra khi gửi tin nhắn nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const uploadChatMedia = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "Vui lòng chọn file media" });
    }

    const mimetype = (file.mimetype || "").toString().split(";")[0].trim().toLowerCase();
    const mediaType = mimetype.startsWith("audio/")
      ? "audio"
      : mimetype.startsWith("video/")
        ? "video"
        : "image";

    const result = await uploadMediaFromBuffer(file.buffer, mimetype, {
      folder: "hichat/chats",
      resource_type: "auto",
    });

    if (!result?.secure_url) {
      return res.status(500).json({ message: "Không thể upload media" });
    }

    return res.status(200).json({
      url: result.secure_url,
      mediaType,
    });
  } catch (error) {
    console.error("Lỗi upload media chat", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
