import Friend from "../models/Friend.js";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import Conversation from "../models/Conversation.js";
import UserBlock from "../models/UserBlock.js";
import { io } from "../socket/index.js";

export const sendFriendRequest = async (req, res) => {
  try {
    const { to, message } = req.body;

    const from = req.user._id;

    if (from.toString() === to?.toString()) {
      return res
        .status(400)
        .json({ message: "Không thể gửi lời mời kết bạn cho chính mình" });
    }

    const userExists = await User.exists({ _id: to });

    if (!userExists) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    let userA = from.toString();
    let userB = to.toString();

    if (userA > userB) {
      [userA, userB] = [userB, userA];
    }

    const blocked = await UserBlock.findOne({
      $or: [
        { blockerId: from, blockedId: to },
        { blockerId: to, blockedId: from },
      ],
    }).lean();

    if (blocked) {
      return res.status(403).json({
        message: "Không thể gửi kết bạn vì có quan hệ chặn giữa hai người dùng",
      });
    }

    const [alreadyFriends, existingRequest] = await Promise.all([
      Friend.findOne({ userA, userB }),
      FriendRequest.findOne({
        $or: [
          { from, to },
          { from: to, to: from },
        ],
      }),
    ]);

    if (alreadyFriends) {
      return res.status(400).json({ message: "Hai người đã là bạn bè" });
    }

    if (existingRequest) {
      return res
        .status(400)
        .json({ message: "Đã có lời mời kết bạn đang chờ" });
    }

    const request = await FriendRequest.create({
      from,
      to,
      message,
    });

    io.to(to.toString()).emit("friend-request:new", {
      requestId: request._id,
      from: {
        _id: req.user._id,
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl ?? null,
      },
      message: request.message ?? "",
      createdAt: request.createdAt,
    });

    return res
      .status(201)
      .json({ message: "Gửi lời mời kết bạn thành công", request });
  } catch (error) {
    console.error("Lỗi khi gửi yêu cầu kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const acceptFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const request = await FriendRequest.findById(requestId);

    if (!request) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy lời mời kết bạn" });
    }

    if (request.to.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền chấp nhận lời mời này" });
    }

    const friend = await Friend.create({
      userA: request.from,
      userB: request.to,
    });

    await FriendRequest.findByIdAndDelete(requestId);

    io.to(request.from.toString()).emit("friend-request:accepted", {
      requestId,
      by: {
        _id: req.user._id,
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl ?? null,
      },
    });

    const from = await User.findById(request.from)
      .select("_id displayName avatarUrl")
      .lean();

    return res.status(200).json({
      message: "Chấp nhận lời mời kết bạn thành công",
      newFriend: {
        _id: from?._id,
        displayName: from?.displayName,
        avatarUrl: from?.avatarUrl,
      },
    });
  } catch (error) {
    console.error("Lỗi khi chấp nhận lời mời kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const declineFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const request = await FriendRequest.findById(requestId);

    if (!request) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy lời mời kết bạn" });
    }

    if (request.to.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền từ chối lời mời này" });
    }

    await FriendRequest.findByIdAndDelete(requestId);

    io.to(request.from.toString()).emit("friend-request:declined", {
      requestId,
      by: {
        _id: req.user._id,
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl ?? null,
      },
    });

    return res.sendStatus(204);
  } catch (error) {
    console.error("Lỗi khi từ chối lời mời kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getAllFriends = async (req, res) => {
  try {
    const userId = req.user._id;

    const friendships = await Friend.find({
      $or: [
        {
          userA: userId,
        },
        {
          userB: userId,
        },
      ],
    })
      .populate("userA", "_id displayName avatarUrl username")
      .populate("userB", "_id displayName avatarUrl username")
      .lean();

    if (!friendships.length) {
      return res.status(200).json({ friends: [] });
    }

    const friends = friendships.map((f) =>
      f.userA._id.toString() === userId.toString() ? f.userB : f.userA,
    );

    return res.status(200).json({ friends });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách bạn bè", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const removeFriend = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { friendId } = req.params;

    if (!friendId) {
      return res.status(400).json({ message: "Thiếu friendId" });
    }

    if (userId === friendId.toString()) {
      return res.status(400).json({ message: "Không thể hủy kết bạn với chính mình" });
    }

    const [userA, userB] =
      userId < friendId.toString()
        ? [userId, friendId.toString()]
        : [friendId.toString(), userId];

    const deleted = await Friend.findOneAndDelete({ userA, userB });

    if (!deleted) {
      return res.status(404).json({ message: "Hai người chưa là bạn bè" });
    }

    return res.status(200).json({ message: "Đã hủy kết bạn" });
  } catch (error) {
    console.error("Lỗi khi hủy kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getFriendRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const populateFields = "_id username displayName avatarUrl";

    const [sent, received] = await Promise.all([
      FriendRequest.find({ from: userId }).populate("to", populateFields),
      FriendRequest.find({ to: userId }).populate("from", populateFields),
    ]);

    res.status(200).json({ sent, received });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách yêu cầu kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getFriendSuggestions = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const limit = 20;

    // 1) Direct friends
    const friendships = await Friend.find({
      $or: [{ userA: userId }, { userB: userId }],
    }).lean();

    const friendIds = friendships.map((f) =>
      f.userA.toString() === userId ? f.userB.toString() : f.userA.toString(),
    );

    // 2) Pending friend requests (2 directions)
    const requests = await FriendRequest.find({
      $or: [{ from: userId }, { to: userId }],
    }).lean();

    const pendingIds = new Set(
      requests.map((r) =>
        r.from.toString() === userId ? r.to.toString() : r.from.toString(),
      ),
    );

    const blockedPairs = await UserBlock.find({
      $or: [{ blockerId: userId }, { blockedId: userId }],
    })
      .select("blockerId blockedId")
      .lean();

    const blockedIds = new Set(
      blockedPairs.map((b) =>
        b.blockerId.toString() === userId
          ? b.blockedId.toString()
          : b.blockerId.toString(),
      ),
    );

    const excludedIds = new Set([
      userId,
      ...friendIds,
      ...Array.from(pendingIds),
      ...Array.from(blockedIds),
    ]);

    // 3) Friends-of-friends signal: count mutual direct connections
    const mutualCountMap = new Map();
    if (friendIds.length > 0) {
      const fof = await Friend.find({
        $or: [{ userA: { $in: friendIds } }, { userB: { $in: friendIds } }],
      }).lean();

      fof.forEach((f) => {
        const a = f.userA.toString();
        const b = f.userB.toString();
        const candidate = friendIds.includes(a) ? b : a;

        if (!candidate || excludedIds.has(candidate)) return;
        mutualCountMap.set(candidate, (mutualCountMap.get(candidate) || 0) + 1);
      });
    }

    // 4) Common groups signal: count number of groups both users are in
    const commonGroupsMap = new Map();
    const groups = await Conversation.find({
      type: "group",
      "participants.userId": userId,
    })
      .select("participants.userId")
      .lean();

    groups.forEach((g) => {
      g.participants.forEach((p) => {
        const pid = p.userId.toString();
        if (excludedIds.has(pid)) return;
        commonGroupsMap.set(pid, (commonGroupsMap.get(pid) || 0) + 1);
      });
    });

    // 5) Merge candidates from both signals
    const candidateIds = new Set([
      ...Array.from(mutualCountMap.keys()),
      ...Array.from(commonGroupsMap.keys()),
    ]);

    // Fallback: if too few candidates, fill with random active users not excluded
    if (candidateIds.size < limit) {
      const fallbackUsers = await User.find({
        _id: { $nin: Array.from(excludedIds) },
      })
        .select("_id")
        .sort({ updatedAt: -1 })
        .limit(limit * 3)
        .lean();

      fallbackUsers.forEach((u) => candidateIds.add(u._id.toString()));
    }

    // 6) Fetch profile data for shortlisted candidates
    const shortlistedIds = Array.from(candidateIds).slice(0, limit * 3);
    const users = await User.find({ _id: { $in: shortlistedIds } })
      .select("_id displayName username avatarUrl")
      .lean();

    // 7) Score and rank
    const usersWithSignals = users
      .map((u) => {
        const uid = u._id.toString();
        const mutual = mutualCountMap.get(uid) || 0;
        const commonGroups = commonGroupsMap.get(uid) || 0;
        const score = mutual * 3 + commonGroups * 2;
        return {
          _id: u._id,
          displayName: u.displayName,
          username: u.username,
          avatarUrl: u.avatarUrl || null,
          mutualCount: mutual,
          commonGroupsCount: commonGroups,
          score,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (a.displayName || "").localeCompare(b.displayName || "");
      })
      .slice(0, limit);

    return res.status(200).json({ suggestions: usersWithSignals });
  } catch (error) {
    console.error("Lỗi khi lấy gợi ý bạn bè", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
