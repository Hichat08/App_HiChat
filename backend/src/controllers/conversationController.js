import Conversation from "../models/Conversation.js";
import Friend from "../models/Friend.js";
import FriendRequest from "../models/FriendRequest.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import UserBlock from "../models/UserBlock.js";
import UserReport from "../models/UserReport.js";
import GroupReport from "../models/GroupReport.js";
import UserRestriction from "../models/UserRestriction.js";
import FriendLockVote from "../models/FriendLockVote.js";
import { io } from "../socket/index.js";
import { uploadImageFromBuffer } from "../middlewares/uploadMiddleware.js";
import { v2 as cloudinary } from "cloudinary";
import { emitAdminReportNotification } from "../utils/adminNotificationHelper.js";
import {
  getVietnamDayEndISO,
  getVietnamYesterdayKey,
  reconcileMissLevel,
  toVietnamDateKey,
} from "../utils/streakDateHelper.js";

const toPairKey = (a, b) => {
  const aText = a.toString();
  const bText = b.toString();
  return aText < bText ? `${aText}:${bText}` : `${bText}:${aText}`;
};

const toPlainMap = (value) => {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  return value;
};

const getBooleanFromMap = (value, key, fallback = false) => {
  const raw = value instanceof Map ? value.get(key) : value?.[key];
  return typeof raw === "boolean" ? raw : fallback;
};

const getNicknameForPair = (nicknames, viewerId, targetId) => {
  if (!viewerId || !targetId) return "";
  const key = `${viewerId}:${targetId}`;
  const raw = nicknames instanceof Map ? nicknames.get(key) : nicknames?.[key];
  return typeof raw === "string" ? raw : "";
};

const getGroupNickname = (nicknames, viewerId) => {
  if (!viewerId) return "";
  const key = `group:${viewerId}`;
  const raw = nicknames instanceof Map ? nicknames.get(key) : nicknames?.[key];
  return typeof raw === "string" ? raw : "";
};

const isConversationParticipant = (conversation, userId) =>
  (conversation?.participants || []).some((p) => p.userId.toString() === userId);

const getOtherParticipantId = (conversation, userId) =>
  (conversation?.participants || []).find((p) => p.userId.toString() !== userId)?.userId?.toString() ?? null;

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

export const createConversation = async (req, res) => {
  try {
    const { type, name, memberIds } = req.body;
    const userId = req.user._id;
    const userIdText = userId.toString();

    if (
      !type ||
      (type === "group" && !name) ||
      !memberIds ||
      !Array.isArray(memberIds) ||
      memberIds.length === 0
    ) {
      return res
        .status(400)
        .json({ message: "Tên nhóm và danh sách thành viên là bắt buộc" });
    }

    let conversation;

    if (type === "direct") {
      const participantId = memberIds[0];
      const senderIdText = userId.toString();
      const participantIdText = participantId.toString();
      const senderProfile = await User.findById(userId)
        .select("_id isVerified")
        .lean();
      const isVerifiedSender = !!senderProfile?.isVerified;

      conversation = await Conversation.findOne({
        type: "direct",
        "participants.userId": { $all: [userId, participantId] },
      });

      const userA = senderIdText < participantIdText ? senderIdText : participantIdText;
      const userB = senderIdText < participantIdText ? participantIdText : senderIdText;
      const areFriends = !!(await Friend.findOne({ userA, userB }).lean());
      const isCouple = areFriends ? await isCouplePair(senderIdText, participantIdText) : false;
      const derivedStreakType = areFriends ? (isCouple ? "love" : "friends") : null;
      const derivedStreakStatus = derivedStreakType ? "active" : "none";

      if (!conversation) {
        conversation = new Conversation({
          type: "direct",
          participants: [{ userId }, { userId: participantId }],
          lastMessageAt: new Date(),
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
                requesterId: userId,
                responderId: participantId,
                requesterMessageCount: 0,
                respondedAt: null,
                respondedBy: null,
              },
          streakMode: {
            type: derivedStreakType,
            status: derivedStreakStatus,
            requestedBy: null,
            requestedAt: null,
            acceptedUserIds: [],
            activatedAt: derivedStreakStatus === "active" ? new Date() : null,
          },
        });

        await conversation.save();
      } else if ((areFriends || isVerifiedSender) && conversation.directRequest?.status !== "accepted") {
        conversation.directRequest = {
          status: "accepted",
          requesterId: null,
          responderId: null,
          requesterMessageCount: 0,
          respondedAt: new Date(),
          respondedBy: null,
        };
        await conversation.save();
      }

      if (conversation) {
        const currentType = conversation.streakMode?.type || null;
        const currentStatus = conversation.streakMode?.status || "none";
        if (currentType !== derivedStreakType || currentStatus !== derivedStreakStatus) {
          conversation.streakMode = {
            type: derivedStreakType,
            status: derivedStreakStatus,
            requestedBy: null,
            requestedAt: null,
            acceptedUserIds: [],
            activatedAt: derivedStreakStatus === "active" ? new Date() : null,
          };
          if (currentStatus !== derivedStreakStatus) {
            conversation.streak.count = 0;
            conversation.streak.lastCountedDay = null;
            conversation.streak.missLevel = 0;
            conversation.lastMessageDayBy = new Map();
          }
          await conversation.save();
        }
      }
    }

    if (type === "group") {
      conversation = new Conversation({
        type: "group",
        participants: [{ userId }, ...memberIds.map((id) => ({ userId: id }))],
        group: {
          name,
          createdBy: userId,
        },
        lastMessageAt: new Date(),
      });

      await conversation.save();
    }

    if (!conversation) {
      return res
        .status(400)
        .json({ message: "Conversation type không hợp lệ" });
    }

    await conversation.populate([
      { path: "participants.userId", select: "displayName avatarUrl isVerified isLocked lockReason lockedAt" },
      {
        path: "seenBy",
        select: "displayName avatarUrl",
      },
      { path: "lastMessage.senderId", select: "displayName avatarUrl" },
    ]);

    const participants = (conversation.participants || []).map((p) => ({
      _id: p.userId?._id,
      displayName: p.userId?.displayName,
      avatarUrl: p.userId?.avatarUrl ?? null,
      joinedAt: p.joinedAt,
      isLocked: !!p.userId?.isLocked,
      lockReason: p.userId?.lockReason || "",
      lockedAt: p.userId?.lockedAt || null,
    }));

    const otherParticipantId =
      conversation.type === "direct"
        ? participants.find((p) => p._id?.toString() !== userIdText)?._id?.toString() ?? null
        : null;
    const nicknames = toPlainMap(conversation.nicknames);
    const muted = getBooleanFromMap(conversation.mutedBy, userIdText, false);
    const archived = getBooleanFromMap(conversation.archivedBy, userIdText, false);
    const readReceiptEnabled = getBooleanFromMap(
      conversation.readReceiptBy,
      userIdText,
      true,
    );
    const e2eeEnabled = getBooleanFromMap(conversation.e2eeEnabledBy, userIdText, false);
    const participantIds = participants.map((p) => p._id?.toString()).filter(Boolean);
    const e2eeActive =
      participantIds.length > 0 &&
      participantIds.every((pid) =>
        getBooleanFromMap(conversation.e2eeEnabledBy, pid, false),
      );
    const nickname =
      conversation.type === "direct" && otherParticipantId
        ? getNicknameForPair(nicknames, userIdText, otherParticipantId)
        : conversation.type === "group"
          ? getGroupNickname(nicknames, userIdText)
          : "";

    const otherParticipant =
      conversation.type === "direct"
        ? participants.find((p) => p._id?.toString() !== userIdText) ?? null
        : null;

    let lockIncidentVote = { hasVoted: false, myVote: null };
    if (otherParticipant?.isLocked && otherParticipant?.lockedAt) {
      const existingVote = await FriendLockVote.findOne({
        lockedUserId: otherParticipant._id,
        voterId: userId,
        lockedAtSnapshot: otherParticipant.lockedAt,
      })
        .select("vote")
        .lean();

      lockIncidentVote = {
        hasVoted: !!existingVote,
        myVote: existingVote?.vote || null,
      };
    }

    const formatted = {
      ...conversation.toObject(),
      participants,
      nicknames,
      nickname,
      muted,
      archived,
      readReceiptEnabled,
      e2eeEnabled,
      e2eeActive,
      lockIncidentVote,
    };

    if (type === "group") {
      memberIds.forEach((userId) => {
        io.to(userId).emit("new-group", formatted);
      });
    }

    return res.status(201).json({ conversation: formatted });
  } catch (error) {
    console.error("Lỗi khi tạo conversation", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const userIdText = userId.toString();
    const conversations = await Conversation.find({
      "participants.userId": userId,
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate({
        path: "participants.userId",
        select: "displayName avatarUrl isVerified isLocked lockReason lockedAt",
      })
      .populate({
        path: "lastMessage.senderId",
        select: "displayName avatarUrl",
      })
      .populate({
        path: "seenBy",
        select: "displayName avatarUrl",
      });

    const directPartnerIds = conversations
      .filter((c) => c.type === "direct")
      .map((c) =>
        c.participants.find((p) => p.userId?._id?.toString() !== userIdText)?.userId?._id?.toString(),
      )
      .filter(Boolean);

    const uniqueDirectPartnerIds = [...new Set(directPartnerIds)];
    const lockVoteByKey = new Map();

    const blockedByMeSet = new Set();
    const blockedByOtherSet = new Set();
    const restrictedByMeSet = new Set();
    const restrictedByOtherSet = new Set();
    const friendSet = new Set();

    const friendPairQueries = [];
    const friendPairKeys = new Set();
    uniqueDirectPartnerIds.forEach((partnerId) => {
      const key = toPairKey(userIdText, partnerId);
      if (friendPairKeys.has(key)) return;
      friendPairKeys.add(key);
      const [userA, userB] = key.split(":");
      friendPairQueries.push({ userA, userB });
    });

    const relationshipUserIds = [userIdText, ...uniqueDirectPartnerIds];
    const userRelationshipMap = new Map();

    if (relationshipUserIds.length > 0) {
      const relationshipUsers = await User.find({ _id: { $in: relationshipUserIds } })
        .select("_id relationshipStatus relationshipPartnerId")
        .lean();
      (relationshipUsers || []).forEach((u) => {
        userRelationshipMap.set(u._id.toString(), u);
      });
    }

    if (uniqueDirectPartnerIds.length > 0) {
      const [blockRows, restrictionRows, friendRows] = await Promise.all([
        UserBlock.find({
          $or: [
            { blockerId: userIdText, blockedId: { $in: uniqueDirectPartnerIds } },
            { blockerId: { $in: uniqueDirectPartnerIds }, blockedId: userIdText },
          ],
        })
          .select("blockerId blockedId")
          .lean(),
        UserRestriction.find({
          $or: [
            { userId: userIdText, restrictedUserId: { $in: uniqueDirectPartnerIds } },
            { userId: { $in: uniqueDirectPartnerIds }, restrictedUserId: userIdText },
          ],
        })
          .select("userId restrictedUserId")
          .lean(),
        friendPairQueries.length > 0
          ? Friend.find({ $or: friendPairQueries }).select("userA userB").lean()
          : Promise.resolve([]),
      ]);

      (blockRows || []).forEach((row) => {
        const blockerId = row.blockerId?.toString();
        const blockedId = row.blockedId?.toString();
        if (blockerId === userIdText) blockedByMeSet.add(blockedId);
        if (blockedId === userIdText) blockedByOtherSet.add(blockerId);
      });

      (restrictionRows || []).forEach((row) => {
        const actorId = row.userId?.toString();
        const targetId = row.restrictedUserId?.toString();
        if (actorId === userIdText) restrictedByMeSet.add(targetId);
        if (targetId === userIdText) restrictedByOtherSet.add(actorId);
      });

      (friendRows || []).forEach((row) => {
        const key = toPairKey(row.userA, row.userB);
        friendSet.add(key);
      });
    }

    const lockedPartnerSnapshots = conversations
      .filter((convo) => convo.type === "direct")
      .map((convo) =>
        (convo.participants || []).find((p) => p.userId?._id?.toString() !== userIdText)?.userId,
      )
      .filter((partner) => partner?.isLocked && partner?.lockedAt)
      .map((partner) => ({
        lockedUserId: partner._id?.toString?.(),
        lockedAt: partner.lockedAt,
      }))
      .filter((item) => item.lockedUserId && item.lockedAt);

    const lockedPartnerIds = [...new Set(lockedPartnerSnapshots.map((item) => item.lockedUserId))];
    if (lockedPartnerIds.length > 0) {
      const voteDocs = await FriendLockVote.find({
        voterId: userId,
        lockedUserId: { $in: lockedPartnerIds },
      })
        .select("lockedUserId lockedAtSnapshot vote")
        .lean();

      (voteDocs || []).forEach((doc) => {
        const key = `${doc.lockedUserId?.toString?.()}::${new Date(doc.lockedAtSnapshot).toISOString()}`;
        lockVoteByKey.set(key, doc.vote || null);
      });
    }

    const formatted = conversations.map((convo) => {
      const participants = (convo.participants || []).map((p) => ({
        _id: p.userId?._id,
        displayName: p.userId?.displayName,
        avatarUrl: p.userId?.avatarUrl ?? null,
        joinedAt: p.joinedAt,
        isLocked: !!p.userId?.isLocked,
        lockReason: p.userId?.lockReason || "",
        lockedAt: p.userId?.lockedAt || null,
      }));

      const otherParticipantId =
        convo.type === "direct"
          ? participants.find((p) => p._id?.toString() !== userIdText)?._id?.toString() ?? null
          : null;

      const isFriendPair =
        convo.type === "direct" &&
        otherParticipantId &&
        friendSet.has(toPairKey(userIdText, otherParticipantId));

      const meRelationship = userRelationshipMap.get(userIdText);
      const otherRelationship = otherParticipantId
        ? userRelationshipMap.get(otherParticipantId)
        : null;

      const isCouplePair =
        !!isFriendPair &&
        meRelationship?.relationshipStatus === "in_relationship" &&
        otherRelationship?.relationshipStatus === "in_relationship" &&
        meRelationship?.relationshipPartnerId?.toString() === otherParticipantId &&
        otherRelationship?.relationshipPartnerId?.toString() === userIdText;

      const derivedStreakType = isFriendPair ? (isCouplePair ? "love" : "friends") : null;
      const derivedStreakStatus = derivedStreakType ? "active" : "none";

      const nicknames = toPlainMap(convo.nicknames);
      const muted = getBooleanFromMap(convo.mutedBy, userIdText, false);
      const archived = getBooleanFromMap(convo.archivedBy, userIdText, false);
      const readReceiptEnabled = getBooleanFromMap(convo.readReceiptBy, userIdText, true);
      const e2eeEnabled = getBooleanFromMap(convo.e2eeEnabledBy, userIdText, false);
      const participantIds = participants.map((p) => p._id?.toString()).filter(Boolean);
      const e2eeActive =
        participantIds.length > 0 &&
        participantIds.every((pid) =>
          getBooleanFromMap(convo.e2eeEnabledBy, pid, false),
        );
      const nickname =
        convo.type === "direct" && otherParticipantId
          ? getNicknameForPair(nicknames, userIdText, otherParticipantId)
          : convo.type === "group"
            ? getGroupNickname(nicknames, userIdText)
            : "";

      // compute visible streak: only keep streak if lastCountedDay is today or yesterday
      const streakObj = convo.streak || { count: 0, lastCountedDay: null };
      const today = toVietnamDateKey(new Date());
      const yesterday = getVietnamYesterdayKey(new Date());
      const reconciled = reconcileMissLevel(streakObj, today);

      let effectiveCount = streakObj.count || 0;
      let effectiveLastCounted = streakObj.lastCountedDay || null;
      let effectiveMissLevel = reconciled.missLevel || 0;

      if (reconciled.streakLost) {
        effectiveCount = 0;
        effectiveLastCounted = null;
        effectiveMissLevel = 0;
      }

      const visibleStreak =
        derivedStreakStatus === "active" &&
        (effectiveLastCounted === today ||
        effectiveLastCounted === yesterday)
          ? effectiveCount
          : 0;

      const normalizedStreakMode = {
        type: derivedStreakType,
        status: derivedStreakStatus,
        requestedBy: null,
        requestedAt: null,
        acceptedUserIds: [],
        activatedAt: derivedStreakStatus === "active" ? convo.streakMode?.activatedAt || null : null,
      };

      let streakCompletedToday = false;
      let streakAtRisk = false;
      let streakExpiresAt = null;
      let streakRecoveryMode = null;
      let streakLost = false;

      if (convo.type === "direct" && visibleStreak > 0) {
        const dayMapRaw = convo.lastMessageDayBy || {};
        const dayMap =
          dayMapRaw instanceof Map
            ? Object.fromEntries(dayMapRaw.entries())
            : dayMapRaw;

        const participantIds = participants.map((p) => p._id?.toString()).filter(Boolean);
        streakCompletedToday = participantIds.every(
          (pid) => dayMap?.[pid] === today,
        );
        streakAtRisk = !streakCompletedToday || effectiveMissLevel > 0;
        streakExpiresAt = getVietnamDayEndISO(new Date());
        streakRecoveryMode =
          effectiveMissLevel === 1
            ? "free"
            : effectiveMissLevel === 2
              ? "minus_one"
              : null;
      } else if (convo.type === "direct" && reconciled.streakLost && derivedStreakStatus === "active") {
        streakLost = true;
      }

      const otherParticipant =
        convo.type === "direct"
          ? participants.find((p) => p._id?.toString() !== userIdText) ?? null
          : null;
      const lockVoteKey =
        otherParticipant?.isLocked && otherParticipant?.lockedAt
          ? `${otherParticipant._id?.toString?.()}::${new Date(otherParticipant.lockedAt).toISOString()}`
          : null;
      const myVote = lockVoteKey ? lockVoteByKey.get(lockVoteKey) || null : null;
      const lockIncidentVote = {
        hasVoted: !!myVote,
        myVote,
      };

      return {
        ...convo.toObject(),
        unreadCounts: convo.unreadCounts || {},
        participants,
        blockedByMe: otherParticipantId ? blockedByMeSet.has(otherParticipantId) : false,
        blockedByOther: otherParticipantId ? blockedByOtherSet.has(otherParticipantId) : false,
        restrictedByMe: otherParticipantId ? restrictedByMeSet.has(otherParticipantId) : false,
        restrictedByOther: otherParticipantId
          ? restrictedByOtherSet.has(otherParticipantId)
          : false,
        nicknames,
        nickname,
        muted,
        archived,
        readReceiptEnabled,
        e2eeEnabled,
        e2eeActive,
        lockIncidentVote,
        streakMode: normalizedStreakMode,
        streakCount: visibleStreak,
        streakMissLevel: effectiveMissLevel,
        streakCompletedToday,
        streakAtRisk,
        streakExpiresAt,
        streakRecoveryMode,
        streakLost,
      };
    });

    return res.status(200).json({ conversations: formatted });
  } catch (error) {
    console.error("Lỗi xảy ra khi lấy conversations", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, cursor } = req.query;

    const query = { conversationId };

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    let messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit) + 1);

    let nextCursor = null;

    if (messages.length > Number(limit)) {
      const nextMessage = messages[messages.length - 1];
      nextCursor = nextMessage.createdAt.toISOString();
      messages.pop();
    }

    messages = messages.reverse();

    return res.status(200).json({
      messages,
      nextCursor,
    });
  } catch (error) {
    console.error("Lỗi xảy ra khi lấy messages", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getUserConversationsForSocketIO = async (userId) => {
  try {
    const conversations = await Conversation.find(
      { "participants.userId": userId },
      { _id: 1 },
    );

    return conversations.map((c) => c._id.toString());
  } catch (error) {
    console.error("Lỗi khi fetch conversations: ", error);
    return [];
  }
};

export const markAsSeen = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();
    const now = new Date();

    const conversation = await Conversation.findById(conversationId).lean();

    if (!conversation) {
      return res.status(404).json({ message: "Conversation không tồn tại" });
    }

    const last = conversation.lastMessage;

    if (!last) {
      return res
        .status(200)
        .json({ message: "Không có tin nhắn để mark as seen" });
    }

    if (last.senderId.toString() === userId) {
      return res.status(200).json({ message: "Sender không cần mark as seen" });
    }

    const readReceiptEnabled = getBooleanFromMap(conversation.readReceiptBy, userId, true);
    let seenMessageIds = [];

    if (readReceiptEnabled) {
      const unseenMessages = await Message.find({
        conversationId,
        senderId: { $ne: userId },
        seenAt: null,
      })
        .select("_id")
        .lean();

      seenMessageIds = unseenMessages.map((m) => m._id.toString());

      if (seenMessageIds.length > 0) {
        await Message.updateMany(
          { _id: { $in: seenMessageIds } },
          {
            $set: {
              seenAt: now,
              deliveredAt: now,
            },
          },
        );
      }
    }

    const updatePayload = {
      $set: { [`unreadCounts.${userId}`]: 0 },
    };
    if (readReceiptEnabled) {
      updatePayload.$addToSet = { seenBy: userId };
    }

    const updated = await Conversation.findByIdAndUpdate(conversationId, updatePayload, {
      new: true,
    });

    if (readReceiptEnabled) {
      io.to(conversationId).emit("read-message", {
        conversation: updated,
        lastMessage: {
          _id: updated?.lastMessage._id,
          content: updated?.lastMessage.content,
          createdAt: updated?.lastMessage.createdAt,
          sender: {
            _id: updated?.lastMessage.senderId,
          },
        },
      });

      if (seenMessageIds.length > 0) {
        io.to(conversationId).emit("messages-seen", {
          conversationId,
          messageIds: seenMessageIds,
          seenAt: now.toISOString(),
        });
      }
    }

    return res.status(200).json({
      message: "Marked as seen",
      seenBy: updated?.seenBy || [],
      myUnreadCount: updated?.unreadCounts[userId] || 0,
    });
  } catch (error) {
    console.error("Lỗi khi mark as seen", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const clearConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    const isParticipant = (conversation.participants || []).some(
      (p) => p.userId.toString() === userId,
    );
    if (!isParticipant) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác cuộc trò chuyện này" });
    }

    await Message.deleteMany({ conversationId });

    let friendshipRemoved = false;

    if (conversation.type === "direct") {
      const participantIds = (conversation.participants || []).map((p) =>
        p.userId.toString(),
      );
      const targetUserId = participantIds.find((id) => id !== userId) || null;

      if (targetUserId) {
        const removeFriendResult = await Friend.deleteMany({
          $or: [
            { userA: userId, userB: targetUserId },
            { userA: targetUserId, userB: userId },
          ],
        });

        friendshipRemoved = (removeFriendResult?.deletedCount || 0) > 0;

        await FriendRequest.deleteMany({
          $or: [
            { from: userId, to: targetUserId },
            { from: targetUserId, to: userId },
          ],
        });

        participantIds.forEach((pid) => {
          io.to(pid).emit("friendship-reset", {
            actorId: userId,
            withUserId: pid === userId ? targetUserId : userId,
            conversationId: conversationId.toString(),
          });
        });
      }

      await Conversation.findByIdAndDelete(conversationId);

      participantIds.forEach((pid) => {
        io.to(pid).emit("conversation-removed", {
          conversationId: conversationId.toString(),
          reason: "chat-deleted-reset",
          requesterId: userId,
        });
      });

      return res.status(200).json({
        message: "Đã xoá đoạn chat và đặt lại quan hệ hai bên",
        removedConversationId: conversationId.toString(),
        friendshipRemoved,
      });
    }

    const nextUnreadCounts = new Map();
    (conversation.participants || []).forEach((p) => {
      nextUnreadCounts.set(p.userId.toString(), 0);
    });

    conversation.lastMessage = null;
    conversation.seenBy = [];
    conversation.unreadCounts = nextUnreadCounts;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    await conversation.populate([
      { path: "participants.userId", select: "displayName avatarUrl" },
      { path: "seenBy", select: "displayName avatarUrl" },
      { path: "lastMessage.senderId", select: "displayName avatarUrl" },
    ]);

    const participants = (conversation.participants || []).map((p) => ({
      _id: p.userId?._id,
      displayName: p.userId?.displayName,
      avatarUrl: p.userId?.avatarUrl ?? null,
      joinedAt: p.joinedAt,
    }));
    const nickname = getGroupNickname(conversation.nicknames, userId);

    const formatted = {
      ...conversation.toObject(),
      participants,
      unreadCounts: conversation.unreadCounts || {},
      nickname,
    };

    io.to(conversationId).emit("conversation-cleared", {
      conversationId: conversationId.toString(),
      conversation: formatted,
      clearedBy: userId,
    });

    return res.status(200).json({
      message: "Đã xoá toàn bộ tin nhắn trong cuộc trò chuyện",
      conversation: formatted,
      friendshipRemoved,
    });
  } catch (error) {
    console.error("Lỗi khi xoá toàn bộ tin nhắn cuộc trò chuyện", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const toggleBlockConversationUser = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    if (conversation.type !== "direct") {
      return res.status(400).json({ message: "Chỉ hỗ trợ chặn trong đoạn chat trực tiếp" });
    }

    const participantIds = (conversation.participants || []).map((p) => p.userId.toString());
    if (!participantIds.includes(userId)) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác cuộc trò chuyện này" });
    }

    const targetUserId = participantIds.find((id) => id !== userId);
    if (!targetUserId) {
      return res.status(400).json({ message: "Không tìm thấy người dùng cần chặn" });
    }

    const existing = await UserBlock.findOne({
      blockerId: userId,
      blockedId: targetUserId,
    }).lean();

    const willBlock = !existing;

    if (willBlock) {
      await UserBlock.create({ blockerId: userId, blockedId: targetUserId });

      const [userA, userB] =
        userId < targetUserId ? [userId, targetUserId] : [targetUserId, userId];

      await Promise.all([
        Friend.deleteOne({ userA, userB }),
        FriendRequest.deleteMany({
          $or: [
            { from: userId, to: targetUserId },
            { from: targetUserId, to: userId },
          ],
        }),
      ]);
    } else {
      await UserBlock.deleteOne({ blockerId: userId, blockedId: targetUserId });
    }

    io.to(conversationId).emit("conversation-block-updated", {
      conversationId: conversationId.toString(),
      actorId: userId,
      targetId: targetUserId,
      blocked: willBlock,
    });

    return res.status(200).json({
      message: willBlock ? "Đã chặn người dùng trong đoạn chat" : "Đã bỏ chặn người dùng",
      blockedByMe: willBlock,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật trạng thái chặn trong đoạn chat", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const toggleRestrictConversationUser = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    if (conversation.type !== "direct") {
      return res.status(400).json({ message: "Chỉ hỗ trợ hạn chế trong đoạn chat trực tiếp" });
    }

    const participantIds = (conversation.participants || []).map((p) => p.userId.toString());
    if (!participantIds.includes(userId)) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác cuộc trò chuyện này" });
    }

    const targetUserId = participantIds.find((id) => id !== userId);
    if (!targetUserId) {
      return res.status(400).json({ message: "Không tìm thấy người dùng cần hạn chế" });
    }

    const existing = await UserRestriction.findOne({
      userId,
      restrictedUserId: targetUserId,
    }).lean();

    const willRestrict = !existing;

    if (willRestrict) {
      await UserRestriction.create({
        userId,
        restrictedUserId: targetUserId,
      });
    } else {
      await UserRestriction.deleteOne({
        userId,
        restrictedUserId: targetUserId,
      });
    }

    io.to(conversationId).emit("conversation-restrict-updated", {
      conversationId: conversationId.toString(),
      actorId: userId,
      targetId: targetUserId,
      restricted: willRestrict,
    });

    return res.status(200).json({
      message: willRestrict ? "Đã hạn chế người dùng trong đoạn chat" : "Đã bỏ hạn chế người dùng",
      restrictedByMe: willRestrict,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật trạng thái hạn chế trong đoạn chat", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateDirectConversationTheme = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { themeId } = req.body || {};
    const userId = req.user._id.toString();

    const allowedThemeIds = ["violet", "ocean", "sunset", "rose", "forest"];
    if (!themeId || !allowedThemeIds.includes(themeId)) {
      return res.status(400).json({ message: "Theme không hợp lệ" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    const participantIds = (conversation.participants || []).map((p) => p.userId.toString());
    if (!participantIds.includes(userId)) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác cuộc trò chuyện này" });
    }

    conversation.directThemeId = themeId;
    await conversation.save();

    io.to(conversationId).emit("conversation-theme-updated", {
      conversationId: conversationId.toString(),
      directThemeId: themeId,
      updatedBy: userId,
    });

    return res.status(200).json({
      message: "Đã cập nhật chủ đề cuộc trò chuyện",
      directThemeId: themeId,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật chủ đề đoạn chat", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateConversationNickname = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { targetUserId, nickname } = req.body || {};
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }
    if (conversation.type !== "direct") {
      return res.status(400).json({ message: "Chỉ hỗ trợ biệt danh cho chat 1-1" });
    }
    if (!isConversationParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác cuộc trò chuyện này" });
    }

    const otherId = getOtherParticipantId(conversation, userId);
    const targetId = targetUserId?.toString() || otherId;
    if (!targetId || targetId !== otherId) {
      return res.status(400).json({ message: "Người dùng mục tiêu không hợp lệ" });
    }

    const cleaned = typeof nickname === "string" ? nickname.trim() : "";
    const nickMap = conversation.nicknames || new Map();
    const key = `${userId}:${targetId}`;
    if (cleaned) {
      nickMap.set(key, cleaned);
    } else {
      nickMap.delete(key);
    }
    conversation.nicknames = nickMap;
    await conversation.save();

    return res.status(200).json({
      message: "Đã cập nhật biệt danh",
      nickname: cleaned,
      nicknames: toPlainMap(conversation.nicknames),
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật biệt danh", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateGroupNickname = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { nickname } = req.body || {};
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }
    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Chỉ hỗ trợ biệt danh cho nhóm" });
    }
    if (!isConversationParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác cuộc trò chuyện này" });
    }

    const cleaned = typeof nickname === "string" ? nickname.trim() : "";
    const nickMap = conversation.nicknames || new Map();
    const key = `group:${userId}`;
    if (cleaned) {
      nickMap.set(key, cleaned);
    } else {
      nickMap.delete(key);
    }
    conversation.nicknames = nickMap;
    await conversation.save();

    return res.status(200).json({
      message: "Đã cập nhật biệt danh nhóm",
      nickname: cleaned,
      nicknames: toPlainMap(conversation.nicknames),
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật biệt danh nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const toggleConversationMute = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { muted } = req.body || {};
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }
    if (!isConversationParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác cuộc trò chuyện này" });
    }

    const nextMuted = !!muted;
    const muteMap = conversation.mutedBy || new Map();
    if (nextMuted) {
      muteMap.set(userId, true);
    } else {
      muteMap.delete(userId);
    }
    conversation.mutedBy = muteMap;
    await conversation.save();

    return res.status(200).json({
      message: nextMuted ? "Đã tắt thông báo cuộc trò chuyện" : "Đã bật lại thông báo",
      muted: nextMuted,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật trạng thái thông báo", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const toggleConversationReadReceipt = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { enabled } = req.body || {};
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }
    if (!isConversationParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác cuộc trò chuyện này" });
    }

    const nextEnabled = !!enabled;
    const receiptMap = conversation.readReceiptBy || new Map();
    if (nextEnabled) {
      receiptMap.delete(userId);
    } else {
      receiptMap.set(userId, false);
    }
    conversation.readReceiptBy = receiptMap;
    await conversation.save();

    return res.status(200).json({
      message: nextEnabled ? "Đã bật thông báo đã đọc" : "Đã tắt thông báo đã đọc",
      readReceiptEnabled: nextEnabled,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật thông báo đã đọc", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const toggleConversationArchive = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { archived } = req.body || {};
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }
    if (!isConversationParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác cuộc trò chuyện này" });
    }

    const nextArchived = !!archived;
    const archiveMap = conversation.archivedBy || new Map();
    if (nextArchived) {
      archiveMap.set(userId, true);
    } else {
      archiveMap.delete(userId);
    }
    conversation.archivedBy = archiveMap;
    await conversation.save();

    return res.status(200).json({
      message: nextArchived ? "Đã lưu trữ đoạn chat" : "Đã bỏ lưu trữ",
      archived: nextArchived,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật lưu trữ đoạn chat", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const toggleConversationE2EE = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { enabled } = req.body || {};
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }
    if (conversation.type !== "direct") {
      return res.status(400).json({ message: "Chỉ hỗ trợ chat mã hóa cho 1-1" });
    }
    if (!isConversationParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác cuộc trò chuyện này" });
    }

    const nextEnabled = !!enabled;
    const enabledMap = conversation.e2eeEnabledBy || new Map();
    if (nextEnabled) {
      enabledMap.set(userId, true);
    } else {
      enabledMap.delete(userId);
    }
    conversation.e2eeEnabledBy = enabledMap;

    const participantIds = (conversation.participants || []).map((p) => p.userId.toString());
    const e2eeActive =
      participantIds.length > 0 &&
      participantIds.every((pid) => getBooleanFromMap(enabledMap, pid, false));
    conversation.e2eeActive = e2eeActive;

    await conversation.save();

    io.to(conversationId).emit("conversation-e2ee-updated", {
      conversationId: conversationId.toString(),
      e2eeActive,
    });

    return res.status(200).json({
      message: nextEnabled ? "Đã bật mã hóa đầu cuối" : "Đã tắt mã hóa đầu cuối",
      e2eeEnabled: nextEnabled,
      e2eeActive,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật trạng thái mã hóa đầu cuối", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const reportConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { reason, detail } = req.body || {};
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }
    if (!isConversationParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Bạn không có quyền thao tác cuộc trò chuyện này" });
    }

    const cleanedReason = typeof reason === "string" ? reason.trim() : "";
    if (!cleanedReason) {
      return res.status(400).json({ message: "Vui lòng nhập lý do báo cáo" });
    }

    if (conversation.type === "direct") {
      const targetId = getOtherParticipantId(conversation, userId);
      if (!targetId) {
        return res.status(400).json({ message: "Không tìm thấy người bị báo cáo" });
      }

      const reportDoc = await UserReport.create({
        reporterId: userId,
        targetId,
        reason: cleanedReason,
        detail: typeof detail === "string" ? detail.trim() : "",
      });

      const targetUser = await User.findById(targetId)
        .select("_id displayName avatarUrl")
        .lean();

      emitAdminReportNotification({
        reportId: reportDoc?._id,
        reporter: {
          _id: userId,
          displayName: req.user?.displayName || "Người dùng",
          avatarUrl: req.user?.avatarUrl ?? null,
        },
        target: {
          _id: targetId,
          displayName: targetUser?.displayName || "Người dùng",
          avatarUrl: targetUser?.avatarUrl ?? null,
        },
        reason: cleanedReason,
        detail: typeof detail === "string" ? detail.trim() : "",
        createdAt: reportDoc?.createdAt?.toISOString?.() || new Date().toISOString(),
        targetType: "user",
      });

      return res.status(200).json({ message: "Đã gửi báo cáo" });
    }

    if (conversation.type === "group") {
      const reportDoc = await GroupReport.create({
        reporterId: userId,
        conversationId,
        reason: cleanedReason,
        detail: typeof detail === "string" ? detail.trim() : "",
      });

      emitAdminReportNotification({
        reportId: reportDoc?._id,
        reporter: {
          _id: userId,
          displayName: req.user?.displayName || "Người dùng",
          avatarUrl: req.user?.avatarUrl ?? null,
        },
        target: {
          _id: conversationId,
          displayName: conversation.group?.name || "Nhóm chat",
          avatarUrl: conversation.group?.avatarUrl ?? null,
        },
        reason: cleanedReason,
        detail: typeof detail === "string" ? detail.trim() : "",
        createdAt: reportDoc?.createdAt?.toISOString?.() || new Date().toISOString(),
        targetType: "group",
        targetMeta: {
          groupId: conversationId,
          createdBy: conversation.group?.createdBy?.toString?.() || null,
        },
      });

      return res.status(200).json({ message: "Đã gửi báo cáo nhóm" });
    }

    return res.status(400).json({ message: "Không hỗ trợ loại cuộc trò chuyện này" });
  } catch (error) {
    console.error("Lỗi khi báo cáo cuộc trò chuyện", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const listGroupReports = async (req, res) => {
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

    let reports = await GroupReport.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit + 1)
      .populate("reporterId", "_id username displayName avatarUrl")
      .populate("resolvedBy", "_id username displayName avatarUrl")
      .populate("hiddenBy", "_id username displayName avatarUrl")
      .populate({
        path: "conversationId",
        select: "_id group",
        populate: {
          path: "group.createdBy",
          select: "_id username displayName avatarUrl",
        },
      })
      .lean();

    let nextCursor = null;
    if (reports.length > parsedLimit) {
      const nextItem = reports[reports.length - 1];
      nextCursor = nextItem?.createdAt?.toISOString?.() || null;
      reports = reports.slice(0, parsedLimit);
    }

    return res.status(200).json({ reports, nextCursor });
  } catch (error) {
    console.error("Lỗi khi lấy báo cáo nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const resolveGroupReport = async (req, res) => {
  try {
    const actorId = req.user?._id?.toString();
    const { reportId } = req.params;
    const { resolved = true } = req.body || {};
    const nextResolved = !!resolved;

    const report = await GroupReport.findByIdAndUpdate(
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
      .populate("resolvedBy", "_id username displayName avatarUrl")
      .populate("hiddenBy", "_id username displayName avatarUrl")
      .populate({
        path: "conversationId",
        select: "_id group",
        populate: {
          path: "group.createdBy",
          select: "_id username displayName avatarUrl",
        },
      })
      .lean();

    if (!report) {
      return res.status(404).json({ message: "Không tìm thấy báo cáo nhóm" });
    }

    return res.status(200).json({
      message: nextResolved ? "Đã đánh dấu xử lý báo cáo" : "Đã bỏ trạng thái xử lý",
      report,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật xử lý báo cáo nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const hideGroupReport = async (req, res) => {
  try {
    const actorId = req.user?._id?.toString();
    const { reportId } = req.params;
    const { hidden = true } = req.body || {};
    const nextHidden = !!hidden;

    const report = await GroupReport.findByIdAndUpdate(
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
      .populate("resolvedBy", "_id username displayName avatarUrl")
      .populate("hiddenBy", "_id username displayName avatarUrl")
      .populate({
        path: "conversationId",
        select: "_id group",
        populate: {
          path: "group.createdBy",
          select: "_id username displayName avatarUrl",
        },
      })
      .lean();

    if (!report) {
      return res.status(404).json({ message: "Không tìm thấy báo cáo nhóm" });
    }

    return res.status(200).json({
      message: nextHidden ? "Đã ẩn báo cáo khỏi danh sách" : "Đã hiển thị lại báo cáo",
      report,
    });
  } catch (error) {
    console.error("Lỗi khi ẩn báo cáo nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const addGroupMembers = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { memberIds } = req.body;
    const userId = req.user._id.toString();

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ message: "Danh sách thành viên không hợp lệ" });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    if (conversation.type !== "group") {
      return res
        .status(400)
        .json({ message: "Chỉ nhóm chat mới có thể thêm thành viên" });
    }

    const isMember = conversation.participants.some(
      (p) => p.userId.toString() === userId,
    );

    if (!isMember) {
      return res.status(403).json({ message: "Bạn không ở trong group này." });
    }

    const existingMemberIds = new Set(
      conversation.participants.map((p) => p.userId.toString()),
    );

    const normalizedMemberIds = [...new Set(memberIds.map((id) => id.toString()))];
    const membersToAdd = normalizedMemberIds.filter(
      (id) => !existingMemberIds.has(id),
    );

    if (membersToAdd.length === 0) {
      return res
        .status(200)
        .json({ message: "Không có thành viên mới để thêm", conversation });
    }

    membersToAdd.forEach((id) => {
      conversation.participants.push({ userId: id, joinedAt: new Date() });
      conversation.unreadCounts.set(id, 0);
    });

    await conversation.save();

    await conversation.populate([
      { path: "participants.userId", select: "displayName avatarUrl" },
      { path: "seenBy", select: "displayName avatarUrl" },
      { path: "lastMessage.senderId", select: "displayName avatarUrl" },
    ]);

    const participants = (conversation.participants || []).map((p) => ({
      _id: p.userId?._id,
      displayName: p.userId?.displayName,
      avatarUrl: p.userId?.avatarUrl ?? null,
      joinedAt: p.joinedAt,
    }));
    const nickname = getGroupNickname(conversation.nicknames, userId);

    const formatted = {
      ...conversation.toObject(),
      participants,
      unreadCounts: conversation.unreadCounts || {},
      nickname,
    };

    // added users receive new group in sidebar
    membersToAdd.forEach((memberId) => {
      io.to(memberId).emit("new-group", formatted);
    });

    // existing members update participant list/count in real-time
    io.to(conversationId).emit("group-updated", formatted);

    return res.status(200).json({
      message: "Thêm thành viên vào nhóm thành công",
      conversation: formatted,
    });
  } catch (error) {
    console.error("Lỗi khi thêm thành viên vào nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateGroupAvatar = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "Vui lòng chọn ảnh" });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Chỉ nhóm chat mới có avatar nhóm" });
    }

    const createdBy = conversation.group?.createdBy?.toString();
    if (!createdBy || createdBy !== userId) {
      return res
        .status(403)
        .json({ message: "Chỉ chủ phòng mới có quyền đổi avatar nhóm" });
    }

    const oldAvatarId = conversation.group?.avatarId || null;

    const result = await uploadImageFromBuffer(file.buffer, {
      folder: "hichat/group-avatars",
      transformation: [{ width: 300, height: 300, crop: "fill" }],
    });

    conversation.group.avatarUrl = result.secure_url;
    conversation.group.avatarId = result.public_id;
    await conversation.save();

    await conversation.populate([
      { path: "participants.userId", select: "displayName avatarUrl" },
      { path: "seenBy", select: "displayName avatarUrl" },
      { path: "lastMessage.senderId", select: "displayName avatarUrl" },
    ]);

    const participants = (conversation.participants || []).map((p) => ({
      _id: p.userId?._id,
      displayName: p.userId?.displayName,
      avatarUrl: p.userId?.avatarUrl ?? null,
      joinedAt: p.joinedAt,
    }));
    const nickname = getGroupNickname(conversation.nicknames, userId);

    const formatted = {
      ...conversation.toObject(),
      participants,
      unreadCounts: conversation.unreadCounts || {},
      nickname,
    };

    io.to(conversationId).emit("group-updated", formatted);

    if (oldAvatarId) {
      cloudinary.uploader.destroy(oldAvatarId).catch((error) => {
        console.error("Lỗi khi xóa avatar nhóm cũ", error);
      });
    }

    return res.status(200).json({
      message: "Cập nhật avatar nhóm thành công",
      conversation: formatted,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật avatar nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateGroupName = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { name } = req.body || {};
    const userId = req.user._id.toString();

    const cleanedName = typeof name === "string" ? name.trim() : "";
    if (!cleanedName) {
      return res.status(400).json({ message: "Vui lòng nhập tên nhóm" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }
    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Chỉ nhóm chat mới đổi tên được" });
    }

    const createdBy = conversation.group?.createdBy?.toString();
    if (!createdBy || createdBy !== userId) {
      return res.status(403).json({ message: "Chỉ chủ nhóm mới có quyền đổi tên" });
    }

    conversation.group.name = cleanedName;
    await conversation.save();

    await conversation.populate([
      { path: "participants.userId", select: "displayName avatarUrl" },
      { path: "seenBy", select: "displayName avatarUrl" },
      { path: "lastMessage.senderId", select: "displayName avatarUrl" },
    ]);

    const participants = (conversation.participants || []).map((p) => ({
      _id: p.userId?._id,
      displayName: p.userId?.displayName,
      avatarUrl: p.userId?.avatarUrl ?? null,
      joinedAt: p.joinedAt,
    }));
    const nickname = getGroupNickname(conversation.nicknames, userId);

    const formatted = {
      ...conversation.toObject(),
      participants,
      unreadCounts: conversation.unreadCounts || {},
      nickname,
    };

    io.to(conversationId).emit("group-updated", formatted);

    return res.status(200).json({
      message: "Đã cập nhật tên nhóm",
      conversation: formatted,
    });
  } catch (error) {
    console.error("Lỗi khi đổi tên nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const leaveGroup = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }
    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Chỉ nhóm chat mới rời nhóm được" });
    }

    const isMember = conversation.participants.some(
      (p) => p.userId.toString() === userId,
    );
    if (!isMember) {
      return res.status(403).json({ message: "Bạn không ở trong nhóm này" });
    }

    conversation.participants = conversation.participants.filter(
      (p) => p.userId.toString() !== userId,
    );
    conversation.seenBy = (conversation.seenBy || []).filter(
      (id) => id.toString() !== userId,
    );

    const mapFields = ["unreadCounts", "mutedBy", "readReceiptBy", "archivedBy", "e2eeEnabledBy"];
    mapFields.forEach((field) => {
      const map = conversation[field];
      if (map instanceof Map) {
        map.delete(userId);
      } else if (map && typeof map === "object") {
        delete map[userId];
      }
      conversation[field] = map;
    });

    if (conversation.participants.length === 0) {
      await Message.deleteMany({ conversationId });
      await Conversation.deleteOne({ _id: conversationId });
      return res.status(200).json({
        message: "Đã rời nhóm",
        removedConversationId: conversationId,
      });
    }

    if (conversation.group?.createdBy?.toString() === userId) {
      conversation.group.createdBy = conversation.participants[0]?.userId ?? null;
    }

    await conversation.save();

    await conversation.populate([
      { path: "participants.userId", select: "displayName avatarUrl" },
      { path: "seenBy", select: "displayName avatarUrl" },
      { path: "lastMessage.senderId", select: "displayName avatarUrl" },
    ]);

    const participants = (conversation.participants || []).map((p) => ({
      _id: p.userId?._id,
      displayName: p.userId?.displayName,
      avatarUrl: p.userId?.avatarUrl ?? null,
      joinedAt: p.joinedAt,
    }));

    const formatted = {
      ...conversation.toObject(),
      participants,
      unreadCounts: conversation.unreadCounts || {},
    };

    io.to(conversationId).emit("group-updated", formatted);

    return res.status(200).json({
      message: "Đã rời nhóm",
      conversation: formatted,
      removedConversationId: conversationId,
    });
  } catch (error) {
    console.error("Lỗi khi rời nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
