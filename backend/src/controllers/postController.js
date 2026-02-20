import Post from "../models/Post.js";
import Friend from "../models/Friend.js";
import PostComment from "../models/PostComment.js";
import { uploadMediaFromBuffer } from "../middlewares/uploadMiddleware.js";
import { io } from "../socket/index.js";

const POST_VISIBILITY = {
  PUBLIC: "public",
  CUSTOM: "custom",
  ONLY_ME: "only_me",
};

const REACTION_TYPES = ["like", "love", "care", "haha", "wow", "sad", "angry"];

const normalizeViewerIds = (value) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => id?.toString()).filter(Boolean))];
};

const normalizeAllowedViewerPayload = (value) => {
  if (Array.isArray(value)) return normalizeViewerIds(value);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeViewerIds(parsed);
    } catch (error) {
      return normalizeViewerIds(value.split(","));
    }
  }
  return [];
};

const getFriendIdSet = async (userId) => {
  const id = userId.toString();
  const friendships = await Friend.find({
    $or: [{ userA: id }, { userB: id }],
  })
    .select("userA userB")
    .lean();

  const friendIds = new Set();
  friendships.forEach((f) => {
    const a = f.userA.toString();
    const b = f.userB.toString();
    friendIds.add(a === id ? b : a);
  });
  return friendIds;
};

const canViewerAccessPost = (post, viewerId) => {
  const visibility = post.visibility;
  const viewer = viewerId.toString();
  const author = post.authorId?._id?.toString?.() ?? post.authorId?.toString?.();

  if (author === viewer) return true;
  if (visibility === POST_VISIBILITY.PUBLIC) return true;
  if (visibility === POST_VISIBILITY.ONLY_ME) return false;

  const allowed = (post.allowedViewerIds || []).map((id) => id.toString());
  return allowed.includes(viewer);
};

const formatPost = (post, viewerId) => {
  const authorObj = post.authorId || {};
  const authorId = authorObj._id?.toString?.() ?? post.authorId?.toString?.();
  const isOwner = authorId === viewerId.toString();
  const normalizeReactions = () => {
    if (Array.isArray(post.reactions) && post.reactions.length > 0) {
      return post.reactions
        .filter((item) => item?.userId && REACTION_TYPES.includes(item?.type))
        .map((item) => ({
          userId: item.userId.toString(),
          type: item.type,
        }));
    }

    return (post.likedBy || []).map((id) => ({ userId: id.toString(), type: "like" }));
  };

  const reactions = normalizeReactions();
  const myReaction = reactions.find((item) => item.userId === viewerId.toString())?.type ?? null;
  const reactionCounts = reactions.reduce(
    (acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    },
    {
      like: 0,
      love: 0,
      care: 0,
      haha: 0,
      wow: 0,
      sad: 0,
      angry: 0,
    },
  );

  return {
    _id: post._id,
    content: post.content,
    media: (post.media || []).map((item) => ({
      url: item.url,
      type: item.type,
    })),
    visibility: post.visibility,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    author: {
      _id: authorObj._id,
      displayName: authorObj.displayName,
      username: authorObj.username,
      avatarUrl: authorObj.avatarUrl ?? null,
    },
    likeCount: reactions.length,
    shareCount: typeof post.shareCount === "number" ? post.shareCount : 0,
    isLiked: !!myReaction,
    myReaction,
    reactionCounts,
    commentCount: typeof post.commentCount === "number" ? post.commentCount : 0,
    sharedPost: post.sharedPostId
      ? (() => {
          const shared = post.sharedPostId;
          const sharedAuthor = shared.authorId || {};
          const sharedAuthorId =
            sharedAuthor._id?.toString?.() ?? shared.authorId?.toString?.();

          return {
            _id: shared._id,
            content: shared.content || "",
            media: (shared.media || []).map((item) => ({
              url: item.url,
              type: item.type,
            })),
            visibility: shared.visibility,
            createdAt: shared.createdAt,
            updatedAt: shared.updatedAt,
            author: {
              _id: sharedAuthor._id,
              displayName: sharedAuthor.displayName,
              username: sharedAuthor.username,
              avatarUrl: sharedAuthor.avatarUrl ?? null,
            },
            isUnavailable:
              !sharedAuthorId || !canViewerAccessPost(shared, viewerId),
          };
        })()
      : null,
    ...(isOwner ? { allowedViewerIds: post.allowedViewerIds || [] } : {}),
  };
};

const buildCommentPayload = (comment) => {
  const author = comment.authorId || {};
  return {
    _id: comment._id,
    postId: comment.postId,
    content: comment.content,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: {
      _id: author._id,
      displayName: author.displayName,
      username: author.username,
      avatarUrl: author.avatarUrl ?? null,
    },
  };
};

const emitPostActivityToAuthor = ({
  postAuthorId,
  actor,
  type,
  postId,
  content,
  reactionType,
}) => {
  if (!postAuthorId || !actor?._id || !postId || !type) return;
  if (postAuthorId.toString() === actor._id.toString()) return;

  io.to(postAuthorId.toString()).emit("post-activity", {
    id: `post-${type}-${postId}-${Date.now()}`,
    type,
    postId,
    actor: {
      _id: actor._id,
      displayName: actor.displayName,
      avatarUrl: actor.avatarUrl ?? null,
    },
    content: content || "",
    reactionType: reactionType || null,
    createdAt: new Date().toISOString(),
  });
};

export const createPost = async (req, res) => {
  try {
    const authorId = req.user._id;
    const { content, visibility, allowedViewerIds } = req.body || {};
    const files = req.files || [];

    const trimmedContent = content?.toString().trim();
    if (!trimmedContent) {
      return res.status(400).json({
        message: "Văn bản trống rỗng",
      });
    }

    if (trimmedContent && trimmedContent.length > 5000) {
      return res.status(400).json({ message: "Nội dung bài viết không được vượt quá 5000 ký tự" });
    }

    const normalizedVisibility =
      visibility?.toString() || POST_VISIBILITY.PUBLIC;

    if (!Object.values(POST_VISIBILITY).includes(normalizedVisibility)) {
      return res.status(400).json({ message: "Quyền riêng tư không hợp lệ" });
    }

    let normalizedAllowedViewerIds = [];
    if (normalizedVisibility === POST_VISIBILITY.CUSTOM) {
      normalizedAllowedViewerIds = normalizeAllowedViewerPayload(allowedViewerIds).filter(
        (id) => id !== authorId.toString()
      );

      if (!normalizedAllowedViewerIds.length) {
        return res.status(400).json({
          message: "Bài viết chế độ riêng tư cần chọn ít nhất 1 người được xem",
        });
      }

      const friendIdSet = await getFriendIdSet(authorId);
      const invalidViewerIds = normalizedAllowedViewerIds.filter(
        (id) => !friendIdSet.has(id)
      );

      if (invalidViewerIds.length > 0) {
        return res.status(403).json({
          message: "Chỉ có thể chia sẻ riêng tư cho bạn bè",
          invalidViewerIds,
        });
      }
    }

    let uploadedMedia = [];
    if (files.length) {
      try {
        uploadedMedia = await Promise.all(
          files.map(async (file) => {
            const result = await uploadMediaFromBuffer(file.buffer, file.mimetype);
            return {
              url: result.secure_url,
              type: file.mimetype.startsWith("video/") ? "video" : "image",
            };
          })
        );
      } catch (error) {
        console.error("Lỗi upload media bài viết", error);
        return res.status(400).json({
          message:
            error?.message ||
            "Không thể upload ảnh/video. Vui lòng kiểm tra định dạng file hoặc cấu hình Cloudinary.",
        });
      }
    }

    const post = await Post.create({
      authorId,
      content: trimmedContent || "",
      media: uploadedMedia,
      visibility: normalizedVisibility,
      allowedViewerIds:
        normalizedVisibility === POST_VISIBILITY.CUSTOM
          ? normalizedAllowedViewerIds
          : [],
    });

    await post.populate({
      path: "authorId",
      select: "_id displayName username avatarUrl",
    });

    return res.status(201).json({
      message: "Đăng bài thành công",
      post: formatPost(post, authorId),
    });
  } catch (error) {
    console.error("Lỗi khi tạo bài viết", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updatePost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;
    const { content, visibility, allowedViewerIds } = req.body || {};
    const files = req.files || [];

    const post = await Post.findById(postId).populate({
      path: "authorId",
      select: "_id displayName username avatarUrl",
    });

    if (!post) {
      return res.status(404).json({ message: "Không tìm thấy bài viết" });
    }

    const postAuthorId = post.authorId?._id?.toString?.() ?? post.authorId?.toString?.();
    if (!postAuthorId || postAuthorId !== userId.toString()) {
      return res.status(403).json({ message: "Bạn không có quyền sửa bài viết này" });
    }

    const normalizedVisibility =
      visibility?.toString() || post.visibility || POST_VISIBILITY.PUBLIC;

    if (!Object.values(POST_VISIBILITY).includes(normalizedVisibility)) {
      return res.status(400).json({ message: "Quyền riêng tư không hợp lệ" });
    }

    const hasRequestedContent = typeof content !== "undefined";
    const trimmedContent = hasRequestedContent
      ? content?.toString?.().trim?.() || ""
      : post.content || "";

    if (trimmedContent.length > 5000) {
      return res.status(400).json({ message: "Nội dung bài viết không được vượt quá 5000 ký tự" });
    }

    let keepMediaUrlsPayload = req.body?.keepMediaUrls;
    if (typeof keepMediaUrlsPayload === "string") {
      try {
        keepMediaUrlsPayload = JSON.parse(keepMediaUrlsPayload);
      } catch {
        keepMediaUrlsPayload = keepMediaUrlsPayload
          .split(",")
          .map((item) => item?.toString?.().trim?.())
          .filter(Boolean);
      }
    }

    const hasKeepMediaUrlsPayload = typeof req.body?.keepMediaUrls !== "undefined";
    const existingMedia = Array.isArray(post.media) ? post.media : [];
    const keepMediaUrlSet = hasKeepMediaUrlsPayload
      ? new Set(
          Array.isArray(keepMediaUrlsPayload)
            ? keepMediaUrlsPayload.map((item) => item?.toString?.()).filter(Boolean)
            : [],
        )
      : null;
    const keptExistingMedia = keepMediaUrlSet
      ? existingMedia.filter((item) => keepMediaUrlSet.has(item.url))
      : existingMedia;

    let uploadedMedia = [];
    if (files.length) {
      try {
        uploadedMedia = await Promise.all(
          files.map(async (file) => {
            const result = await uploadMediaFromBuffer(file.buffer, file.mimetype);
            return {
              url: result.secure_url,
              type: file.mimetype.startsWith("video/") ? "video" : "image",
            };
          }),
        );
      } catch (error) {
        console.error("Lỗi upload media khi sửa bài viết", error);
        return res.status(400).json({
          message:
            error?.message ||
            "Không thể upload ảnh/video. Vui lòng kiểm tra định dạng file hoặc cấu hình Cloudinary.",
        });
      }
    }

    const nextMedia = [...keptExistingMedia, ...uploadedMedia];
    const hasMedia = nextMedia.length > 0;
    if (!trimmedContent && !hasMedia) {
      return res.status(400).json({ message: "Văn bản trống rỗng" });
    }

    let normalizedAllowedViewerIds = [];
    if (normalizedVisibility === POST_VISIBILITY.CUSTOM) {
      const isPayloadProvided = typeof allowedViewerIds !== "undefined";
      const currentAllowedViewerIds = normalizeViewerIds(post.allowedViewerIds || []);
      const candidateAllowedViewerIds = isPayloadProvided
        ? normalizeAllowedViewerPayload(allowedViewerIds)
        : currentAllowedViewerIds;

      normalizedAllowedViewerIds = candidateAllowedViewerIds.filter(
        (id) => id !== userId.toString()
      );

      if (!normalizedAllowedViewerIds.length) {
        return res.status(400).json({
          message: "Bài viết chế độ riêng tư cần chọn ít nhất 1 người được xem",
        });
      }

      const friendIdSet = await getFriendIdSet(userId);
      const invalidViewerIds = normalizedAllowedViewerIds.filter(
        (id) => !friendIdSet.has(id)
      );

      if (invalidViewerIds.length > 0) {
        return res.status(403).json({
          message: "Chỉ có thể chia sẻ riêng tư cho bạn bè",
          invalidViewerIds,
        });
      }
    }

    post.content = trimmedContent;
    post.visibility = normalizedVisibility;
    post.allowedViewerIds =
      normalizedVisibility === POST_VISIBILITY.CUSTOM ? normalizedAllowedViewerIds : [];
    post.media = nextMedia;

    await post.save();

    const commentCount = await PostComment.countDocuments({ postId: post._id });
    const shareCount = await Post.countDocuments({ sharedPostId: post._id });

    return res.status(200).json({
      message: "Cập nhật bài viết thành công",
      post: formatPost(
        { ...post.toObject(), commentCount, shareCount },
        userId,
      ),
    });
  } catch (error) {
    console.error("Lỗi khi sửa bài viết", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getPostFeed = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { cursor, limit = 20 } = req.query;
    const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

    const query = {
      $or: [
        { authorId: userId },
        { visibility: POST_VISIBILITY.PUBLIC },
        {
          visibility: POST_VISIBILITY.CUSTOM,
          allowedViewerIds: req.user._id,
        },
      ],
    };

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit + 1)
      .populate({
        path: "authorId",
        select: "_id displayName username avatarUrl",
      })
      .populate({
        path: "sharedPostId",
        populate: {
          path: "authorId",
          select: "_id displayName username avatarUrl visibility allowedViewerIds",
        },
      });

    const postIds = posts.map((p) => p._id);
    const commentCountDocs = postIds.length
      ? await PostComment.aggregate([
          { $match: { postId: { $in: postIds } } },
          { $group: { _id: "$postId", count: { $sum: 1 } } },
        ])
      : [];
    const commentCountMap = new Map(
      commentCountDocs.map((item) => [item._id.toString(), item.count]),
    );
    const shareCountDocs = postIds.length
      ? await Post.aggregate([
          { $match: { sharedPostId: { $in: postIds } } },
          { $group: { _id: "$sharedPostId", count: { $sum: 1 } } },
        ])
      : [];
    const shareCountMap = new Map(
      shareCountDocs.map((item) => [item._id.toString(), item.count]),
    );

    let nextCursor = null;
    if (posts.length > parsedLimit) {
      const overflow = posts.pop();
      nextCursor = overflow?.createdAt?.toISOString?.() ?? null;
    }

    return res.status(200).json({
      posts: posts.map((post) =>
        formatPost(
          {
            ...post.toObject(),
            commentCount: commentCountMap.get(post._id.toString()) || 0,
            shareCount: shareCountMap.get(post._id.toString()) || 0,
          },
          userId,
        ),
      ),
      nextCursor,
    });
  } catch (error) {
    console.error("Lỗi khi lấy bảng tin", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getPostComments = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;

    const post = await Post.findById(postId).populate({
      path: "authorId",
      select: "_id displayName username avatarUrl",
    });

    if (!post) {
      return res.status(404).json({ message: "Không tìm thấy bài viết" });
    }

    if (!canViewerAccessPost(post, userId)) {
      return res.status(403).json({ message: "Bạn không có quyền xem bình luận bài viết này" });
    }

    const comments = await PostComment.find({ postId })
      .sort({ createdAt: 1 })
      .populate({
        path: "authorId",
        select: "_id displayName username avatarUrl",
      });

    return res.status(200).json({
      comments: comments.map(buildCommentPayload),
    });
  } catch (error) {
    console.error("Lỗi khi lấy bình luận bài viết", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const addPostComment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;
    const content = req.body?.content?.toString?.().trim?.() || "";

    if (!content) {
      return res.status(400).json({ message: "Nội dung bình luận trống" });
    }

    if (content.length > 1000) {
      return res.status(400).json({ message: "Bình luận không được vượt quá 1000 ký tự" });
    }

    const post = await Post.findById(postId).populate({
      path: "authorId",
      select: "_id displayName username avatarUrl",
    });

    if (!post) {
      return res.status(404).json({ message: "Không tìm thấy bài viết" });
    }

    if (!canViewerAccessPost(post, userId)) {
      return res.status(403).json({ message: "Bạn không có quyền bình luận bài viết này" });
    }

    const comment = await PostComment.create({
      postId,
      authorId: userId,
      content,
    });

    await comment.populate({
      path: "authorId",
      select: "_id displayName username avatarUrl",
    });

    const commentCount = await PostComment.countDocuments({ postId });

    emitPostActivityToAuthor({
      postAuthorId: post.authorId?._id ?? post.authorId,
      actor: req.user,
      type: "comment",
      postId,
      content,
    });

    return res.status(201).json({
      message: "Đã bình luận",
      comment: buildCommentPayload(comment),
      commentCount,
    });
  } catch (error) {
    console.error("Lỗi khi thêm bình luận", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const togglePostLike = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;
    const requestedReaction = req.body?.reactionType?.toString?.().trim?.() || null;
    const normalizedReaction = REACTION_TYPES.includes(requestedReaction)
      ? requestedReaction
      : null;

    const post = await Post.findById(postId).populate({
      path: "authorId",
      select: "_id displayName username avatarUrl",
    });

    if (!post) {
      return res.status(404).json({ message: "Không tìm thấy bài viết" });
    }

    if (!canViewerAccessPost(post, userId)) {
      return res.status(403).json({ message: "Bạn không có quyền tương tác bài viết này" });
    }

    const uid = userId.toString();
    const reactionEntries = Array.isArray(post.reactions)
      ? post.reactions.map((item) => ({
          userId: item.userId?.toString?.() ?? item.userId,
          type: item.type,
        }))
      : [];

    const existingReactionIndex = reactionEntries.findIndex((item) => item.userId === uid);
    const existingReactionType =
      existingReactionIndex >= 0 ? reactionEntries[existingReactionIndex]?.type : null;

    if (normalizedReaction) {
      if (existingReactionIndex >= 0) {
        reactionEntries[existingReactionIndex].type = normalizedReaction;
      } else {
        reactionEntries.push({ userId: uid, type: normalizedReaction });
      }
    } else if (existingReactionIndex >= 0) {
      reactionEntries.splice(existingReactionIndex, 1);
    } else {
      reactionEntries.push({ userId: uid, type: "like" });
    }

    post.reactions = reactionEntries.map((item) => ({
      userId: item.userId,
      type: item.type,
    }));
    post.likedBy = reactionEntries.map((item) => item.userId);

    await post.save();
    const commentCount = await PostComment.countDocuments({ postId });
    const shareCount = await Post.countDocuments({ sharedPostId: postId });

    const isNewReaction = existingReactionType === null;
    const isReactionChanged =
      !!normalizedReaction && existingReactionType !== null && existingReactionType !== normalizedReaction;

    if (isNewReaction || isReactionChanged) {
      emitPostActivityToAuthor({
        postAuthorId: post.authorId?._id ?? post.authorId,
        actor: req.user,
        type: "like",
        postId,
        reactionType: normalizedReaction || "like",
      });
    }

    return res.status(200).json({
      message:
        existingReactionType && !normalizedReaction
          ? "Đã bỏ cảm xúc"
          : "Đã thả cảm xúc cho bài viết",
      post: formatPost({ ...post.toObject(), commentCount, shareCount }, userId),
    });
  } catch (error) {
    console.error("Lỗi khi like bài viết", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const sharePost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;
    const { content = "", visibility, allowedViewerIds } = req.body || {};

    const original = await Post.findById(postId).populate({
      path: "authorId",
      select: "_id displayName username avatarUrl",
    });

    if (!original) {
      return res.status(404).json({ message: "Không tìm thấy bài viết để chia sẻ" });
    }

    if (!canViewerAccessPost(original, userId)) {
      return res.status(403).json({ message: "Bạn không có quyền chia sẻ bài viết này" });
    }

    const normalizedVisibility =
      visibility?.toString() || POST_VISIBILITY.PUBLIC;

    if (!Object.values(POST_VISIBILITY).includes(normalizedVisibility)) {
      return res.status(400).json({ message: "Quyền riêng tư không hợp lệ" });
    }

    let normalizedAllowedViewerIds = [];
    if (normalizedVisibility === POST_VISIBILITY.CUSTOM) {
      normalizedAllowedViewerIds = normalizeAllowedViewerPayload(allowedViewerIds).filter(
        (id) => id !== userId.toString()
      );

      if (!normalizedAllowedViewerIds.length) {
        return res.status(400).json({
          message: "Bài chia sẻ chế độ riêng tư cần chọn ít nhất 1 người được xem",
        });
      }

      const friendIdSet = await getFriendIdSet(userId);
      const invalidViewerIds = normalizedAllowedViewerIds.filter(
        (id) => !friendIdSet.has(id)
      );

      if (invalidViewerIds.length > 0) {
        return res.status(403).json({
          message: "Chỉ có thể chia sẻ riêng tư cho bạn bè",
          invalidViewerIds,
        });
      }
    }

    const trimmed = content.toString().trim();

    const sharedPost = await Post.create({
      authorId: userId,
      content: trimmed,
      media: [],
      visibility: normalizedVisibility,
      allowedViewerIds:
        normalizedVisibility === POST_VISIBILITY.CUSTOM
          ? normalizedAllowedViewerIds
          : [],
      sharedPostId: original._id,
    });

    await sharedPost.populate([
      { path: "authorId", select: "_id displayName username avatarUrl" },
      {
        path: "sharedPostId",
        populate: { path: "authorId", select: "_id displayName username avatarUrl" },
      },
    ]);
    const commentCount = await PostComment.countDocuments({ postId: sharedPost._id });
    const shareCount = await Post.countDocuments({ sharedPostId: sharedPost._id });

    emitPostActivityToAuthor({
      postAuthorId: original.authorId?._id ?? original.authorId,
      actor: req.user,
      type: "share",
      postId: original._id,
      content: trimmed,
    });

    return res.status(201).json({
      message: "Đã chia sẻ bài viết",
      post: formatPost(
        { ...sharedPost.toObject(), commentCount, shareCount },
        userId,
      ),
    });
  } catch (error) {
    console.error("Lỗi khi chia sẻ bài viết", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const deletePost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;

    const post = await Post.findById(postId).select("authorId");
    if (!post) {
      return res.status(404).json({ message: "Không tìm thấy bài viết" });
    }

    if (post.authorId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Bạn không có quyền xoá bài viết này" });
    }

    await Promise.all([
      PostComment.deleteMany({ postId }),
      Post.findByIdAndDelete(postId),
    ]);

    return res.status(200).json({ message: "Đã xoá bài viết" });
  } catch (error) {
    console.error("Lỗi khi xoá bài viết", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
