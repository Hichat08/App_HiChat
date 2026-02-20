import Conversation from "../models/Conversation.js";
import Friend from "../models/Friend.js";
import Message from "../models/Message.js";
import UserBlock from "../models/UserBlock.js";
import UserRestriction from "../models/UserRestriction.js";
import {
  buildNewMessagePayload,
  emitNewMessage,
  updateConversationAfterCreateMessage,
} from "../utils/messageHelper.js";
import { io, isUserOnline } from "../socket/index.js";
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

const emitStreakMilestoneIfMatched = (conversation, streakCount) => {
  if (!STREAK_MILESTONES.includes(streakCount)) return;

  const payload = {
    conversationId: conversation._id,
    streakCount,
    milestone: streakCount,
  };

  conversation.participants.forEach((p) => {
    io.to(p.userId.toString()).emit("streak-milestone", payload);
  });
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

    if (await isBlockedPair(senderIdText, directRecipientId)) {
      return res.status(403).json({ message: "Không thể nhắn tin do có quan hệ chặn" });
    }

    if (await isRestrictedPair(senderIdText, directRecipientId)) {
      return res.status(403).json({ message: "Không thể nhắn tin do có quan hệ hạn chế" });
    }

    const areFriends = await isFriendPair(senderIdText, directRecipientId);

    if (!conversation) {
      conversation = await Conversation.create({
        type: "direct",
        participants: [
          { userId: senderId, joinedAt: new Date() },
          { userId: directRecipientId, joinedAt: new Date() },
        ],
        lastMessageAt: new Date(),
        unreadCounts: new Map(),
        directRequest: areFriends
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
      });
      createdNewDirectConversation = true;
    }

    normalizeDirectRequestIfFriend(conversation, areFriends);

    if (
      conversation.type === "direct" &&
      !areFriends &&
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

    if (directRequest.status === "rejected" && !areFriends) {
      return res.status(403).json({
        message: "Người này đã từ chối yêu cầu tin nhắn. Bạn cần kết bạn để nhắn tiếp.",
      });
    }

    if (directRequest.status === "pending" && !areFriends) {
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
    if (conversation.type === "direct") {
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
    if (conversation.type === "direct" && conversation.streak && directStreakChanged) {
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
