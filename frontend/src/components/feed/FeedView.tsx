import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clock3,
  Ellipsis,
  Home,
  ImageIcon,
  Lock,
  Info,
  Loader2,
  Globe,
  Menu,
  MessageCircle,
  Music,
  Share2,
  Search,
  Pencil,
  Plus,
  Trash2,
  ThumbsUp,
  UsersRound,
  UserPlus,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/useAuthStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useChatStore } from "@/stores/useChatStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { friendService } from "@/services/friendService";
import { postService } from "@/services/postService";
import { userService } from "@/services/userService";
import type {
  Post,
  PostComment,
  PostReactionType,
  PostVisibility,
} from "@/types/post";
import { cn } from "@/lib/utils";
import FriendRequestDialog from "../friendRequest/FriendRequestDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Logout from "../auth/Logout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { RelationshipRequest, User } from "@/types/user";

const visibilityLabel: Record<PostVisibility, string> = {
  public: "Công khai",
  custom: "Riêng tư (chọn người xem)",
  only_me: "Chỉ mình tôi",
};

const visibilityIcon: Record<PostVisibility, ReactNode> = {
  public: <Globe className="size-3.5" />,
  custom: <UsersRound className="size-3.5" />,
  only_me: <Lock className="size-3.5" />,
};

const formatPostTime = (value: string) =>
  new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const formatPostAgo = (value: string) => {
  const createdAt = new Date(value).getTime();
  const diffMs = Date.now() - createdAt;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 2) return "Vừa xong";
  if (diffMin < 60) return `${diffMin} phút`;
  return formatPostTime(value);
};

const getGivenName = (displayName?: string) => {
  const raw = displayName?.toString().trim() || "";
  if (!raw) return "Bạn";
  const parts = raw.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || "Bạn";
};

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isSubsequence = (text: string, query: string) => {
  if (!query) return true;
  let i = 0;
  let j = 0;
  while (i < text.length && j < query.length) {
    if (text[i] === query[j]) {
      j += 1;
    }
    i += 1;
  }
  return j === query.length;
};

const levenshteinDistance = (a: string, b: string) => {
  const dp = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
};

const scoreUserMatch = (target: User, query: string) => {
  const q = normalizeText(query);
  if (!q) return -1;

  const display = normalizeText(target.displayName || "");
  const username = normalizeText(target.username || "");
  const displayTokens = display.split(/\s+/).filter(Boolean);
  const initials = displayTokens.map((token) => token[0]).join("");

  if (display === q || username === q) return 230;
  if (display.startsWith(q)) return 210;
  if (username.startsWith(q)) return 200;
  if (displayTokens.some((token) => token.startsWith(q))) return 180;
  if (initials.startsWith(q)) return 165;
  if (display.includes(q)) return 150;
  if (username.includes(q)) return 140;
  if (isSubsequence(display, q)) return 110;
  if (isSubsequence(username, q)) return 100;

  const minDisplayDistance = displayTokens.length
    ? Math.min(...displayTokens.map((token) => levenshteinDistance(token, q)))
    : levenshteinDistance(display, q);
  const usernameDistance = levenshteinDistance(username, q);
  const minDistance = Math.min(minDisplayDistance, usernameDistance);
  const typoTolerance = q.length >= 6 ? 2 : 1;

  if (minDistance <= typoTolerance) {
    return 80 - minDistance * 10;
  }

  return -1;
};

type MediaKind = "image" | "video" | "reel";

type LocalAttachment = {
  id: string;
  name: string;
  url: string;
  kind: MediaKind;
  file: File;
};

type FriendSuggestionItem = {
  _id: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
  mutualCount?: number;
  commonGroupsCount?: number;
};

type StoryTile = {
  id: string;
  authorId: string;
  authorName: string;
  avatarUrl?: string | null;
  previewUrl?: string;
  contentSnippet?: string;
  storyType: "text" | "music" | "video";
  musicId?: string;
  musicTitle?: string;
  musicArtist?: string;
  musicUrl?: string;
  createdAt: string;
};

const LAST_SUGGESTIONS_OPENED_AT_KEY = "hichat_last_suggestions_opened_at";
const INLINE_SUGGESTIONS_TRIGGER_MS = 3 * 24 * 60 * 60 * 1000;
const STORY_ONLY_POST_IDS_KEY = "hichat_story_only_post_ids";
const STORY_TYPE_BY_POST_ID_KEY = "hichat_story_type_by_post_id";
const STORY_EXPIRE_MS = 24 * 60 * 60 * 1000;
const STORY_DISPLAY_MS = 30 * 1000;
const STORY_VIDEO_MAX_SECONDS = 60;
const STORY_MARKER_REGEX = /^\[\[story:(text|music|video)(?::([a-z0-9_-]+))?\]\]\s*/i;

type StoryMusicTrack = {
  id: string;
  title: string;
  artist: string;
  previewUrl: string;
};

const STORY_MUSIC_LIBRARY: StoryMusicTrack[] = [
  {
    id: "calm-lofi",
    title: "Calm Lofi",
    artist: "HiChat Library",
    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  },
  {
    id: "sunrise-vibe",
    title: "Sunrise Vibe",
    artist: "HiChat Library",
    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  },
  {
    id: "night-drive",
    title: "Night Drive",
    artist: "HiChat Library",
    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  },
];

const getStoryMarkerInfo = (content?: string | null) => {
  const raw = content || "";
  const match = raw.match(STORY_MARKER_REGEX);
  if (!match) return null;
  const type = match?.[1]?.toLowerCase();
  const musicId = match?.[2]?.toLowerCase();
  if (type !== "text" && type !== "music" && type !== "video") return null;
  return { type, musicId: musicId || undefined } as {
    type: "text" | "music" | "video";
    musicId?: string;
  };
};

const getStoryTypeFromContent = (content?: string | null): "text" | "music" | "video" | null => {
  const marker = getStoryMarkerInfo(content);
  const type = marker?.type;
  if (type === "text" || type === "music" || type === "video") return type;
  return null;
};

const stripStoryMarker = (content?: string | null) => {
  const raw = content || "";
  return raw.replace(STORY_MARKER_REGEX, "").trim();
};

const isStoryActive = (createdAt?: string) => {
  if (!createdAt) return false;
  const createdTime = new Date(createdAt).getTime();
  if (!Number.isFinite(createdTime)) return false;
  return Date.now() - createdTime < STORY_EXPIRE_MS;
};

const getVideoDurationSeconds = (file: File) =>
  new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được độ dài video."));
    };
    video.src = url;
  });

const REACTION_META: Record<
  PostReactionType,
  { emoji: string; label: string; activeClass: string }
> = {
  like: { emoji: "👍", label: "Thích", activeClass: "text-blue-600" },
  love: { emoji: "❤️", label: "Yêu thích", activeClass: "text-rose-500" },
  care: { emoji: "🥰", label: "Thương thương", activeClass: "text-amber-500" },
  haha: { emoji: "😆", label: "Haha", activeClass: "text-amber-500" },
  wow: { emoji: "😮", label: "Wow", activeClass: "text-amber-500" },
  sad: { emoji: "😢", label: "Buồn", activeClass: "text-amber-500" },
  angry: { emoji: "😡", label: "Phẫn nộ", activeClass: "text-red-500" },
};

const REACTION_ORDER: PostReactionType[] = [
  "like",
  "love",
  "care",
  "haha",
  "wow",
  "sad",
  "angry",
];
const POST_PREVIEW_MAX_CHARS = 220;

const getPostOrderTime = (post: Post) =>
  new Date(post.createdAt || post.updatedAt || 0).getTime();

const mergeFeedPostsStable = (currentPosts: Post[], incomingPosts: Post[]) => {
  const incomingById = new Map(incomingPosts.map((post) => [post._id, post]));
  const merged: Post[] = [];
  const usedIds = new Set<string>();

  currentPosts.forEach((post) => {
    const incoming = incomingById.get(post._id);
    if (incoming) {
      merged.push(incoming);
      usedIds.add(post._id);
    }
  });

  const newPosts = incomingPosts
    .filter((post) => !usedIds.has(post._id))
    .sort((a, b) => getPostOrderTime(b) - getPostOrderTime(a));

  return [...newPosts, ...merged];
};

const FeedView = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser } = useAuthStore();
  const { conversations, setActiveConversation, fetchMessages, fetchConversations } = useChatStore();
  const {
    friends,
    getFriends,
    receivedList,
    getAllFriendRequests,
    acceptRequest,
    declineRequest,
    loading: friendRequestLoading,
  } = useFriendStore();
  const notificationCenterItems = useNotificationStore((state) => state.items);
  const addCenterNotification = useNotificationStore((state) => state.addNotification);
  const markCenterNotificationAsRead = useNotificationStore((state) => state.markAsRead);
  const markAllCenterNotificationsAsRead = useNotificationStore((state) => state.markAllAsRead);
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  const [allowedViewerIds, setAllowedViewerIds] = useState<string[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [likingMap, setLikingMap] = useState<Record<string, boolean>>({});
  const [sharingMap, setSharingMap] = useState<Record<string, boolean>>({});
  const [deletingMap, setDeletingMap] = useState<Record<string, boolean>>({});
  const [expandedPostIds, setExpandedPostIds] = useState<string[]>([]);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingVisibility, setEditingVisibility] = useState<PostVisibility>("public");
  const [editingAllowedViewerIds, setEditingAllowedViewerIds] = useState<string[]>([]);
  const [editingExistingMedia, setEditingExistingMedia] = useState<
    Array<{ url: string; type: "image" | "video" }>
  >([]);
  const [editingNewAttachments, setEditingNewAttachments] = useState<LocalAttachment[]>([]);
  const [updatingPost, setUpdatingPost] = useState(false);
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, PostComment[]>>({});
  const [commentsLoadingMap, setCommentsLoadingMap] = useState<Record<string, boolean>>({});
  const [commentSubmittingMap, setCommentSubmittingMap] = useState<Record<string, boolean>>({});
  const [commentInputMap, setCommentInputMap] = useState<Record<string, string>>({});
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [reactionPickerPostId, setReactionPickerPostId] = useState<string | null>(null);
  const [friendRequestOpen, setFriendRequestOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<"all" | "unread">("all");
  const [notificationNowMs, setNotificationNowMs] = useState(() => Date.now());
  const [postFlowOpen, setPostFlowOpen] = useState(false);
  const [postStep, setPostStep] = useState<"composer" | "settings">("composer");
  const [promotePost, setPromotePost] = useState(false);
  const [pendingMediaAction, setPendingMediaAction] = useState<MediaKind | null>(null);
  const [friendSearchKeyword, setFriendSearchKeyword] = useState("");
  const [remoteSearchUsers, setRemoteSearchUsers] = useState<User[]>([]);
  const [searchingFriend, setSearchingFriend] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<User[]>([]);
  const [selectedAttachments, setSelectedAttachments] = useState<LocalAttachment[]>([]);
  const [seenFriendPostIds, setSeenFriendPostIds] = useState<string[]>([]);
  const [inlineSuggestions, setInlineSuggestions] = useState<FriendSuggestionItem[]>([]);
  const [inlineSuggestionsLoading, setInlineSuggestionsLoading] = useState(false);
  const [relationshipReceivedList, setRelationshipReceivedList] = useState<RelationshipRequest[]>([]);
  const [relationshipRequestLoading, setRelationshipRequestLoading] = useState(false);
  const [storyPickerOpen, setStoryPickerOpen] = useState(false);
  const [storyMusicLibraryOpen, setStoryMusicLibraryOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<"post" | "story">("post");
  const [, setPostIntent] = useState<"normal" | "love_couple" | "love_single">("normal");
  const [pendingStoryType, setPendingStoryType] = useState<"text" | "music" | "video" | null>(null);
  const [pendingStoryMusicId, setPendingStoryMusicId] = useState<string | null>(null);
  const [storyOnlyPostIds, setStoryOnlyPostIds] = useState<string[]>([]);
  const [storyTypeByPostId, setStoryTypeByPostId] = useState<
    Record<string, "text" | "music" | "video">
  >({});
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerAuthorId, setStoryViewerAuthorId] = useState<string | null>(null);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [storyNowMs, setStoryNowMs] = useState(() => Date.now());
  const [storyProgress, setStoryProgress] = useState(0);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const reelInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);
  const editVideoInputRef = useRef<HTMLInputElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const reactionPressTimerRef = useRef<number | null>(null);
  const reactionLongPressTriggeredRef = useRef(false);
  const feedVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const feedVideoObserverRef = useRef<IntersectionObserver | null>(null);
  const storyViewerVideoRef = useRef<HTMLVideoElement | null>(null);

  const selectedAllowedCount = useMemo(
    () => allowedViewerIds.length,
    [allowedViewerIds]
  );
  const shouldShowInlineSuggestions = useMemo(() => {
    if (typeof window === "undefined") return false;
    const raw = localStorage.getItem(LAST_SUGGESTIONS_OPENED_AT_KEY);
    if (!raw) return true;

    const lastOpenedAt = Number(raw);
    if (!Number.isFinite(lastOpenedAt)) return true;
    return Date.now() - lastOpenedAt >= INLINE_SUGGESTIONS_TRIGGER_MS;
  }, []);
  const storyOnlyPostIdSet = useMemo(
    () => new Set(storyOnlyPostIds.map((id) => id?.toString()).filter(Boolean)),
    [storyOnlyPostIds]
  );
  const isStoryPost = useCallback(
    (post: Post) =>
      storyOnlyPostIdSet.has(post._id)
      || !!storyTypeByPostId[post._id]
      || !!getStoryTypeFromContent(post.content),
    [storyOnlyPostIdSet, storyTypeByPostId]
  );
  const visibleFeedPosts = useMemo(
    () => posts.filter((post) => !isStoryPost(post)),
    [posts, isStoryPost]
  );
  const activeStoryPosts = useMemo(
    () => posts.filter((post) => isStoryPost(post) && isStoryActive(post.createdAt)),
    [isStoryPost, posts, storyNowMs]
  );
  const shouldRenderInlineSuggestions =
    shouldShowInlineSuggestions &&
    !inlineSuggestionsLoading &&
    inlineSuggestions.length > 0 &&
    visibleFeedPosts.length >= 3;
  const userGivenName = useMemo(() => getGivenName(user?.displayName), [user?.displayName]);
  const seenFriendPostIdSet = useMemo(() => new Set(seenFriendPostIds), [seenFriendPostIds]);
  const expandedPostIdSet = useMemo(() => new Set(expandedPostIds), [expandedPostIds]);
  const currentUserId = user?._id?.toString();
  const friendIdSet = useMemo(() => {
    if (!currentUserId) return new Set<string>();
    return new Set(
      friends
        .map((friend) => friend._id?.toString())
        .filter((id): id is string => !!id && id !== currentUserId)
    );
  }, [currentUserId, friends]);

  const friendPostNotifications = useMemo(() => {
    if (!currentUserId) return [];

    return visibleFeedPosts
      .filter((post) => {
        const authorId = post.author?._id?.toString();
        if (!authorId) return false;
        return authorId !== currentUserId && friendIdSet.has(authorId);
      })
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const bTime = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 20);
  }, [currentUserId, friendIdSet, visibleFeedPosts]);

  const storyTiles = useMemo<StoryTile[]>(() => {
    const storySource = activeStoryPosts
      .sort((a, b) => getPostOrderTime(b) - getPostOrderTime(a));
    return storySource
      .map((post) => {
        const authorId = post.author?._id?.toString();
        if (!authorId) return null;
        const firstMedia = post.media?.[0];
        const marker = getStoryMarkerInfo(post.content);
        const storyType = storyTypeByPostId[post._id]
          || marker?.type
          || (firstMedia?.type === "video" ? "video" : "text");
        const musicTrack = marker?.musicId
          ? STORY_MUSIC_LIBRARY.find((item) => item.id === marker.musicId)
          : null;

        if (!firstMedia?.url && storyType === "video") return null;
        return {
          id: post._id,
          authorId,
          authorName: post.author.displayName || post.author.username || "Người dùng",
          avatarUrl: post.author.avatarUrl,
          previewUrl: firstMedia?.url,
          contentSnippet: stripStoryMarker(post.content).slice(0, 90),
          storyType,
          musicId: musicTrack?.id,
          musicTitle: musicTrack?.title,
          musicArtist: musicTrack?.artist,
          musicUrl: musicTrack?.previewUrl,
          createdAt: post.createdAt,
        } as StoryTile;
      })
      .filter((item): item is StoryTile => !!item)
      .slice(0, 40);
  }, [activeStoryPosts, storyTypeByPostId]);
  const storyGroups = useMemo(() => {
    const map = new Map<string, StoryTile[]>();
    storyTiles.forEach((story) => {
      const list = map.get(story.authorId) || [];
      list.push(story);
      map.set(story.authorId, list);
    });
    map.forEach((list, key) => {
      map.set(
        key,
        [...list].sort(
          (a, b) =>
            new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
        )
      );
    });
    return map;
  }, [storyTiles]);
  const storyPreviewTiles = useMemo(
    () =>
      Array.from(storyGroups.values())
        .map((list) => list[list.length - 1])
        .filter(Boolean)
        .sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        ),
    [storyGroups]
  );
  const activeStoryGroup = useMemo(() => {
    if (!storyViewerAuthorId) return [] as StoryTile[];
    return storyGroups.get(storyViewerAuthorId) || [];
  }, [storyGroups, storyViewerAuthorId]);

  const unreadFriendPostNotifications = useMemo(
    () => friendPostNotifications.filter((post) => !seenFriendPostIdSet.has(post._id)),
    [friendPostNotifications, seenFriendPostIdSet]
  );
  const pendingStoryMusic = useMemo(
    () => STORY_MUSIC_LIBRARY.find((item) => item.id === pendingStoryMusicId) || null,
    [pendingStoryMusicId]
  );

  const unreadMessageCount = useMemo(() => {
    if (!user?._id) return 0;
    return conversations.reduce((total, convo) => {
      const unread = convo.unreadCounts?.[user._id] ?? 0;
      return total + unread;
    }, 0);
  }, [conversations, user?._id]);

  const unreadCenterCount = useMemo(
    () => notificationCenterItems.filter((item) => !item.read).length,
    [notificationCenterItems]
  );

  const notificationCount = useMemo(
    () => receivedList.length + relationshipReceivedList.length + unreadCenterCount,
    [receivedList.length, relationshipReceivedList.length, unreadCenterCount]
  );

  const mergedNotifications = useMemo(() => {
    const friendRequestItems = receivedList.map((request) => ({
      id: `request-${request._id}`,
      type: "friend_request" as const,
      time: new Date(request.createdAt || request.updatedAt || 0).getTime(),
      requestId: request._id,
      title: request.from?.displayName || "Người dùng",
      avatarUrl: request.from?.avatarUrl ?? null,
      description: "Đã gửi lời mời kết bạn",
    }));
    const relationshipRequestItems = relationshipReceivedList.map((request) => ({
      id: `relationship-${request._id}`,
      type: "relationship_request" as const,
      time: new Date(request.createdAt || request.updatedAt || 0).getTime(),
      requestId: request._id,
      title: request.from?.displayName || "Người dùng",
      avatarUrl: request.from?.avatarUrl ?? null,
      description: "Đã gửi lời mời hẹn hò",
    }));

    const centerItems = notificationCenterItems.map((item) => ({
      id: item.id,
      type: "center" as const,
      time: new Date(item.createdAt).getTime(),
      title: item.title,
      avatarUrl: item.avatarUrl ?? null,
      description: item.description || "",
      centerId: item.id,
      centerRead: item.read,
      conversationId: item.conversationId,
      postId: item.postId,
    }));

    return [...friendRequestItems, ...relationshipRequestItems, ...centerItems].sort(
      (a, b) => b.time - a.time
    );
  }, [
    notificationCenterItems,
    relationshipReceivedList,
    receivedList,
  ]);

  const candidateUsers = useMemo(() => {
    const map = new Map<string, User>();

    friends.forEach((friend) => {
      map.set(friend._id, {
        _id: friend._id,
        username: friend.username,
        displayName: friend.displayName,
        email: "",
        avatarUrl: friend.avatarUrl,
      });
    });

    recentSearches.forEach((item) => {
      map.set(item._id, item);
    });

    remoteSearchUsers.forEach((item) => {
      map.set(item._id, item);
    });

    posts.forEach((post) => {
      map.set(post.author._id, {
        _id: post.author._id,
        username: post.author.username,
        displayName: post.author.displayName,
        email: "",
        avatarUrl: post.author.avatarUrl ?? undefined,
      });
    });

    return Array.from(map.values());
  }, [friends, posts, recentSearches, remoteSearchUsers]);

  const filteredFriendResults = useMemo(() => {
    const keyword = friendSearchKeyword.trim();
    if (!keyword) return [];

    return candidateUsers
      .map((item) => ({
        item,
        score:
          scoreUserMatch(item, keyword) +
          (recentSearches.some((recent) => recent._id === item._id) ? 8 : 0),
      }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.item.displayName.localeCompare(b.item.displayName, "vi");
      })
      .map((entry) => entry.item);
  }, [candidateUsers, friendSearchKeyword, recentSearches]);

  const createFeedVideoRef = (key: string) => (node: HTMLVideoElement | null) => {
    if (node) {
      feedVideoRefs.current.set(key, node);
      return;
    }
    feedVideoRefs.current.delete(key);
  };

  const syncFeedVideoPlayback = useCallback(() => {
    const videos = Array.from(feedVideoRefs.current.values());
    if (!videos.length) return;

    let bestVideo: HTMLVideoElement | null = null;
    let bestRatio = 0;

    videos.forEach((video) => {
      const ratio = Number(video.dataset.intersectionRatio || "0");
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestVideo = video;
      }
    });

    videos.forEach((video) => {
      const shouldPlay = bestVideo === video && bestRatio >= 0.55;
      if (shouldPlay) {
        video
          .play()
          .catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    feedVideoObserverRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLVideoElement;
          target.dataset.intersectionRatio = entry.intersectionRatio.toString();
        });
        syncFeedVideoPlayback();
      },
      {
        threshold: [0, 0.25, 0.5, 0.55, 0.75, 1],
      }
    );

    feedVideoObserverRef.current = observer;
    feedVideoRefs.current.forEach((video) => observer.observe(video));
    syncFeedVideoPlayback();

    return () => {
      observer.disconnect();
      feedVideoRefs.current.forEach((video) => video.pause());
    };
  }, [posts, syncFeedVideoPlayback]);

  useEffect(() => {
    const keyword = friendSearchKeyword.trim();
    if (keyword.length < 1) {
      setRemoteSearchUsers([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingFriend(true);
        const foundUsers = await friendService.searchUsers(keyword);
        setRemoteSearchUsers(foundUsers || []);
      } catch (error) {
        setRemoteSearchUsers([]);
      } finally {
        setSearchingFriend(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [friendSearchKeyword]);

  useEffect(() => {
    const rawStoryIds = localStorage.getItem(STORY_ONLY_POST_IDS_KEY);
    if (rawStoryIds) {
      try {
        const parsed = JSON.parse(rawStoryIds);
        if (Array.isArray(parsed)) {
          setStoryOnlyPostIds(parsed.map((id) => id?.toString()).filter(Boolean));
        }
      } catch {
        localStorage.removeItem(STORY_ONLY_POST_IDS_KEY);
      }
    }

    const rawStoryType = localStorage.getItem(STORY_TYPE_BY_POST_ID_KEY);
    if (rawStoryType) {
      try {
        const parsed = JSON.parse(rawStoryType) as Record<string, "text" | "music" | "video">;
        if (parsed && typeof parsed === "object") {
          setStoryTypeByPostId(parsed);
        }
      } catch {
        localStorage.removeItem(STORY_TYPE_BY_POST_ID_KEY);
      }
    }

    const raw = localStorage.getItem("hichat_recent_friend_searches");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as User[];
        setRecentSearches(parsed);
        return;
      } catch {
        localStorage.removeItem("hichat_recent_friend_searches");
      }
    }
    if (friends.length) {
      const seeded = friends.slice(0, 8).map((friend) => ({
        _id: friend._id,
        username: friend.username,
        displayName: friend.displayName,
        email: "",
        avatarUrl: friend.avatarUrl,
      }));
      setRecentSearches(seeded);
    }
  }, [friends]);

  useEffect(() => {
    localStorage.setItem(STORY_ONLY_POST_IDS_KEY, JSON.stringify(storyOnlyPostIds));
  }, [storyOnlyPostIds]);

  useEffect(() => {
    localStorage.setItem(STORY_TYPE_BY_POST_ID_KEY, JSON.stringify(storyTypeByPostId));
  }, [storyTypeByPostId]);

  useEffect(() => {
    localStorage.setItem("hichat_recent_friend_searches", JSON.stringify(recentSearches));
  }, [recentSearches]);

  useEffect(() => {
    const raw = localStorage.getItem("hichat_seen_friend_post_notifications");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSeenFriendPostIds(parsed.map((id) => id?.toString()).filter(Boolean));
      }
    } catch {
      localStorage.removeItem("hichat_seen_friend_post_notifications");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "hichat_seen_friend_post_notifications",
      JSON.stringify(seenFriendPostIds)
    );
  }, [seenFriendPostIds]);

  useEffect(() => {
    unreadFriendPostNotifications.forEach((post) => {
      addCenterNotification({
        id: `friend-post-${post._id}`,
        type: "friend_post",
        title: `${post.author.displayName} đã đăng bài mới`,
        description: post.content?.trim() || "Bài viết có ảnh/video",
        avatarUrl: post.author.avatarUrl ?? null,
        createdAt: post.createdAt,
        postId: post._id,
      });
    });
  }, [addCenterNotification, unreadFriendPostNotifications]);

  useEffect(() => {
    if (!notificationOpen || friendPostNotifications.length === 0) return;

    setSeenFriendPostIds((prev) => {
      const merged = new Set(prev);
      friendPostNotifications.forEach((post) => merged.add(post._id));
      return Array.from(merged);
    });
  }, [friendPostNotifications, notificationOpen]);

  useEffect(() => {
    if (!postFlowOpen || postStep !== "composer" || !pendingMediaAction) return;

    const trigger = () => {
      if (pendingMediaAction === "image") {
        imageInputRef.current?.click();
      } else if (pendingMediaAction === "video") {
        videoInputRef.current?.click();
      } else {
        reelInputRef.current?.click();
      }
      setPendingMediaAction(null);
    };

    const timer = setTimeout(trigger, 0);
    return () => clearTimeout(timer);
  }, [postFlowOpen, postStep, pendingMediaAction]);

  useEffect(() => {
    return () => {
      selectedAttachments.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [selectedAttachments]);

  useEffect(() => {
    return () => {
      editingNewAttachments.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [editingNewAttachments]);

  useEffect(() => {
    return () => {
      if (reactionPressTimerRef.current !== null) {
        window.clearTimeout(reactionPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!reactionPickerPostId) return;

    const closePickerIfOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-reaction-picker-root='true']")) return;
      setReactionPickerPostId(null);
    };

    document.addEventListener("mousedown", closePickerIfOutside);
    document.addEventListener("touchstart", closePickerIfOutside);
    return () => {
      document.removeEventListener("mousedown", closePickerIfOutside);
      document.removeEventListener("touchstart", closePickerIfOutside);
    };
  }, [reactionPickerPostId]);

  const loadFeed = useCallback(async (options?: { silent?: boolean; limit?: number }) => {
    const silent = options?.silent ?? false;
    const limit = options?.limit ?? 50;

    try {
      if (!silent) {
        setFeedLoading(true);
      }
      const res = await postService.getFeed(undefined, limit);
      const incomingPosts = res.posts || [];
      setPosts((prev) => mergeFeedPostsStable(prev, incomingPosts));
    } catch (error: any) {
      if (!silent) {
        toast.error(error?.response?.data?.message || "Không thể tải bảng tin");
      }
    } finally {
      if (!silent) {
        setFeedLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadFeed();
    getFriends();
    getAllFriendRequests();
    fetchConversations();
  }, [fetchConversations, getAllFriendRequests, getFriends, loadFeed]);

  const loadRelationshipRequests = useCallback(async () => {
    try {
      const result = await userService.getRelationshipRequests();
      setRelationshipReceivedList(result.received || []);
    } catch (error) {
      setRelationshipReceivedList([]);
    }
  }, []);

  useEffect(() => {
    loadRelationshipRequests();
  }, [loadRelationshipRequests]);

  useEffect(() => {
    if (!shouldShowInlineSuggestions) return;

    let alive = true;
    const loadInlineSuggestions = async () => {
      try {
        setInlineSuggestionsLoading(true);
        const suggestions = await friendService.getSuggestions();
        if (!alive) return;
        setInlineSuggestions((suggestions || []).slice(0, 10));
      } catch (error) {
        if (!alive) return;
        setInlineSuggestions([]);
      } finally {
        if (alive) {
          setInlineSuggestionsLoading(false);
        }
      }
    };

    loadInlineSuggestions();
    return () => {
      alive = false;
    };
  }, [shouldShowInlineSuggestions]);

  useEffect(() => {
    if (!notificationOpen) return;
    loadFeed({ silent: true, limit: 50 });
    loadRelationshipRequests();
  }, [notificationOpen, loadFeed, loadRelationshipRequests]);

  useEffect(() => {
    const timer = setInterval(() => {
      setStoryNowMs(Date.now());
      loadFeed({ silent: true, limit: 50 });
      loadRelationshipRequests();
    }, 30000);

    return () => clearInterval(timer);
  }, [loadFeed, loadRelationshipRequests]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        setStoryNowMs(Date.now());
        loadFeed({ silent: true, limit: 50 });
        loadRelationshipRequests();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [loadFeed, loadRelationshipRequests]);

  useEffect(() => {
    setStoryNowMs(Date.now());
  }, [posts]);

  useEffect(() => {
    if (!storyViewerOpen) return;
    if (activeStoryGroup.length === 0) {
      setStoryViewerOpen(false);
      setStoryViewerAuthorId(null);
      setStoryViewerIndex(0);
      return;
    }
    if (storyViewerIndex >= activeStoryGroup.length) {
      setStoryViewerIndex(activeStoryGroup.length - 1);
    }
  }, [activeStoryGroup, storyViewerIndex, storyViewerOpen]);

  useEffect(() => {
    setStoryProgress(0);
  }, [storyViewerAuthorId, storyViewerIndex]);

  const handleHomeClick = async () => {
    if (location.pathname !== "/") {
      navigate("/");
      return;
    }

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    await Promise.all([
      loadFeed(),
      getFriends(),
      getAllFriendRequests(),
      fetchConversations(),
    ]);
  };

  const toggleAllowedViewer = (id: string) => {
    setAllowedViewerIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const toggleEditingAllowedViewer = (id: string) => {
    setEditingAllowedViewerIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const togglePostExpanded = (postId: string) => {
    setExpandedPostIds((prev) =>
      prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId]
    );
  };

  const openEditPostDialog = (post: Post) => {
    setEditingPost(post);
    setEditingContent(post.content || "");
    setEditingVisibility(post.visibility || "public");
    setEditingAllowedViewerIds((post.allowedViewerIds || []).map((id) => id?.toString()).filter(Boolean));
    setEditingExistingMedia(
      (post.media || []).map((item) => ({
        url: item.url,
        type: item.type,
      }))
    );
    setEditingNewAttachments([]);
  };

  const handleCloseEditPostDialog = (open: boolean) => {
    if (open) return;
    editingNewAttachments.forEach((item) => URL.revokeObjectURL(item.url));
    setEditingPost(null);
    setEditingContent("");
    setEditingVisibility("public");
    setEditingAllowedViewerIds([]);
    setEditingExistingMedia([]);
    setEditingNewAttachments([]);
  };

  const handleSubmitEditPost = async () => {
    if (!editingPost) return;
    const trimmed = editingContent.trim();
    const hasMedia = editingExistingMedia.length + editingNewAttachments.length > 0;

    if (!trimmed && !hasMedia) {
      toast.warning("Bạn cần nhập nội dung hoặc giữ lại ảnh/video");
      return;
    }

    if (editingVisibility === "custom" && editingAllowedViewerIds.length === 0) {
      toast.warning("Bạn cần chọn ít nhất 1 người xem cho chế độ riêng tư");
      return;
    }

    try {
      setUpdatingPost(true);
      const updated = await postService.updatePost(editingPost._id, {
        content: trimmed,
        visibility: editingVisibility,
        allowedViewerIds: editingVisibility === "custom" ? editingAllowedViewerIds : [],
        keepMediaUrls: editingExistingMedia.map((item) => item.url),
        mediaFiles: editingNewAttachments.map((item) => item.file),
      });

      setPosts((prev) => prev.map((item) => (item._id === editingPost._id ? updated : item)));
      toast.success("Đã cập nhật bài viết");
      handleCloseEditPostDialog(false);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể sửa bài viết");
    } finally {
      setUpdatingPost(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (deletingMap[postId]) return;
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm("Bạn chắc chắn muốn xoá bài viết này?");
    if (!confirmed) return;

    try {
      setDeletingMap((prev) => ({ ...prev, [postId]: true }));
      await postService.deletePost(postId);
      setPosts((prev) => prev.filter((item) => item._id !== postId));
      setCommentsByPostId((prev) => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
      setExpandedPostIds((prev) => prev.filter((id) => id !== postId));
      if (activeCommentPostId === postId) {
        setActiveCommentPostId(null);
      }
      toast.success("Đã xoá bài viết");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể xoá bài viết");
    } finally {
      setDeletingMap((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleSubmitPost = async () => {
    const trimmed = content.trim();
    const hasAttachments = selectedAttachments.length > 0;

    if (!trimmed && !hasAttachments) {
      toast.warning("Bạn cần nhập nội dung hoặc thêm ảnh/video trước khi đăng");
      return;
    }

    if (visibility === "custom" && allowedViewerIds.length === 0) {
      toast.warning("Bạn cần chọn ít nhất 1 người xem cho chế độ riêng tư");
      return;
    }
    if (composerMode === "story" && pendingStoryType === "music" && !pendingStoryMusicId) {
      toast.warning("Bạn cần chọn một bài nhạc cho tin.");
      return;
    }

    try {
      setCreating(true);
      const submitContent = (() => {
        if (!(composerMode === "story" && pendingStoryType)) {
          return trimmed;
        }
        if (pendingStoryType === "music" && pendingStoryMusicId) {
          return `[[story:music:${pendingStoryMusicId}]] ${trimmed}`.trim();
        }
        return `[[story:${pendingStoryType}]] ${trimmed}`.trim();
      })();
      const post = await postService.createPost({
        content: submitContent,
        visibility,
        allowedViewerIds: visibility === "custom" ? allowedViewerIds : [],
        mediaFiles: selectedAttachments.map((item) => item.file),
      });
      setPosts((prev) => [post, ...prev]);
      if (composerMode === "story") {
        setStoryOnlyPostIds((prev) =>
          prev.includes(post._id) ? prev : [post._id, ...prev]
        );
        if (pendingStoryType) {
          setStoryTypeByPostId((prev) => ({
            ...prev,
            [post._id]: pendingStoryType,
          }));
        }
      }
      setContent("");
      setSelectedAttachments([]);
      setPostFlowOpen(false);
      setPostStep("composer");
      setComposerMode("post");
      setPendingStoryType(null);
      setPendingStoryMusicId(null);
      if (visibility !== "custom") {
        setAllowedViewerIds([]);
      }

      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      addCenterNotification({
        id: `my-post-${post._id}`,
        type: "activity",
        title: composerMode === "story" ? "Bạn đã đăng tin mới" : "Bạn đã đăng bài mới",
        description: stripStoryMarker(post.content) || "Bài viết có ảnh/video",
        avatarUrl: user?.avatarUrl ?? null,
        createdAt: post.createdAt,
        postId: post._id,
      });

      toast.success(composerMode === "story" ? "Đăng tin thành công" : "Đăng bài thành công");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể đăng bài");
    } finally {
      setCreating(false);
    }
  };

  const openPostDialogWithAction = (kind: MediaKind) => {
    setStoryMusicLibraryOpen(false);
    setComposerMode("post");
    setPostIntent("normal");
    setPendingStoryType(null);
    setPendingStoryMusicId(null);
    setPostFlowOpen(true);
    setPostStep("composer");
    setPendingMediaAction(kind);
  };

  const openPostComposer = () => {
    setStoryMusicLibraryOpen(false);
    setComposerMode("post");
    setPostIntent("normal");
    setPendingStoryType(null);
    setPendingStoryMusicId(null);
    setPostFlowOpen(true);
    setPostStep("composer");
    setPendingMediaAction(null);
  };

  const handleSelectStoryType = (type: "text" | "music" | "video") => {
    setStoryPickerOpen(false);
    setComposerMode("story");
    setPendingStoryType(type);
    if (type === "music") {
      setPendingMediaAction(null);
      setStoryMusicLibraryOpen(true);
      return;
    }
    setPostFlowOpen(true);
    setPostStep("composer");

    if (type === "text") {
      setPendingMediaAction(null);
      return;
    }

    setPendingMediaAction("video");
  };

  const handleSelectStoryMusic = (musicId: string) => {
    setPendingStoryMusicId(musicId);
    setStoryMusicLibraryOpen(false);
    setPostFlowOpen(true);
    setPostStep("composer");
    setPendingMediaAction(null);
  };

  const handleOpenStoryViewer = (authorId: string, storyId: string) => {
    const group = storyGroups.get(authorId) || [];
    if (!group.length) return;
    const index = group.findIndex((item) => item.id === storyId);
    setStoryViewerAuthorId(authorId);
    setStoryViewerIndex(index >= 0 ? index : group.length - 1);
    setStoryViewerOpen(true);
  };

  const handleStoryPrev = () => {
    if (!storyViewerAuthorId) return;
    const authorOrder = storyPreviewTiles.map((item) => item.authorId);
    const currentAuthorPos = authorOrder.findIndex((id) => id === storyViewerAuthorId);
    if (currentAuthorPos < 0) return;

    if (storyViewerIndex > 0) {
      setStoryViewerIndex((prev) => prev - 1);
      return;
    }

    const prevAuthorPos =
      currentAuthorPos <= 0 ? authorOrder.length - 1 : currentAuthorPos - 1;
    const prevAuthorId = authorOrder[prevAuthorPos];
    const prevGroup = storyGroups.get(prevAuthorId) || [];
    if (!prevGroup.length) return;
    setStoryViewerAuthorId(prevAuthorId);
    setStoryViewerIndex(prevGroup.length - 1);
  };

  const handleStoryNext = () => {
    if (!storyViewerAuthorId) return;
    const authorOrder = storyPreviewTiles.map((item) => item.authorId);
    const currentAuthorPos = authorOrder.findIndex((id) => id === storyViewerAuthorId);
    if (currentAuthorPos < 0) return;

    if (storyViewerIndex < activeStoryGroup.length - 1) {
      setStoryViewerIndex((prev) => prev + 1);
      return;
    }

    const nextAuthorPos =
      currentAuthorPos >= authorOrder.length - 1 ? 0 : currentAuthorPos + 1;
    const nextAuthorId = authorOrder[nextAuthorPos];
    const nextGroup = storyGroups.get(nextAuthorId) || [];
    if (!nextGroup.length) return;
    setStoryViewerAuthorId(nextAuthorId);
    setStoryViewerIndex(0);
  };
  const activeStory = activeStoryGroup[storyViewerIndex] || null;
  const canDeleteActiveStory = !!activeStory && activeStory.authorId === currentUserId;

  useEffect(() => {
    if (!storyViewerOpen || !activeStory) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextProgress = Math.min(elapsed / STORY_DISPLAY_MS, 1);
      setStoryProgress(nextProgress);
      if (elapsed >= STORY_DISPLAY_MS) {
        window.clearInterval(timer);
        handleStoryNext();
      }
    }, 120);

    return () => window.clearInterval(timer);
  }, [activeStory, storyViewerOpen, storyViewerAuthorId, storyViewerIndex]);

  const appendFiles = async (files: FileList | null, kind: MediaKind) => {
    if (!files?.length) return;
    let acceptedFiles = Array.from(files);
    if (composerMode === "story" && pendingStoryType === "video" && kind === "video") {
      const checked = await Promise.all(
        acceptedFiles.map(async (file) => {
          try {
            const duration = await getVideoDurationSeconds(file);
            if (duration > STORY_VIDEO_MAX_SECONDS) {
              toast.warning(`Video "${file.name}" vượt quá 1 phút, không thể dùng làm tin.`);
              return null;
            }
            return file;
          } catch {
            toast.warning(`Không đọc được video "${file.name}".`);
            return null;
          }
        })
      );
      acceptedFiles = checked.filter((item): item is File => !!item);
      if (!acceptedFiles.length) return;
    }

    const nextAttachments: LocalAttachment[] = acceptedFiles.map((file) => ({
      id: `${kind}-${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      url: URL.createObjectURL(file),
      kind,
      file,
    }));
    setSelectedAttachments((prev) => [...prev, ...nextAttachments]);
  };

  const removeSelectedAttachment = (id: string) => {
    setSelectedAttachments((prev) => {
      const found = prev.find((item) => item.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((item) => item.id !== id);
    });
  };

  const appendEditingFiles = (files: FileList | null, kind: MediaKind) => {
    if (!files?.length) return;
    const nextAttachments: LocalAttachment[] = Array.from(files).map((file) => ({
      id: `edit-${kind}-${file.name}-${file.size}-${file.lastModified}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      name: file.name,
      url: URL.createObjectURL(file),
      kind,
      file,
    }));
    setEditingNewAttachments((prev) => [...prev, ...nextAttachments]);
  };

  const removeEditingAttachment = (id: string) => {
    setEditingNewAttachments((prev) => {
      const found = prev.find((item) => item.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((item) => item.id !== id);
    });
  };

  const removeEditingExistingMedia = (url: string) => {
    setEditingExistingMedia((prev) => prev.filter((item) => item.url !== url));
  };

  const handleLike = async (postId: string, reactionType?: PostReactionType | null) => {
    if (likingMap[postId]) return;
    try {
      setLikingMap((prev) => ({ ...prev, [postId]: true }));
      const updated = await postService.toggleLike(postId, reactionType);
      setPosts((prev) => prev.map((p) => (p._id === postId ? updated : p)));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể thích bài viết");
    } finally {
      setLikingMap((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const clearReactionPressTimer = () => {
    if (reactionPressTimerRef.current !== null) {
      window.clearTimeout(reactionPressTimerRef.current);
      reactionPressTimerRef.current = null;
    }
  };

  const handleReactionPressStart = (postId: string) => {
    clearReactionPressTimer();
    reactionLongPressTriggeredRef.current = false;

    reactionPressTimerRef.current = window.setTimeout(() => {
      reactionLongPressTriggeredRef.current = true;
      setReactionPickerPostId(postId);
    }, 420);
  };

  const handleReactionPressEnd = () => {
    clearReactionPressTimer();
  };

  const handleLikeButtonClick = async (
    postId: string,
    currentReaction?: PostReactionType | null
  ) => {
    if (reactionLongPressTriggeredRef.current) {
      reactionLongPressTriggeredRef.current = false;
      return;
    }

    const hasReaction = !!currentReaction;
    await handleLike(postId, hasReaction ? null : "like");
    setReactionPickerPostId(null);
  };

  const handleSelectReaction = async (postId: string, reaction: PostReactionType) => {
    setReactionPickerPostId(null);

    await handleLike(postId, reaction);
  };

  const handleSharePost = async (postId: string) => {
    if (sharingMap[postId]) return;
    try {
      setSharingMap((prev) => ({ ...prev, [postId]: true }));
      const shared = await postService.sharePost(postId, { visibility: "public" });
      setPosts((prev) => [
        shared,
        ...prev.map((post) =>
          post._id === postId
            ? { ...post, shareCount: (post.shareCount ?? 0) + 1 }
            : post
        ),
      ]);
      toast.success("Đã chia sẻ bài viết");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể chia sẻ bài viết");
    } finally {
      setSharingMap((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const loadComments = async (postId: string) => {
    try {
      setCommentsLoadingMap((prev) => ({ ...prev, [postId]: true }));
      const comments = await postService.getComments(postId);
      setCommentsByPostId((prev) => ({ ...prev, [postId]: comments }));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể tải bình luận");
    } finally {
      setCommentsLoadingMap((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const toggleCommentSection = async (postId: string) => {
    const isOpening = activeCommentPostId !== postId;
    setActiveCommentPostId((prev) => (prev === postId ? null : postId));
    if (isOpening) {
      await loadComments(postId);
    }
  };

  const submitComment = async (postId: string) => {
    const content = commentInputMap[postId]?.trim() || "";
    if (!content) {
      toast.warning("Nội dung bình luận trống");
      return;
    }

    if (commentSubmittingMap[postId]) return;

    try {
      setCommentSubmittingMap((prev) => ({ ...prev, [postId]: true }));
      const { comment, commentCount } = await postService.addComment(postId, content);

      if (comment) {
        setCommentsByPostId((prev) => ({
          ...prev,
          [postId]: [...(prev[postId] || []), comment],
        }));
      }

      setPosts((prev) =>
        prev.map((item) =>
          item._id === postId ? { ...item, commentCount } : item,
        ),
      );

      setCommentInputMap((prev) => ({ ...prev, [postId]: "" }));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể gửi bình luận");
    } finally {
      setCommentSubmittingMap((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleSelectSearchedUser = (targetUser: User) => {
    setRecentSearches((prev) => [
      targetUser,
      ...prev.filter((item) => item._id !== targetUser._id),
    ].slice(0, 12));
    setSearchPanelOpen(false);
    setFriendSearchKeyword("");
    navigate(`/users/${targetUser._id}`);
  };

  const removeRecentUser = (targetUserId: string) => {
    setRecentSearches((prev) => prev.filter((item) => item._id !== targetUserId));
  };

  const handleGoToMyProfile = () => {
    setPostFlowOpen(false);
    setPostStep("composer");
    navigate("/profile");
  };

  const handleDismissInlineSuggestion = (userId: string) => {
    setInlineSuggestions((prev) => prev.filter((item) => item._id !== userId));
  };

  const handleSendInlineSuggestionRequest = async (targetUserId: string) => {
    try {
      await friendService.sendFriendRequest(targetUserId);
      setInlineSuggestions((prev) => prev.filter((item) => item._id !== targetUserId));
      toast.success("Đã gửi lời mời kết bạn");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể gửi lời mời kết bạn");
    }
  };

  const openUserProfile = (targetUserId?: string) => {
    if (!targetUserId) return;
    navigate(`/users/${targetUserId}`);
  };

  const openConversationFromNotification = async (conversationId: string) => {
    setNotificationOpen(false);
    setActiveConversation(conversationId);
    await fetchMessages(conversationId);
    navigate("/messages");
  };

  const openPostFromNotification = async () => {
    setNotificationOpen(false);
    if (location.pathname !== "/") {
      navigate("/");
      return;
    }
    await loadFeed({ silent: true, limit: 50 });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const isNotificationUnread = (item: (typeof mergedNotifications)[number]) => {
    if (item.type === "center") return !item.centerRead;
    return true;
  };

  const visibleNotifications = useMemo(() => {
    if (notificationFilter === "all") return mergedNotifications;
    return mergedNotifications.filter((item) => isNotificationUnread(item));
  }, [mergedNotifications, notificationFilter]);

  useEffect(() => {
    if (!notificationOpen) return;
    setNotificationNowMs(Date.now());
    const timer = setInterval(() => {
      setNotificationNowMs(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, [notificationOpen]);

  useEffect(() => {
    if (!notificationOpen) return;
    if (!notificationCenterItems.some((item) => !item.read)) return;

    // User has opened notification panel -> mark as seen immediately.
    markAllCenterNotificationsAsRead();
  }, [markAllCenterNotificationsAsRead, notificationCenterItems, notificationOpen]);

  const NEW_NOTIFICATION_WINDOW_MS = 60 * 60 * 1000; // 1 giờ
  const freshNotifications = useMemo(
    () => visibleNotifications.filter((item) => notificationNowMs - item.time < NEW_NOTIFICATION_WINDOW_MS),
    [notificationNowMs, visibleNotifications]
  );
  const olderNotifications = useMemo(
    () => visibleNotifications.filter((item) => notificationNowMs - item.time >= NEW_NOTIFICATION_WINDOW_MS),
    [notificationNowMs, visibleNotifications]
  );

  const handleAcceptFriendRequest = async (requestId: string) => {
    try {
      const request = receivedList.find((item) => item._id === requestId);
      await acceptRequest(requestId);
      addCenterNotification({
        id: `friend-request-accepted-${requestId}`,
        type: "activity",
        title: "Bạn đã chấp nhận lời mời kết bạn",
        description: request?.from?.displayName || "Lời mời kết bạn",
        avatarUrl: request?.from?.avatarUrl ?? null,
      });
      toast.success("Đã chấp nhận lời mời kết bạn");
    } catch (error) {
      toast.error("Không thể chấp nhận lời mời");
    }
  };

  const handleDeclineFriendRequest = async (requestId: string) => {
    try {
      const request = receivedList.find((item) => item._id === requestId);
      await declineRequest(requestId);
      addCenterNotification({
        id: `friend-request-declined-${requestId}`,
        type: "activity",
        title: "Bạn đã từ chối lời mời kết bạn",
        description: request?.from?.displayName || "Lời mời kết bạn",
        avatarUrl: request?.from?.avatarUrl ?? null,
      });
      toast.info("Đã từ chối lời mời kết bạn");
    } catch (error) {
      toast.error("Không thể từ chối lời mời");
    }
  };

  const handleAcceptRelationshipRequest = async (requestId: string) => {
    try {
      setRelationshipRequestLoading(true);
      const { user: updatedUser, message } = await userService.acceptRelationshipRequest(requestId);
      if (updatedUser?._id && user?._id && updatedUser._id === user._id) {
        setUser(updatedUser);
      }
      setRelationshipReceivedList((prev) => prev.filter((item) => item._id !== requestId));
      toast.success(message || "Đã đồng ý lời mời hẹn hò");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể đồng ý lời mời hẹn hò");
    } finally {
      setRelationshipRequestLoading(false);
    }
  };

  const handleDeclineRelationshipRequest = async (requestId: string) => {
    try {
      setRelationshipRequestLoading(true);
      await userService.declineRelationshipRequest(requestId);
      setRelationshipReceivedList((prev) => prev.filter((item) => item._id !== requestId));
      toast.info("Đã từ chối lời mời hẹn hò");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể từ chối lời mời hẹn hò");
    } finally {
      setRelationshipRequestLoading(false);
    }
  };

  const handleOpenPostSettings = () => {
    setPostStep("settings");
  };

  const handleBackToComposer = () => {
    setPostStep("composer");
  };

  const handleFakeSettingAction = (title: string) => {
    toast.info(`${title} sẽ được nâng cấp ở bản tiếp theo`);
  };

  const handlePostFlowOpenChange = (open: boolean) => {
    setPostFlowOpen(open);

    if (!open) {
      setStoryMusicLibraryOpen(false);
      setPostStep("composer");
      setComposerMode("post");
      setPostIntent("normal");
      setPendingStoryType(null);
      setPendingStoryMusicId(null);

      // Radix Dialog may restore focus and cause an unexpected scroll jump.
      // Re-anchor viewport at top right after close lifecycle.
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
        setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 80);
      }
    }
  };

  return (
    <div
      className={cn("mx-auto w-full max-w-5xl space-y-4 px-3 py-3 sm:px-4")}
    >
      <div className="sticky top-0 z-20 overflow-hidden rounded-2xl border bg-background/95 shadow-md backdrop-blur">
        <div className="flex items-center justify-between gap-3 bg-gradient-primary px-3 sm:px-4 py-2.5">
          <button
            type="button"
            onClick={() => navigate("/messages")}
            className="text-2xl sm:text-3xl font-black leading-none tracking-tight text-primary-foreground"
            title="Về Mess nhắn tin"
          >
            HiChat
          </button>
          <div className="relative w-full max-w-[210px] sm:max-w-[250px] md:max-w-[290px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={friendSearchKeyword}
              onChange={(e) => setFriendSearchKeyword(e.target.value)}
              placeholder="Tìm kiếm bạn bè..."
              className="h-9 rounded-full border-white/35 bg-white pl-9 text-sm text-foreground placeholder:text-muted-foreground"
              onFocus={() => setSearchPanelOpen(true)}
              onClick={() => setSearchPanelOpen(true)}
            />
          </div>
        </div>
        <div className="grid grid-cols-5 border-t">
          <button
            type="button"
            onClick={handleHomeClick}
            className={cn(
              "flex h-11 items-center justify-center border-b-2 transition-colors",
              location.pathname === "/" || location.pathname === "/posts"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            title="Bảng tin"
          >
            <Home className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                localStorage.setItem(
                  LAST_SUGGESTIONS_OPENED_AT_KEY,
                  Date.now().toString()
                );
              }
              navigate("/suggestions");
            }}
            className={cn(
              "flex h-11 items-center justify-center border-b-2 transition-colors",
              location.pathname === "/suggestions"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            title="Gợi ý bạn bè"
          >
            <UsersRound className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/messages")}
            className={cn(
              "relative flex h-11 items-center justify-center border-b-2 transition-colors",
              location.pathname === "/messages"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            title="Tin nhắn"
          >
            <span className="relative inline-flex">
              <MessageCircle className="size-5" />
              {unreadMessageCount > 0 && (
                <span className="absolute -right-3 -top-2 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] leading-4 text-white">
                  {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                </span>
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              getAllFriendRequests();
              setNotificationOpen(true);
            }}
            className="relative flex h-11 items-center justify-center border-b-2 border-transparent text-muted-foreground transition-colors hover:text-foreground"
            title="Thông báo"
          >
            <span className="relative inline-flex">
              <Bell className="size-5" />
              {notificationCount > 0 && (
                <span className="absolute -right-3 -top-2 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] leading-4 text-white">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              )}
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-11 items-center justify-center border-b-2 border-transparent text-muted-foreground transition-colors hover:text-foreground"
                title="Menu"
              >
                <Menu className="size-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                Trang cá nhân
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                Cài đặt
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/archive")}>
                Kho lưu trữ
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" variant="destructive">
                <Logout />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="space-y-4">
        <Card className="border-border/40 shadow-sm">
          <CardContent className="space-y-4 p-3">
            <div className="flex items-center gap-3 rounded-2xl border bg-background p-3">
              <button
                type="button"
                onClick={handleGoToMyProfile}
                className="rounded-full"
                title="Vào trang cá nhân"
              >
                <Avatar className="h-11 w-11">
                  <AvatarImage src={user?.avatarUrl} alt={user?.displayName} />
                  <AvatarFallback>{user?.displayName?.charAt(0) || "U"}</AvatarFallback>
                </Avatar>
              </button>

              <button
                type="button"
                onClick={openPostComposer}
                className="flex-1 rounded-full bg-muted/70 px-4 py-2 text-left text-muted-foreground hover:bg-muted"
              >
                {userGivenName} ơi, bạn đang nghĩ gì thế?
              </button>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-emerald-500 hover:text-emerald-600"
                  onClick={() => openPostDialogWithAction("image")}
                >
                  <ImageIcon className="size-5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-pink-500 hover:text-pink-600"
                  onClick={() => openPostDialogWithAction("reel")}
                >
                  <Clapperboard className="size-5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/40 shadow-sm">
          <CardContent className="p-3">
            <div className="flex gap-3 overflow-x-auto pb-1">
              <div className="relative h-[228px] min-w-[132px] overflow-hidden rounded-2xl border bg-background">
                <button
                  type="button"
                  onClick={() => setStoryPickerOpen(true)}
                  className="group flex h-full w-full flex-col"
                  title="Tạo tin"
                >
                  <div className="relative h-[165px] bg-muted">
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.displayName}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl font-semibold text-muted-foreground">
                        {user?.displayName?.charAt(0) || "U"}
                      </div>
                    )}
                    <div className="absolute -bottom-5 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border-4 border-background bg-blue-600 text-white">
                      <Plus className="size-5" />
                    </div>
                  </div>
                  <div className="flex flex-1 items-end justify-center px-2 pb-3 text-center">
                    <span className="text-lg font-semibold">Tạo tin</span>
                  </div>
                </button>
              </div>

              {storyPreviewTiles.map((story) => (
                <button
                  key={story.id}
                  type="button"
                  className="group relative h-[228px] min-w-[132px] overflow-hidden rounded-2xl border text-left"
                  onClick={() => handleOpenStoryViewer(story.authorId, story.id)}
                  title={story.authorName}
                >
                  {story.previewUrl ? (
                    <img
                      src={story.previewUrl}
                      alt={story.authorName}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 px-3 text-center text-sm font-semibold text-white">
                      {story.contentSnippet || "Tin văn bản"}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/65" />
                  <Avatar className="absolute left-2 top-2 z-10 h-10 w-10 shrink-0 border-2 border-blue-500">
                    <AvatarImage src={story.avatarUrl ?? undefined} alt={story.authorName} />
                    <AvatarFallback>{story.authorName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <p className="absolute bottom-2 left-2 right-2 truncate text-sm font-semibold text-white">
                    {story.authorName}
                  </p>
                  <span className="absolute right-2 top-2 z-10 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
                    {story.storyType === "video" ? "Video" : story.storyType === "music" ? "Nhạc" : "Tin"}
                  </span>
                </button>
              ))}

              <button
                type="button"
                className="flex h-[228px] min-w-[52px] items-center justify-center rounded-2xl border bg-background text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/profile")}
                title="Xem thêm"
              >
                <ChevronRight className="size-6" />
              </button>
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={storyPickerOpen}
          onOpenChange={setStoryPickerOpen}
        >
          <DialogContent className="w-[calc(100vw-24px)] max-w-sm rounded-2xl p-0">
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle className="text-center text-lg font-bold">Chọn kiểu đăng tin</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 p-4">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-start text-base"
                onClick={() => handleSelectStoryType("text")}
              >
                1. Đăng văn bản
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-start text-base"
                onClick={() => handleSelectStoryType("music")}
              >
                <Music className="mr-2 size-4" />
                2. Nhạc
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-start text-base"
                onClick={() => handleSelectStoryType("video")}
              >
                <Clapperboard className="mr-2 size-4" />
                3. Video
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={storyMusicLibraryOpen}
          onOpenChange={setStoryMusicLibraryOpen}
        >
          <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-2xl p-0">
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle className="text-center text-lg font-bold">Kho nhạc</DialogTitle>
            </DialogHeader>
            <div className="max-h-[65vh] space-y-3 overflow-y-auto p-4">
              {STORY_MUSIC_LIBRARY.map((track) => (
                <div key={track.id} className="rounded-xl border p-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{track.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSelectStoryMusic(track.id)}
                    >
                      Chọn
                    </Button>
                  </div>
                  <audio controls className="w-full" src={track.previewUrl} />
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={storyViewerOpen}
          onOpenChange={(open) => {
            setStoryViewerOpen(open);
            if (!open) {
              setStoryViewerAuthorId(null);
              setStoryViewerIndex(0);
            }
          }}
        >
          <DialogContent className="h-[100dvh] w-[100vw] max-w-none border-0 bg-black p-0 text-white [&>button]:hidden">
            {activeStory && (
              <div className="relative flex h-full w-full flex-col">
                <div className="absolute left-4 top-3 z-20 flex max-w-[calc(100%-96px)] items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full bg-black/45 text-white hover:bg-black/60"
                    onClick={() => setStoryViewerOpen(false)}
                  >
                    <X className="size-5" />
                  </Button>
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar className="h-9 w-9 shrink-0 border border-white/30">
                      <AvatarImage
                        src={activeStory.avatarUrl ?? undefined}
                        alt={activeStory.authorName}
                      />
                      <AvatarFallback>{activeStory.authorName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold leading-none">
                        {activeStory.authorName}
                      </p>
                      <p className="truncate text-xs text-white/70">
                        {formatPostAgo(activeStory.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
                {canDeleteActiveStory && (
                  <div className="absolute right-4 top-3 z-20">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-full bg-black/45 text-white hover:bg-black/60"
                        >
                          <Ellipsis className="size-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={async () => {
                            await handleDeletePost(activeStory.id);
                            setStoryViewerOpen(false);
                          }}
                        >
                          <Trash2 className="mr-2 size-4" />
                          Xoá tin
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}

                <div className="absolute left-0 right-0 top-0 z-10 px-14 pt-3">
                  <div className="flex items-center gap-1">
                    {activeStoryGroup.map((story, idx) => (
                      <div
                        key={story.id}
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20"
                      >
                        <div
                          className="h-full rounded-full bg-white"
                          style={{
                            width:
                              idx < storyViewerIndex
                                ? "100%"
                                : idx === storyViewerIndex
                                  ? `${Math.round(storyProgress * 100)}%`
                                  : "0%",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-1 items-center justify-center p-10">
                  {activeStory.previewUrl && activeStory.storyType === "video" ? (
                    <video
                      ref={storyViewerVideoRef}
                      src={activeStory.previewUrl}
                      className="max-h-[82vh] w-auto max-w-[min(92vw,520px)] rounded-xl object-contain"
                      autoPlay
                      muted
                      playsInline
                      loop
                    />
                  ) : activeStory.previewUrl ? (
                    <img
                      src={activeStory.previewUrl}
                      alt={activeStory.authorName}
                      className="max-h-[82vh] w-auto max-w-[min(92vw,520px)] rounded-xl object-contain"
                    />
                  ) : (
                    <div className="flex h-[82vh] w-[min(92vw,520px)] flex-col items-center justify-center gap-5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 px-6 text-center text-3xl font-semibold">
                      <p>{activeStory.contentSnippet || "Tin văn bản"}</p>
                      {activeStory.storyType === "music" && activeStory.musicUrl && (
                        <div className="w-full max-w-sm rounded-2xl bg-black/30 p-4">
                          <p className="mb-1 text-base font-semibold">
                            {activeStory.musicTitle || "Bài nhạc đã chọn"}
                          </p>
                          <p className="mb-3 text-sm text-white/80">
                            {activeStory.musicArtist || "HiChat Library"}
                          </p>
                          <audio controls className="w-full" src={activeStory.musicUrl} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute left-5 top-1/2 h-14 w-14 -translate-y-1/2 rounded-full bg-white/20 text-white hover:bg-white/30"
                  onClick={handleStoryPrev}
                  disabled={activeStoryGroup.length === 0}
                >
                  <ChevronLeft className="size-8" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-5 top-1/2 h-14 w-14 -translate-y-1/2 rounded-full bg-white/20 text-white hover:bg-white/30"
                  onClick={handleStoryNext}
                  disabled={activeStoryGroup.length === 0}
                >
                  <ChevronRight className="size-8" />
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={postFlowOpen}
          onOpenChange={handlePostFlowOpenChange}
        >
          <DialogContent
            className={cn(
              "!fixed w-[calc(100vw-24px)] rounded-2xl p-0",
              postStep === "composer"
                ? composerMode === "story"
                  ? "max-w-md"
                  : "max-w-lg"
                : "max-w-md",
            )}
            onCloseAutoFocus={(event) => {
              // Prevent Radix from restoring focus to the opener (which can scroll page down).
              event.preventDefault();
              if (typeof window !== "undefined") {
                window.scrollTo({ top: 0, behavior: "auto" });
              }
            }}
          >
            {postStep === "composer" ? (
              <>
                <DialogHeader className="border-b px-3 py-2.5">
                  <DialogTitle className="text-center text-xl font-bold">
                    {composerMode === "story" ? "Tạo tin" : "Tạo bài viết"}
                  </DialogTitle>
                </DialogHeader>
                <div className={cn("space-y-3 p-4", composerMode === "story" && "min-h-[70vh]")}>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void appendFiles(e.target.files, "image");
                      e.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void appendFiles(e.target.files, "video");
                      e.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={reelInputRef}
                    type="file"
                    accept="video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void appendFiles(e.target.files, "reel");
                      e.currentTarget.value = "";
                    }}
                  />

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleGoToMyProfile}
                      className="rounded-full"
                      title="Vào trang cá nhân"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user?.avatarUrl} alt={user?.displayName} />
                        <AvatarFallback>{user?.displayName?.charAt(0) || "U"}</AvatarFallback>
                      </Avatar>
                    </button>
                    <div className="space-y-1">
                      <p className="text-base font-semibold">{userGivenName}</p>
                      <select
                        className="rounded-md border bg-muted px-2 py-1 text-sm"
                        value={visibility}
                        onChange={(e) => setVisibility(e.target.value as PostVisibility)}
                      >
                        <option value="public">Công khai</option>
                        <option value="custom">Riêng tư</option>
                        <option value="only_me">Chỉ mình tôi</option>
                      </select>
                    </div>
                  </div>

                  <Textarea
                    ref={composerTextareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={
                      composerMode === "story"
                        ? "Viết nội dung tin..."
                        : `${userGivenName} ơi, bạn đang nghĩ gì thế?`
                    }
                    rows={composerMode === "story" ? 10 : 6}
                    className="resize-none border-0 px-0 text-base sm:text-lg leading-snug shadow-none focus-visible:ring-0"
                  />
                  {composerMode === "story" && pendingStoryType === "music" && (
                    <div className="rounded-xl border bg-muted/40 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">Bài nhạc đã chọn</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setStoryMusicLibraryOpen(true)}
                        >
                          Đổi nhạc
                        </Button>
                      </div>
                      {pendingStoryMusic ? (
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{pendingStoryMusic.title}</p>
                          <p className="text-xs text-muted-foreground">{pendingStoryMusic.artist}</p>
                          <audio controls className="mt-2 w-full" src={pendingStoryMusic.previewUrl} />
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Chưa chọn bài nhạc.</p>
                      )}
                    </div>
                  )}

                  {selectedAttachments.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedAttachments.map((item) => (
                        <div key={item.id} className="relative overflow-hidden rounded-xl border bg-muted/20">
                          {item.kind === "image" ? (
                            <img src={item.url} alt={item.name} className="h-32 w-full object-contain bg-muted/20" />
                          ) : (
                            <video src={item.url} className="h-32 w-full object-cover" controls />
                          )}
                          <button
                            type="button"
                            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                            onClick={() => removeSelectedAttachment(item.id)}
                          >
                            <X className="size-4" />
                          </button>
                          <p className="truncate px-2 py-1 text-xs text-muted-foreground">{item.name}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {visibility === "custom" && (
                    <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
                      <p className="text-sm font-medium">
                        Chọn người được xem ({selectedAllowedCount})
                      </p>
                      {friends.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Bạn chưa có bạn bè để chọn.
                        </p>
                      ) : (
                        <div className="max-h-32 space-y-2 overflow-auto">
                          {friends.map((friend) => (
                            <label key={friend._id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={allowedViewerIds.includes(friend._id)}
                                onChange={() => toggleAllowedViewer(friend._id)}
                              />
                              <span>{friend.displayName}</span>
                              <span className="text-muted-foreground">@{friend.username}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-xl border p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Thêm vào bài viết của bạn</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-md p-1 hover:bg-muted"
                          onClick={() => openPostDialogWithAction("image")}
                          title="Thêm ảnh"
                        >
                          <ImageIcon className="size-5 text-emerald-500" />
                        </button>
                        <button
                          type="button"
                          className="rounded-md p-1 hover:bg-muted"
                          onClick={() => openPostDialogWithAction("reel")}
                          title="Thêm reel"
                        >
                          <Clapperboard className="size-5 text-pink-500" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={handleOpenPostSettings}
                    disabled={creating}
                    className="w-full rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-90"
                  >
                    {creating ? "Đang xử lý..." : "Đăng"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <DialogHeader className="border-b px-4 py-3">
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={handleBackToComposer}
                    >
                      <ArrowLeft className="size-4" />
                    </Button>
                    <DialogTitle className="text-center text-lg font-bold">Cài đặt bài viết</DialogTitle>
                    <div className="w-9" />
                  </div>
                </DialogHeader>

                <div className="space-y-1 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setVisibility((prev) =>
                        prev === "public" ? "custom" : prev === "custom" ? "only_me" : "public"
                      );
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 hover:bg-muted/50"
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold">Đối tượng của bài viết</p>
                      <p className="text-xs text-muted-foreground">{visibilityLabel[visibility]}</p>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </button>

                  <div className="h-px bg-border" />

                  <button
                    type="button"
                    onClick={() => handleFakeSettingAction("Gắn thẻ và cộng tác")}
                    className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 hover:bg-muted/50"
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold">Gắn thẻ và cộng tác</p>
                      <p className="text-xs text-muted-foreground">Gắn thẻ mọi người trong bài viết.</p>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFakeSettingAction("Lựa chọn lịch đăng")}
                    className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 hover:bg-muted/50"
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold">Lựa chọn lịch đăng</p>
                      <p className="text-xs text-muted-foreground">Đăng ngay</p>
                    </div>
                    <Clock3 className="size-5 text-muted-foreground" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFakeSettingAction("Chia sẻ lên nhóm")}
                    className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 hover:bg-muted/50"
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold">Chia sẻ lên nhóm</p>
                      <p className="text-xs text-muted-foreground">Tiếp cận nhiều người hơn khi chia sẻ nhóm.</p>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFakeSettingAction("Kiếm tiền")}
                    className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 hover:bg-muted/50"
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold">Kiếm tiền</p>
                      <p className="text-xs text-muted-foreground">Kiếm tiền từ nội dung của bạn.</p>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </button>

                  <div className="flex items-center justify-between rounded-xl px-2 py-2.5">
                    <div className="text-left">
                      <p className="text-sm font-semibold">Quảng bá bài viết</p>
                      <p className="text-xs text-muted-foreground">Bật để mở quảng cáo sau khi đăng.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPromotePost((prev) => !prev)}
                      className={cn(
                        "relative h-8 w-14 rounded-full transition-colors",
                        promotePost ? "bg-primary" : "bg-muted-foreground/35"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-1 h-6 w-6 rounded-full bg-white transition-transform",
                          promotePost ? "left-7" : "left-1"
                        )}
                      />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t px-3 py-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 flex-1"
                    onClick={handleBackToComposer}
                  >
                    Lưu
                  </Button>
                  <Button
                    type="button"
                    className="h-9 flex-1 bg-blue-600 text-white hover:bg-blue-700"
                    onClick={handleSubmitPost}
                    disabled={creating}
                  >
                    {creating ? "Đang đăng..." : "Đăng"}
                  </Button>
                </div>
              </>
            )}

            {creating && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-2xl bg-background/80 backdrop-blur-[2px]">
                <Loader2 className="size-10 animate-spin text-primary" />
                <p className="text-xl font-semibold text-foreground">Đang đăng</p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!editingPost}
          onOpenChange={handleCloseEditPostDialog}
        >
          <DialogContent className="max-w-md rounded-2xl p-0">
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle className="text-center text-lg font-bold">Sửa bài viết</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 p-4">
              <input
                ref={editImageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  appendEditingFiles(event.target.files, "image");
                  event.currentTarget.value = "";
                }}
              />
              <input
                ref={editVideoInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  appendEditingFiles(event.target.files, "video");
                  event.currentTarget.value = "";
                }}
              />

              <Textarea
                value={editingContent}
                onChange={(event) => setEditingContent(event.target.value)}
                placeholder="Nhập nội dung bài viết"
                rows={6}
                className="resize-none"
              />

              <div className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Ảnh/Video bài viết</p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => editImageInputRef.current?.click()}
                    >
                      <ImageIcon className="mr-1 size-4 text-emerald-500" />
                      Thêm ảnh
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => editVideoInputRef.current?.click()}
                    >
                      <Clapperboard className="mr-1 size-4 text-pink-500" />
                      Thêm video
                    </Button>
                  </div>
                </div>

                {editingExistingMedia.length === 0 && editingNewAttachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Chưa có ảnh/video.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {editingExistingMedia.map((item) => (
                      <div key={`existing-${item.url}`} className="relative overflow-hidden rounded-xl border bg-muted/20">
                        {item.type === "image" ? (
                          <img src={item.url} alt="existing-post-media" className="h-28 w-full object-contain bg-muted/20" />
                        ) : (
                          <video src={item.url} className="h-28 w-full object-cover" controls preload="metadata" />
                        )}
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                          onClick={() => removeEditingExistingMedia(item.url)}
                          title="Xoá media này"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                    {editingNewAttachments.map((item) => (
                      <div key={item.id} className="relative overflow-hidden rounded-xl border bg-muted/20">
                        {item.kind === "image" ? (
                          <img src={item.url} alt={item.name} className="h-28 w-full object-contain bg-muted/20" />
                        ) : (
                          <video src={item.url} className="h-28 w-full object-cover" controls preload="metadata" />
                        )}
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                          onClick={() => removeEditingAttachment(item.id)}
                          title="Bỏ file mới"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">Quyền xem</p>
                <select
                  className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                  value={editingVisibility}
                  onChange={(event) => setEditingVisibility(event.target.value as PostVisibility)}
                >
                  <option value="public">Công khai</option>
                  <option value="custom">Riêng tư</option>
                  <option value="only_me">Chỉ mình tôi</option>
                </select>
              </div>

              {editingVisibility === "custom" && (
                <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
                  <p className="text-sm font-medium">
                    Chọn người được xem ({editingAllowedViewerIds.length})
                  </p>
                  {friends.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Bạn chưa có bạn bè để chọn.</p>
                  ) : (
                    <div className="max-h-36 space-y-2 overflow-auto">
                      {friends.map((friend) => (
                        <label key={friend._id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editingAllowedViewerIds.includes(friend._id)}
                            onChange={() => toggleEditingAllowedViewer(friend._id)}
                          />
                          <span>{friend.displayName}</span>
                          <span className="text-muted-foreground">@{friend.username}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleCloseEditPostDialog(false)}
                  disabled={updatingPost}
                >
                  Huỷ
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                  onClick={handleSubmitEditPost}
                  disabled={updatingPost}
                >
                  {updatingPost ? "Đang lưu..." : "Lưu"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="space-y-3">
          {feedLoading ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Đang tải bảng tin...
              </CardContent>
            </Card>
          ) : visibleFeedPosts.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Chưa có bài viết nào phù hợp quyền xem.
              </CardContent>
            </Card>
          ) : (
            visibleFeedPosts.map((post, index) => (
              <div key={post._id} className="space-y-3">
                {shouldRenderInlineSuggestions && index === 2 && (
                  <Card className="overflow-hidden border-border/40 shadow-sm">
                    <CardContent className="p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <UsersRound className="size-5 text-muted-foreground" />
                          <h3 className="text-xl font-semibold">Những người bạn có thể biết</h3>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (typeof window !== "undefined") {
                              localStorage.setItem(
                                LAST_SUGGESTIONS_OPENED_AT_KEY,
                                Date.now().toString()
                              );
                            }
                            navigate("/suggestions");
                          }}
                        >
                          Xem tất cả
                        </Button>
                      </div>

                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {inlineSuggestions.map((suggestion) => (
                          <div
                            key={suggestion._id}
                            className="min-w-[210px] max-w-[210px] overflow-hidden rounded-2xl border bg-background"
                          >
                            <div className="relative h-[170px] bg-muted">
                              <button
                                type="button"
                                className="h-full w-full"
                                onClick={() => openUserProfile(suggestion._id)}
                                title="Xem trang cá nhân"
                              >
                                {suggestion.avatarUrl ? (
                                  <img
                                    src={suggestion.avatarUrl}
                                    alt={suggestion.displayName || suggestion.username || "user"}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-muted-foreground">
                                    {(suggestion.displayName || suggestion.username || "U")
                                      .charAt(0)
                                      .toUpperCase()}
                                  </div>
                                )}
                              </button>
                              <button
                                type="button"
                                className="absolute right-2 top-2 rounded-full bg-black/45 p-1.5 text-white hover:bg-black/60"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDismissInlineSuggestion(suggestion._id);
                                }}
                                title="Ẩn gợi ý"
                              >
                                <X className="size-4" />
                              </button>
                            </div>

                            <div className="space-y-2 p-3">
                              <button
                                type="button"
                                className="block w-full truncate text-left text-lg font-semibold hover:underline"
                                onClick={() => openUserProfile(suggestion._id)}
                              >
                                {suggestion.displayName || suggestion.username || "Người dùng"}
                              </button>
                              <p className="text-sm text-muted-foreground">
                                {(suggestion.mutualCount ?? 0) > 0
                                  ? `${suggestion.mutualCount} bạn chung`
                                  : "Có thể bạn đã từng biết"}
                              </p>
                              <Button
                                type="button"
                                className="w-full"
                                onClick={() => handleSendInlineSuggestionRequest(suggestion._id)}
                              >
                                <UserPlus className="mr-2 size-4" />
                                Thêm bạn bè
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="overflow-hidden border-border/40 shadow-sm">
                <CardContent className="p-0">
                  <div className="px-4 pt-3 pb-2">
                    {/** Friend posts use a more compact author header style. */}
                    {(() => {
                      const authorId = post.author._id?.toString();
                      const isOwnPost = !!currentUserId && authorId === currentUserId;
                      const isFriendPostAuthor = !!authorId && friendIdSet.has(authorId);
                      const canExpandPost = (post.content || "").trim().length > POST_PREVIEW_MAX_CHARS;
                      const isPostExpanded = expandedPostIdSet.has(post._id);
                      return (
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        className="flex items-center gap-3 text-left"
                        onClick={() => openUserProfile(post.author._id)}
                      >
                        <Avatar
                          className={cn(
                            "border-2 border-primary/30",
                            isFriendPostAuthor ? "h-10 w-10" : "h-11 w-11"
                          )}
                        >
                          <AvatarImage src={post.author.avatarUrl ?? undefined} alt={post.author.displayName} />
                          <AvatarFallback>
                            {post.author.displayName?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <CardTitle
                            className={cn(
                              "leading-none hover:underline",
                              isFriendPostAuthor ? "text-base sm:text-lg" : "text-lg sm:text-xl"
                            )}
                          >
                            {post.author.displayName}
                          </CardTitle>
                          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                            <span>{formatPostAgo(post.createdAt)}</span>
                            <span>·</span>
                            {isFriendPostAuthor && <UsersRound className="size-3.5" />}
                            {isFriendPostAuthor && <span>Bạn bè</span>}
                            {isFriendPostAuthor && <span>·</span>}
                            {visibilityIcon[post.visibility]}
                          </p>
                        </div>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" size="icon" variant="ghost" className="text-muted-foreground">
                            <Ellipsis className="size-6" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isOwnPost ? (
                            <>
                              <DropdownMenuItem onClick={() => openEditPostDialog(post)}>
                                <Pencil className="mr-2 size-4" />
                                Sửa bài đăng
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => handleDeletePost(post._id)}
                                disabled={!!deletingMap[post._id]}
                              >
                                <Trash2 className="mr-2 size-4" />
                                {deletingMap[post._id] ? "Đang xoá..." : "Xoá bài đăng"}
                              </DropdownMenuItem>
                            </>
                          ) : canExpandPost ? (
                            <DropdownMenuItem onClick={() => togglePostExpanded(post._id)}>
                              {isPostExpanded ? "Không hiện thêm" : "Hiện thêm"}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem disabled>
                              Không có thêm nội dung
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                      );
                    })()}

                    {(() => {
                      const rawContent = post.content?.trim() || "";
                      if (!rawContent) return null;

                      const canExpandPost = rawContent.length > POST_PREVIEW_MAX_CHARS;
                      const isPostExpanded = expandedPostIdSet.has(post._id);
                      const visibleContent =
                        canExpandPost && !isPostExpanded
                          ? `${rawContent.slice(0, POST_PREVIEW_MAX_CHARS).trimEnd()}...`
                          : rawContent;

                      return (
                        <>
                          <p className="mt-3 whitespace-pre-wrap text-base leading-snug sm:text-lg">{visibleContent}</p>
                          {canExpandPost && (
                            <button
                              type="button"
                              className="mt-1 text-sm font-medium text-primary hover:underline"
                              onClick={() => togglePostExpanded(post._id)}
                            >
                              {isPostExpanded ? "Không hiện thêm" : "Hiện thêm"}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {post.sharedPost && (
                    <div className="mx-4 mb-3 overflow-hidden rounded-2xl border">
                      <div className="px-3 py-2">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left"
                          onClick={() => openUserProfile(post.sharedPost?.author?._id)}
                        >
                          <Avatar className="h-9 w-9 border border-border/60">
                            <AvatarImage
                              src={post.sharedPost.author.avatarUrl ?? undefined}
                              alt={post.sharedPost.author.displayName}
                            />
                            <AvatarFallback>
                              {post.sharedPost.author.displayName?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm sm:text-base font-semibold leading-none hover:underline">
                              {post.sharedPost.author.displayName}
                            </p>
                            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                              <span>{formatPostAgo(post.sharedPost.createdAt)}</span>
                              <span>·</span>
                              {visibilityIcon[post.sharedPost.visibility]}
                            </p>
                          </div>
                        </button>
                        {post.sharedPost.content?.trim() ? (
                          <p className="mt-2 whitespace-pre-wrap text-lg leading-snug">
                            {post.sharedPost.content}
                          </p>
                        ) : null}
                      </div>

                      {post.sharedPost.isUnavailable ? (
                        <div className="border-t bg-muted/30 p-4 text-sm text-muted-foreground">
                          Bài viết gốc hiện không còn khả dụng hoặc bạn không có quyền xem.
                        </div>
                      ) : (
                        (post.sharedPost.media || []).length > 0 && (
                          <div className="space-y-1 border-t">
                            {(post.sharedPost.media || []).map((item, index) => (
                              <div
                                key={`${post.sharedPost?._id}-${item.url}-${index}`}
                                className="overflow-hidden bg-muted/20"
                              >
                                {item.type === "image" ? (
                                  <img
                                    src={item.url}
                                    alt="shared-post-media"
                                    className="max-h-[520px] w-full object-contain bg-muted/20"
                                  />
                                ) : (
                                  <video
                                    ref={createFeedVideoRef(
                                      `shared-${post._id}-${post.sharedPost?._id || "post"}-${index}`
                                    )}
                                    src={item.url}
                                    className="max-h-[520px] w-full object-cover"
                                    controls
                                    muted
                                    playsInline
                                    loop
                                    preload="metadata"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {(post.media || []).length > 0 && (
                    <div className="space-y-1">
                      {(post.media || []).map((item, index) => (
                        <div key={`${post._id}-${item.url}-${index}`} className="overflow-hidden bg-muted/20">
                          {item.type === "image" ? (
                            <img src={item.url} alt="post-media" className="max-h-[520px] w-full object-contain bg-muted/20" />
                          ) : (
                            <video
                              ref={createFeedVideoRef(`post-${post._id}-${index}`)}
                              src={item.url}
                              className="max-h-[520px] w-full object-cover"
                              controls
                              muted
                              playsInline
                              loop
                              preload="metadata"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t px-4 py-3">
                    {post.sharedPost ? (
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <span>Không có thông tin chi tiết để hiển thị</span>
                        <Info className="size-4" />
                      </p>
                    ) : (
                      <button type="button" className="text-base font-medium text-blue-700 hover:underline">
                        Xem thông tin chi tiết
                      </button>
                    )}
                    <Button
                      type="button"
                      className="h-10 rounded-xl bg-blue-600 px-4 text-sm text-white hover:bg-blue-700"
                    >
                      Tạo quảng cáo
                    </Button>
                  </div>

                  <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      {(() => {
                        const reactionCounts = post.reactionCounts || {};
                        const topReactionTypes = REACTION_ORDER
                          .map((type) => ({
                            type,
                            count: reactionCounts[type] ?? 0,
                          }))
                          .filter((item) => item.count > 0)
                          .sort((a, b) => b.count - a.count)
                          .slice(0, 3)
                          .map((item) => item.type);

                        return (
                          <div className="flex items-center -space-x-1">
                            {topReactionTypes.length > 0 ? (
                              topReactionTypes.map((type) => (
                                <span
                                  key={`${post._id}-${type}`}
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-background text-xs ring-1 ring-border"
                                  title={REACTION_META[type].label}
                                >
                                  {REACTION_META[type].emoji}
                                </span>
                              ))
                            ) : (
                              <span className="inline-flex items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-xs text-white">
                                👍
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <span>{post.likeCount ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span>{post.commentCount ?? 0} bình luận</span>
                      <span>{post.shareCount ?? 0} chia sẻ</span>
                    </div>
                  </div>

                  <div className="border-t px-2 py-1">
                    <div className="grid grid-cols-3 gap-1">
                      {(() => {
                        const currentReaction = post.myReaction ?? null;
                        return (
                      <div className="relative" data-reaction-picker-root="true">
                        {reactionPickerPostId === post._id && (
                          <div className="absolute -top-14 left-0 z-20 flex items-center gap-1 rounded-full border bg-background px-2 py-1 shadow-lg">
                            {REACTION_ORDER.map((reaction) => (
                              <button
                                key={`${post._id}-${reaction}`}
                                type="button"
                                className="text-2xl transition-transform hover:scale-125"
                                title={REACTION_META[reaction].label}
                                onClick={() => handleSelectReaction(post._id, reaction)}
                              >
                                {REACTION_META[reaction].emoji}
                              </button>
                            ))}
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          className={cn(
                            "h-10 w-full justify-center gap-2 text-sm",
                            post.isLiked
                              ? REACTION_META[currentReaction ?? "like"].activeClass
                              : "text-muted-foreground"
                          )}
                          onMouseDown={() => handleReactionPressStart(post._id)}
                          onMouseUp={handleReactionPressEnd}
                          onMouseLeave={handleReactionPressEnd}
                          onTouchStart={() => handleReactionPressStart(post._id)}
                          onTouchEnd={handleReactionPressEnd}
                          onClick={() => handleLikeButtonClick(post._id, currentReaction)}
                          disabled={!!likingMap[post._id]}
                        >
                          {post.isLiked ? (
                            <span className="text-lg">
                              {REACTION_META[currentReaction ?? "like"].emoji}
                            </span>
                          ) : (
                            <ThumbsUp className="size-5" />
                          )}
                          {post.isLiked
                            ? REACTION_META[currentReaction ?? "like"].label
                            : "Thích"}
                        </Button>
                      </div>
                        );
                      })()}
                      <Button
                        variant="ghost"
                        className="h-10 justify-center gap-2 text-sm text-muted-foreground"
                        onClick={() => toggleCommentSection(post._id)}
                      >
                        <MessageCircle className="size-5" />
                        Bình luận{typeof post.commentCount === "number" ? ` (${post.commentCount})` : ""}
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-10 justify-center gap-2 text-sm text-muted-foreground"
                        onClick={() => handleSharePost(post._id)}
                        disabled={!!sharingMap[post._id]}
                      >
                        <Share2 className="size-5" />
                        {sharingMap[post._id] ? "Đang chia sẻ..." : "Chia sẻ"}
                      </Button>
                    </div>
                  </div>

                  {activeCommentPostId === post._id && (
                    <div className="border-t px-3 pb-3 pt-2 space-y-2">
                      <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                        {commentsLoadingMap[post._id] ? (
                          <p className="text-sm text-muted-foreground">Đang tải bình luận...</p>
                        ) : (commentsByPostId[post._id] || []).length === 0 ? (
                          <p className="text-sm text-muted-foreground">Chưa có bình luận nào.</p>
                        ) : (
                          (commentsByPostId[post._id] || []).map((comment) => (
                            <div key={comment._id} className="flex items-start gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarImage src={comment.author.avatarUrl ?? undefined} alt={comment.author.displayName} />
                                <AvatarFallback>{comment.author.displayName?.charAt(0) || "U"}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 rounded-xl bg-muted px-3 py-1.5">
                                <p className="text-xs font-medium">{comment.author.displayName}</p>
                                <p className="text-sm break-words">{comment.content}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {formatPostAgo(comment.createdAt)}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="flex items-center gap-2 rounded-full bg-muted/70 px-2 py-1.5">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.displayName} />
                          <AvatarFallback>{user?.displayName?.charAt(0) || "U"}</AvatarFallback>
                        </Avatar>
                        <Input
                          value={commentInputMap[post._id] || ""}
                          onChange={(e) =>
                            setCommentInputMap((prev) => ({ ...prev, [post._id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              submitComment(post._id);
                            }
                          }}
                          placeholder={`Bình luận dưới tên ${post.author.displayName}`}
                          className="h-9 rounded-full bg-background border-0"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-full"
                          onClick={() => submitComment(post._id)}
                          disabled={!!commentSubmittingMap[post._id]}
                        >
                          Gửi
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
                </Card>
              </div>
            ))
          )}
        </div>
      </div>

      <FriendRequestDialog
        open={friendRequestOpen}
        setOpen={setFriendRequestOpen}
      />

      <Dialog
        open={notificationOpen}
        onOpenChange={(open) => {
          setNotificationOpen(open);
          if (!open) setNotificationFilter("all");
        }}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-lg p-0 [&>button]:hidden">
          <DialogHeader className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-3xl font-bold">Thông báo</DialogTitle>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={markAllCenterNotificationsAsRead}
                  title="Đánh dấu tất cả đã đọc"
                >
                  <Ellipsis className="size-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => setNotificationOpen(false)}
                  title="Đóng"
                >
                  <X className="size-5" />
                </Button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNotificationFilter("all")}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold",
                  notificationFilter === "all"
                    ? "bg-primary/15 text-primary"
                    : "text-foreground hover:bg-muted"
                )}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => setNotificationFilter("unread")}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold",
                  notificationFilter === "unread"
                    ? "bg-primary/15 text-primary"
                    : "text-foreground hover:bg-muted"
                )}
              >
                Chưa đọc
              </button>
            </div>
          </DialogHeader>

          <div className="max-h-[72vh] space-y-2 overflow-y-auto px-4 py-3">
            {visibleNotifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có thông báo mới.</p>
            ) : (
              <>
                {freshNotifications.length > 0 && (
                  <>
                    <div className="mb-1 mt-1 flex items-center justify-between">
                      <p className="text-4 font-semibold">Mới</p>
                      <button
                        type="button"
                        className="text-sm font-medium text-primary"
                        onClick={() => setNotificationFilter("all")}
                      >
                        Xem tất cả
                      </button>
                    </div>
                    {freshNotifications.map((item) => {
                      if (item.type === "friend_request") {
                        return (
                          <div key={item.id} className="rounded-xl border px-3 py-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={item.avatarUrl ?? undefined} alt={item.title} />
                                  <AvatarFallback>{item.title?.charAt(0) || "U"}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{item.title}</p>
                                  <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={friendRequestLoading}
                                  onClick={() => handleAcceptFriendRequest(item.requestId)}
                                >
                                  Chấp nhận
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={friendRequestLoading}
                                  onClick={() => handleDeclineFriendRequest(item.requestId)}
                                >
                                  Từ chối
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (item.type === "relationship_request") {
                        return (
                          <div key={item.id} className="rounded-xl border px-3 py-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={item.avatarUrl ?? undefined} alt={item.title} />
                                  <AvatarFallback>{item.title?.charAt(0) || "U"}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{item.title}</p>
                                  <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={relationshipRequestLoading}
                                  onClick={() => handleAcceptRelationshipRequest(item.requestId)}
                                >
                                  Đồng ý
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={relationshipRequestLoading}
                                  onClick={() => handleDeclineRelationshipRequest(item.requestId)}
                                >
                                  Từ chối
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (item.type === "center") {
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left hover:bg-muted/40"
                            onClick={() => {
                              markCenterNotificationAsRead(item.centerId);
                              if (item.conversationId) {
                                openConversationFromNotification(item.conversationId);
                                return;
                              }
                              if (item.postId) {
                                openPostFromNotification();
                                return;
                              }
                              setNotificationOpen(false);
                            }}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={item.avatarUrl ?? undefined} alt={item.title} />
                                <AvatarFallback>{item.title?.charAt(0) || "H"}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{item.title}</p>
                                <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                              </div>
                            </div>
                            {!item.centerRead ? (
                              <span className="h-3 w-3 rounded-full bg-blue-600" />
                            ) : null}
                          </button>
                        );
                      }

                      return null;
                    })}
                  </>
                )}

                {olderNotifications.length > 0 && (
                  <>
                    <p className="mt-3 text-4 font-semibold">Trước đó</p>
                    {olderNotifications.map((item) => {
                if (item.type === "friend_request") {
                  return (
                    <div key={item.id} className="rounded-xl border px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={item.avatarUrl ?? undefined} alt={item.title} />
                            <AvatarFallback>{item.title?.charAt(0) || "U"}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={friendRequestLoading}
                            onClick={() => handleAcceptFriendRequest(item.requestId)}
                          >
                            Chấp nhận
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={friendRequestLoading}
                            onClick={() => handleDeclineFriendRequest(item.requestId)}
                          >
                            Từ chối
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === "relationship_request") {
                  return (
                    <div key={item.id} className="rounded-xl border px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={item.avatarUrl ?? undefined} alt={item.title} />
                            <AvatarFallback>{item.title?.charAt(0) || "U"}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={relationshipRequestLoading}
                            onClick={() => handleAcceptRelationshipRequest(item.requestId)}
                          >
                            Đồng ý
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={relationshipRequestLoading}
                            onClick={() => handleDeclineRelationshipRequest(item.requestId)}
                          >
                            Từ chối
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === "center") {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left hover:bg-muted/40"
                      onClick={() => {
                        markCenterNotificationAsRead(item.centerId);
                        if (item.conversationId) {
                          openConversationFromNotification(item.conversationId);
                          return;
                        }
                        if (item.postId) {
                          openPostFromNotification();
                          return;
                        }
                        setNotificationOpen(false);
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={item.avatarUrl ?? undefined} alt={item.title} />
                          <AvatarFallback>{item.title?.charAt(0) || "H"}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                        </div>
                      </div>
                      {!item.centerRead && (
                        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                          Mới
                        </span>
                      )}
                    </button>
                  );
                }

                return null;
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={searchPanelOpen}
        onOpenChange={(open) => {
          setSearchPanelOpen(open);
          if (!open) {
            setFriendSearchKeyword("");
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-md p-0 [&>button]:hidden">
          <div className="border-b px-3 py-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setSearchPanelOpen(false)}
              >
                <ArrowLeft className="size-5" />
              </Button>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={friendSearchKeyword}
                  onChange={(e) => setFriendSearchKeyword(e.target.value)}
                  placeholder="Tìm kiếm bạn bè"
                  className="h-11 rounded-full bg-muted/80 pl-9"
                />
              </div>
            </div>
          </div>

          <div className="max-h-[68vh] overflow-y-auto px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xl font-semibold">Mới đây</h3>
              <button
                type="button"
                className="text-sm font-medium text-primary"
                onClick={() => setRecentSearches([])}
              >
                Chỉnh sửa
              </button>
            </div>

            {searchingFriend && friendSearchKeyword.trim().length >= 1 && (
              <p className="py-2 text-sm text-muted-foreground">Đang tìm...</p>
            )}

            <div className="space-y-1">
              {(friendSearchKeyword.trim().length >= 1
                ? filteredFriendResults
                : recentSearches
              ).map((item) => (
                <div key={item._id} className="flex items-center justify-between gap-3 rounded-xl p-2 hover:bg-muted/40">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => handleSelectSearchedUser(item)}
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={item.avatarUrl} alt={item.displayName} />
                      <AvatarFallback>
                        {item.displayName?.charAt(0) || item.username?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium">{item.displayName}</p>
                      <p className="truncate text-sm text-muted-foreground">@{item.username}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                        Có hoạt động mới
                      </p>
                    </div>
                  </button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRecentUser(item._id)}
                    className="text-muted-foreground"
                  >
                    <X className="size-5" />
                  </Button>
                </div>
              ))}
            </div>

            {!searchingFriend &&
              (friendSearchKeyword.trim().length >= 1
                ? filteredFriendResults.length === 0
                : recentSearches.length === 0) && (
                <div className="flex items-center gap-2 py-4 text-muted-foreground">
                  <Clock3 className="size-4" />
                  <p className="text-sm">Không có kết quả phù hợp.</p>
                </div>
              )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FeedView;
