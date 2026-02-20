import api from "@/lib/axios";
import type { Post, PostComment, PostReactionType, PostVisibility } from "@/types/post";

interface FeedResponse {
  posts: Post[];
  nextCursor: string | null;
}

export const postService = {
  createPost: async (payload: {
    content: string;
    visibility: PostVisibility;
    allowedViewerIds?: string[];
    mediaFiles?: File[];
  }) => {
    const hasMedia = !!payload.mediaFiles?.length;

    const res = hasMedia
      ? await api.post("/posts", (() => {
          const formData = new FormData();
          formData.append("content", payload.content || "");
          formData.append("visibility", payload.visibility);
          formData.append(
            "allowedViewerIds",
            JSON.stringify(payload.allowedViewerIds || [])
          );
          payload.mediaFiles?.forEach((file) => formData.append("media", file));
          return formData;
        })(), {
          headers: { "Content-Type": "multipart/form-data" },
        })
      : await api.post("/posts", payload);
    return res.data.post as Post;
  },

  getFeed: async (cursor?: string, limit = 20) => {
    const res = await api.get<FeedResponse>("/posts/feed", {
      params: {
        ...(cursor ? { cursor } : {}),
        limit,
      },
    });
    return res.data;
  },

  toggleLike: async (postId: string, reactionType?: PostReactionType | null) => {
    const payload =
      typeof reactionType === "string" ? { reactionType } : {};
    const res = await api.post(`/posts/${postId}/like`, payload);
    return res.data.post as Post;
  },

  sharePost: async (
    postId: string,
    payload?: {
      content?: string;
      visibility?: PostVisibility;
      allowedViewerIds?: string[];
    }
  ) => {
    const res = await api.post(`/posts/${postId}/share`, payload ?? {});
    return res.data.post as Post;
  },

  updatePost: async (
    postId: string,
    payload: {
      content: string;
      visibility: PostVisibility;
      allowedViewerIds?: string[];
      keepMediaUrls?: string[];
      mediaFiles?: File[];
    }
  ) => {
    const hasMedia = !!payload.mediaFiles?.length;
    const shouldUseFormData =
      hasMedia || Array.isArray(payload.keepMediaUrls);

    const res = shouldUseFormData
      ? await api.patch(`/posts/${postId}`, (() => {
          const formData = new FormData();
          formData.append("content", payload.content || "");
          formData.append("visibility", payload.visibility);
          formData.append(
            "allowedViewerIds",
            JSON.stringify(payload.allowedViewerIds || []),
          );
          formData.append(
            "keepMediaUrls",
            JSON.stringify(payload.keepMediaUrls || []),
          );
          payload.mediaFiles?.forEach((file) => formData.append("media", file));
          return formData;
        })(), {
          headers: { "Content-Type": "multipart/form-data" },
        })
      : await api.patch(`/posts/${postId}`, payload);
    return res.data.post as Post;
  },

  deletePost: async (postId: string) => {
    await api.delete(`/posts/${postId}`);
  },

  getComments: async (postId: string) => {
    const res = await api.get(`/posts/${postId}/comments`);
    return (res.data?.comments || []) as PostComment[];
  },

  addComment: async (postId: string, content: string) => {
    const res = await api.post(`/posts/${postId}/comments`, { content });
    return {
      comment: res.data?.comment as PostComment,
      commentCount: Number(res.data?.commentCount || 0),
    };
  },
};
