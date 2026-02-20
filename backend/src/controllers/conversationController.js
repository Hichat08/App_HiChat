import Conversation from "../models/Conversation.js";
import Friend from "../models/Friend.js";
import FriendRequest from "../models/FriendRequest.js";
import Message from "../models/Message.js";
import UserBlock from "../models/UserBlock.js";
import UserRestriction from "../models/UserRestriction.js";
import { io } from "../socket/index.js";
import { uploadImageFromBuffer } from "../middlewares/uploadMiddleware.js";
import { v2 as cloudinary } from "cloudinary";
import {
  getVietnamDayEndISO,
  getVietnamYesterdayKey,
  reconcileMissLevel,
  toVietnamDateKey,
} from "../utils/streakDateHelper.js";

export const createConversation = async (req, res) => {
  try {
    const { type, name, memberIds } = req.body;
    const userId = req.user._id;

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

      conversation = await Conversation.findOne({
        type: "direct",
        "participants.userId": { $all: [userId, participantId] },
      });

      const userA = senderIdText < participantIdText ? senderIdText : participantIdText;
      const userB = senderIdText < participantIdText ? participantIdText : senderIdText;
      const areFriends = !!(await Friend.findOne({ userA, userB }).lean());

      if (!conversation) {
        conversation = new Conversation({
          type: "direct",
          participants: [{ userId }, { userId: participantId }],
          lastMessageAt: new Date(),
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
                requesterId: userId,
                responderId: participantId,
                requesterMessageCount: 0,
                respondedAt: null,
                respondedBy: null,
              },
        });

        await conversation.save();
      } else if (areFriends && conversation.directRequest?.status !== "accepted") {
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
      { path: "participants.userId", select: "displayName avatarUrl" },
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
    }));

    const formatted = { ...conversation.toObject(), participants };

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
        select: "displayName avatarUrl",
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

    const blockedByMeSet = new Set();
    const blockedByOtherSet = new Set();
    const restrictedByMeSet = new Set();
    const restrictedByOtherSet = new Set();

    if (uniqueDirectPartnerIds.length > 0) {
      const [blockRows, restrictionRows] = await Promise.all([
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
    }

    const formatted = conversations.map((convo) => {
      const participants = (convo.participants || []).map((p) => ({
        _id: p.userId?._id,
        displayName: p.userId?.displayName,
        avatarUrl: p.userId?.avatarUrl ?? null,
        joinedAt: p.joinedAt,
      }));

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
        effectiveLastCounted === today ||
        effectiveLastCounted === yesterday
          ? effectiveCount
          : 0;

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
      } else if (convo.type === "direct" && reconciled.streakLost) {
        streakLost = true;
      }

      const otherParticipantId =
        convo.type === "direct"
          ? participants.find((p) => p._id?.toString() !== userIdText)?._id?.toString() ?? null
          : null;

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

    const unseenMessages = await Message.find({
      conversationId,
      senderId: { $ne: userId },
      seenAt: null,
    })
      .select("_id")
      .lean();

    const seenMessageIds = unseenMessages.map((m) => m._id.toString());

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

    const updated = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $addToSet: { seenBy: userId },
        $set: { [`unreadCounts.${userId}`]: 0 },
      },
      {
        new: true,
      },
    );

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

    const formatted = {
      ...conversation.toObject(),
      participants,
      unreadCounts: conversation.unreadCounts || {},
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

    const formatted = {
      ...conversation.toObject(),
      participants,
      unreadCounts: conversation.unreadCounts || {},
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

    const formatted = {
      ...conversation.toObject(),
      participants,
      unreadCounts: conversation.unreadCounts || {},
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
