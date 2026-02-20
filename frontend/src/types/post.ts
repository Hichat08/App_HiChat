export type PostVisibility = "public" | "custom" | "only_me";
export type PostReactionType =
  | "like"
  | "love"
  | "care"
  | "haha"
  | "wow"
  | "sad"
  | "angry";

export interface PostAuthor {
  _id: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
}

export interface PostComment {
  _id: string;
  postId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: PostAuthor;
}

export interface Post {
  _id: string;
  content: string;
  media?: Array<{
    url: string;
    type: "image" | "video";
  }>;
  visibility: PostVisibility;
  createdAt: string;
  updatedAt: string;
  author: PostAuthor;
  likeCount: number;
  shareCount?: number;
  isLiked: boolean;
  myReaction?: PostReactionType | null;
  reactionCounts?: Partial<Record<PostReactionType, number>>;
  commentCount?: number;
  allowedViewerIds?: string[];
  sharedPost?: {
    _id: string;
    content: string;
    media?: Array<{
      url: string;
      type: "image" | "video";
    }>;
    visibility: PostVisibility;
    createdAt: string;
    updatedAt: string;
    author: PostAuthor;
    isUnavailable?: boolean;
  } | null;
}
