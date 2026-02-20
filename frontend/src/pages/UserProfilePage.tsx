import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Cake,
  Camera,
  ChevronDown,
  Ellipsis,
  Globe,
  Heart,
  House,
  Info,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Download,
  Share2,
  ThumbsUp,
  Trash2,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { userService } from "@/services/userService";
import type { Friend, User } from "@/types/user";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ProfilePersonalInfoInlineForm from "@/components/profile/ProfilePersonalInfoInlineForm";
import AvatarUploader from "@/components/profile/AvatarUploader";
import { postService } from "@/services/postService";
import type { Post } from "@/types/post";
import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { friendService } from "@/services/friendService";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

type ProfileStats = {
  friendCount: number | null;
  mutualCount: number | null;
  previewAvatars: string[];
};

const formatPostAgo = (value: string) => {
  const createdAt = new Date(value).getTime();
  const diffMs = Date.now() - createdAt;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 2) return "Vừa xong";
  if (diffMin < 60) return `${diffMin} phút`;

  return new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDateVi = (value?: string) => {
  if (!value) return "Chưa cập nhật";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Chưa cập nhật";
  return parsed.toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
};

const relationshipLabel: Record<string, string> = {
  single: "Độc thân",
  in_relationship: "Đang hẹn hò",
  married: "Đã kết hôn",
  "": "Chưa cập nhật",
};
const contactVisibilityLabel: Record<"only_me" | "public" | "friends", string> = {
  only_me: "Một mình",
  public: "Mọi người",
  friends: "Bạn bè",
};

const UserProfilePage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: me, setUser } = useAuthStore();
  const isOwnProfileRoute = !userId;
  const [loading, setLoading] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [isFriend, setIsFriend] = useState(false);
  const [isMe, setIsMe] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [updatingBio, setUpdatingBio] = useState(false);
  const [activeSection, setActiveSection] = useState<"all" | "about" | "friends" | "photos">("all");
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [profileFriends, setProfileFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [likingMap, setLikingMap] = useState<Record<string, boolean>>({});
  const [sharingMap, setSharingMap] = useState<Record<string, boolean>>({});
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [updatingContactVisibility, setUpdatingContactVisibility] = useState(false);
  const [photoViewerItem, setPhotoViewerItem] = useState<{
    id: string;
    postId: string;
    url: string;
    createdAt: string;
  } | null>(null);
  const [photoActionLoading, setPhotoActionLoading] = useState(false);
  const [stats, setStats] = useState<ProfileStats>({
    friendCount: null,
    mutualCount: null,
    previewAvatars: [],
  });
  const { openDirectConversation } = useChatStore();
  const { addFriend } = useFriendStore();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const targetUserId = userId || me?._id;
      setProfileUser(null);
      setIsFriend(false);
      setIsMe(false);
      setEditingProfile(false);
      setEditingBio(false);
      setFriendRequestSent(false);
      setStats({
        friendCount: null,
        mutualCount: null,
        previewAvatars: [],
      });

      if (!targetUserId) return;
      setLoading(true);
      try {
        const res = await userService.getUserProfileById(targetUserId) as any;
        if (cancelled) return;

        setProfileUser(res.user);
        setIsFriend(res.isFriend);
        setIsMe(res.isMe);
        setFriendRequestSent(false);
        if (res.isMe && res.user) {
          setUser(res.user);
        }
        setStats({
          friendCount: res.friendCount ?? res.user?.friendCount ?? null,
          mutualCount: res.mutualCount ?? res.mutualFriendsCount ?? null,
          previewAvatars: (res.mutualFriends ?? [])
            .map((item: any) => item?.avatarUrl)
            .filter(Boolean)
            .slice(0, 7),
        });
      } catch (error) {
        console.error("Lỗi khi tải trang cá nhân", error);
        if (cancelled) return;
        setProfileUser(null);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [userId, me?._id, setUser]);

  useEffect(() => {
    const loadPosts = async () => {
      const targetUserId = userId || me?._id;
      setUserPosts([]);
      if (!targetUserId) return;

      try {
        const feed = await postService.getFeed(undefined, 50);
        const filtered = (feed.posts || []).filter(
          (post) => post.author._id.toString() === targetUserId.toString()
        );
        setUserPosts(filtered);
      } catch (error) {
        console.error("Lỗi khi tải bài viết người dùng", error);
        setUserPosts([]);
      }
    };

    loadPosts();
  }, [userId, me?._id]);

  useEffect(() => {
    const loadFriends = async () => {
      const targetUserId = userId || me?._id;
      setProfileFriends([]);
      if (!targetUserId) return;

      try {
        setFriendsLoading(true);
        const list = await userService.getUserFriendsById(targetUserId);
        setProfileFriends(list || []);
      } catch (error) {
        console.error("Lỗi khi tải danh sách bạn bè của user", error);
        setProfileFriends([]);
      } finally {
        setFriendsLoading(false);
      }
    };

    loadFriends();
  }, [userId, me?._id]);

  const currentUserInfo = isOwnProfileRoute ? (me || profileUser) : profileUser;
  const currentContactVisibility =
    (currentUserInfo?.contactInfoVisibility as "only_me" | "public" | "friends" | undefined) ||
    "friends";

  const handleOpenMessage = async () => {
    const targetUserId = currentUserInfo?._id;
    if (!targetUserId || !me?._id || targetUserId === me._id) {
      navigate("/messages");
      return;
    }

    const conversationId = await openDirectConversation(targetUserId);
    if (!conversationId) {
      toast.error("Không thể mở đoạn chat với người dùng này");
      return;
    }

    navigate("/messages");
  };

  const handlePickCover = () => {
    coverInputRef.current?.click();
  };

  const handleSendFriendRequest = async () => {
    if (!currentUserInfo?._id || isMe || isFriend || friendRequestSent) return;

    try {
      setFriendActionLoading(true);
      const resultMessage = await addFriend(currentUserInfo._id);
      setFriendRequestSent(true);
      toast.success(resultMessage || "Đã gửi lời mời kết bạn");
    } catch (error: any) {
      const message = error?.response?.data?.message || "Không thể gửi lời mời kết bạn";

      if (typeof message === "string" && message.includes("đang chờ")) {
        setFriendRequestSent(true);
        toast.info(message);
        return;
      }

      if (typeof message === "string" && message.includes("đã là bạn bè")) {
        setIsFriend(true);
        toast.info(message);
        return;
      }

      toast.error(message);
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleUnfriend = async () => {
    const targetId = currentUserInfo?._id;
    if (!targetId || isMe || !isFriend) return;

    const confirmed =
      typeof window !== "undefined"
        ? window.confirm("Bạn có chắc muốn hủy kết bạn với người này?")
        : true;

    if (!confirmed) return;

    try {
      setFriendActionLoading(true);
      const resultMessage = await friendService.removeFriend(targetId);
      setIsFriend(false);
      setFriendRequestSent(false);
      setStats((prev) => ({
        ...prev,
        friendCount:
          typeof prev.friendCount === "number" ? Math.max(prev.friendCount - 1, 0) : prev.friendCount,
        mutualCount: typeof prev.mutualCount === "number" ? 0 : prev.mutualCount,
        previewAvatars: [],
      }));
      toast.success(resultMessage || "Đã hủy kết bạn");
    } catch (error: any) {
      const message = error?.response?.data?.message || "Không thể hủy kết bạn";
      if (typeof message === "string" && message.includes("chưa là bạn bè")) {
        setIsFriend(false);
        setFriendRequestSent(false);
        toast.info(message);
        return;
      }
      toast.error(message);
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleFriendButtonClick = async () => {
    if (friendActionLoading) return;
    if (isFriend) {
      await handleUnfriend();
      return;
    }
    await handleSendFriendRequest();
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setCoverPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return preview;
    });
  };

  const handleLike = async (postId: string) => {
    if (likingMap[postId]) return;
    try {
      setLikingMap((prev) => ({ ...prev, [postId]: true }));
      const updated = await postService.toggleLike(postId);
      setUserPosts((prev) => prev.map((p) => (p._id === postId ? updated : p)));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể thích bài viết");
    } finally {
      setLikingMap((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleSharePost = async (postId: string) => {
    if (sharingMap[postId]) return;
    try {
      setSharingMap((prev) => ({ ...prev, [postId]: true }));
      await postService.sharePost(postId, { visibility: "public" });
      toast.success("Đã chia sẻ bài viết");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể chia sẻ bài viết");
    } finally {
      setSharingMap((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const openFriendProfile = (friendId: string) => {
    if (!friendId) return;
    navigate(`/users/${friendId}`);
  };

  const profilePhotoItems = useMemo(() => {
    const ownerId = currentUserInfo?._id?.toString();
    if (!ownerId) return [];

    return userPosts
      .filter((post) => post.author?._id?.toString() === ownerId)
      .flatMap((post) =>
        (post.media || [])
          .filter((item) => item.type === "image")
          .map((item, index) => ({
            id: `${post._id}-${item.url}-${index}`,
            postId: post._id,
            url: item.url,
            createdAt: post.createdAt,
          }))
      )
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [currentUserInfo?._id, userPosts]);

  const handleDownloadPhoto = async (url: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `hichat-photo-${Date.now()}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      if (typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      toast.info("Không tải trực tiếp được, đã mở ảnh ở tab mới.");
    }
  };

  const handleDeletePhoto = async () => {
    if (!photoViewerItem || !isMe) return;
    const targetPost = userPosts.find((post) => post._id === photoViewerItem.postId);
    if (!targetPost) {
      toast.error("Không tìm thấy bài viết chứa ảnh");
      return;
    }

    const media = targetPost.media || [];
    const keepMediaUrls = media
      .filter((item) => item.url !== photoViewerItem.url)
      .map((item) => item.url);
    const isPostEmptyAfterDelete = keepMediaUrls.length === 0 && !(targetPost.content || "").trim();
    if (isPostEmptyAfterDelete) {
      toast.warning("Không thể xoá ảnh cuối cùng của bài viết không có nội dung.");
      return;
    }

    try {
      setPhotoActionLoading(true);
      const updatedPost = await postService.updatePost(targetPost._id, {
        content: targetPost.content || "",
        visibility: targetPost.visibility,
        allowedViewerIds:
          targetPost.visibility === "custom"
            ? (targetPost.allowedViewerIds || []).map((id) => id.toString())
            : [],
        keepMediaUrls,
      });
      setUserPosts((prev) =>
        prev.map((post) => (post._id === targetPost._id ? updatedPost : post))
      );
      setPhotoViewerItem(null);
      toast.success("Đã xoá ảnh");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể xoá ảnh");
    } finally {
      setPhotoActionLoading(false);
    }
  };

  const handleToggleBioEditor = () => {
    setBioDraft(currentUserInfo?.bio ?? "");
    setEditingBio((prev) => !prev);
  };

  const handleSaveBio = async () => {
    if (!isMe) return;
    try {
      setUpdatingBio(true);
      const { user: updatedUser, message } = await userService.updateProfile({
        bio: bioDraft,
      });
      if (updatedUser?._id) {
        setUser(updatedUser);
        setProfileUser((prev) => (prev ? { ...prev, ...updatedUser } : updatedUser));
      }
      toast.success(message || "Đã cập nhật tiểu sử");
      setEditingBio(false);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể cập nhật tiểu sử");
    } finally {
      setUpdatingBio(false);
    }
  };

  const handleDeleteBio = async () => {
    if (!isMe) return;
    try {
      setUpdatingBio(true);
      const { user: updatedUser, message } = await userService.updateProfile({
        bio: "",
      });
      if (updatedUser?._id) {
        setUser(updatedUser);
        setProfileUser((prev) => (prev ? { ...prev, ...updatedUser } : updatedUser));
      }
      setBioDraft("");
      toast.success(message || "Đã xoá tiểu sử");
      setEditingBio(false);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể xoá tiểu sử");
    } finally {
      setUpdatingBio(false);
    }
  };

  const handleChangeContactVisibility = async (
    visibility: "only_me" | "public" | "friends"
  ) => {
    if (!isMe || !currentUserInfo?._id) return;
    if (currentContactVisibility === visibility) return;

    try {
      setUpdatingContactVisibility(true);
      const { user, message } = await userService.updateProfile({
        contactInfoVisibility: visibility,
      });
      setUser(user);
      setProfileUser((prev) => (prev ? { ...prev, ...user } : user));
      toast.success(message || "Đã cập nhật quyền xem thông tin liên hệ");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể cập nhật quyền xem");
    } finally {
      setUpdatingContactVisibility(false);
    }
  };

  return (
    <main className="min-h-screen bg-muted/40 p-3 sm:p-4">
      <div className="mx-auto max-w-5xl space-y-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-2 size-4" />
          Về trang chính
        </Button>

        <Card className="overflow-hidden border-border/50 p-0 shadow-sm">
          <div className="relative h-44 sm:h-52 md:h-56">
            <div
              className="h-full w-full bg-cover bg-center"
              style={{
                backgroundImage: coverPreviewUrl
                  ? `url(${coverPreviewUrl})`
                  : "linear-gradient(110deg, #0f172a 0%, #1d4ed8 45%, #f97316 100%)",
              }}
            />
            {isMe && (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute bottom-3 right-3 rounded-full"
                onClick={handlePickCover}
              >
                <Camera className="size-4" />
              </Button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleCoverChange}
            />
          </div>

          <CardContent className="space-y-4 p-3 sm:p-5">
            {loading && <div className="text-muted-foreground">Đang tải...</div>}

            {!loading && !profileUser && <div className="text-muted-foreground">Không tìm thấy người dùng.</div>}

            {!loading && currentUserInfo && (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="relative -mt-16 h-28 w-28 shrink-0 sm:-mt-20 sm:h-36 sm:w-36 md:h-40 md:w-40">
                      <Avatar className="h-full w-full border-4 border-background shadow-md">
                        <AvatarImage src={currentUserInfo.avatarUrl} alt={currentUserInfo.displayName} />
                        <AvatarFallback className="text-3xl sm:text-4xl">
                          {currentUserInfo.displayName?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      {isMe && <AvatarUploader />}
                    </div>

                    <div>
                      <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{currentUserInfo.displayName}</h1>
                      <p className="mt-1 text-sm sm:text-base text-muted-foreground">@{currentUserInfo.username}</p>
                      <p className="mt-2 text-base sm:text-lg font-medium">
                        <button
                          type="button"
                          className="hover:underline"
                          onClick={() => setActiveSection("friends")}
                        >
                          {stats.friendCount ?? 0} người bạn
                        </button>
                        <span className="mx-2">·</span>
                        {stats.mutualCount ?? 0} bạn chung
                      </p>
                      <p className="mt-2 text-sm sm:text-base text-muted-foreground">
                        {currentUserInfo.bio?.trim() || "Chưa có tiểu sử"}
                      </p>
                      <div className="mt-2 flex -space-x-2">
                        {stats.previewAvatars.length > 0
                          ? stats.previewAvatars.map((avatarUrl, index) => (
                              <Avatar key={`${avatarUrl}-${index}`} className="h-8 w-8 border-2 border-background sm:h-9 sm:w-9">
                                <AvatarImage src={avatarUrl} />
                                <AvatarFallback>U</AvatarFallback>
                              </Avatar>
                            ))
                          : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isMe ? (
                      <Button
                        variant={editingBio ? "secondary" : "default"}
                        className="h-10 px-4 text-sm"
                        onClick={handleToggleBioEditor}
                      >
                        {editingBio ? "Đóng sửa tiểu sử" : "Sửa thông tin cá nhân"}
                      </Button>
                    ) : (
                      <Button
                        variant={isFriend || friendRequestSent ? "secondary" : "outline"}
                        className="h-10 px-4 text-sm"
                        onClick={handleFriendButtonClick}
                        disabled={friendActionLoading || friendRequestSent}
                      >
                        {isFriend || friendRequestSent ? (
                          <UserCheck className="mr-2 size-4" />
                        ) : (
                          <UserPlus className="mr-2 size-4" />
                        )}
                        {friendActionLoading
                          ? "Đang xử lý..."
                          : isFriend
                            ? "Bạn bè"
                          : friendRequestSent
                            ? "Đã gửi lời mời"
                            : "Kết bạn"}
                      </Button>
                    )}
                    {!isMe && (
                      <Button className="h-10 px-4 text-sm bg-blue-600 hover:bg-blue-700" onClick={handleOpenMessage}>
                        <MessageCircle className="mr-2 size-4" />
                        Nhắn tin
                      </Button>
                    )}
                    <Button variant="secondary" size="icon" className="h-10 w-10">
                      <ChevronDown className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="ghost"
                      className={cn(
                        "rounded-none border-b-2",
                        activeSection === "all"
                          ? "border-blue-600 text-blue-600"
                          : "border-transparent text-muted-foreground"
                      )}
                      onClick={() => setActiveSection("all")}
                    >
                      Tất cả
                    </Button>
                    <Button
                      variant="ghost"
                      className={cn(
                        "rounded-none border-b-2",
                        activeSection === "about"
                          ? "border-blue-600 text-blue-600"
                          : "border-transparent text-muted-foreground"
                      )}
                      onClick={() => setActiveSection("about")}
                    >
                      Giới thiệu
                    </Button>
                    <Button
                      variant="ghost"
                      className={cn(
                        "rounded-none border-b-2",
                        activeSection === "friends"
                          ? "border-blue-600 text-blue-600"
                          : "border-transparent text-muted-foreground"
                      )}
                      onClick={() => setActiveSection("friends")}
                    >
                      Bạn bè
                    </Button>
                    <Button
                      variant="ghost"
                      className={cn(
                        "rounded-none border-b-2",
                        activeSection === "photos"
                          ? "border-blue-600 text-blue-600"
                          : "border-transparent text-muted-foreground"
                      )}
                      onClick={() => setActiveSection("photos")}
                    >
                      Ảnh
                    </Button>
                    <Button variant="ghost">Xem thêm</Button>
                    <Button variant="secondary" size="icon" className="ml-auto">
                      <Ellipsis className="size-4" />
                    </Button>
                  </div>
                </div>

                {isMe && editingBio && (
                  <Card className="border-border/30">
                    <CardHeader>
                      <CardTitle>Sửa tiểu sử</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea
                        rows={3}
                        value={bioDraft}
                        onChange={(event) => setBioDraft(event.target.value)}
                        placeholder="Viết tiểu sử của bạn"
                        className="resize-none"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          onClick={handleSaveBio}
                          disabled={updatingBio}
                        >
                          {updatingBio ? "Đang lưu..." : "Lưu tiểu sử"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleDeleteBio}
                          disabled={updatingBio}
                        >
                          Xoá tiểu sử
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isMe && editingProfile && (
                  <ProfilePersonalInfoInlineForm userInfo={currentUserInfo} />
                )}

                {activeSection === "friends" ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Danh sách bạn bè</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {friendsLoading ? (
                        <p className="text-sm text-muted-foreground">Đang tải danh sách bạn bè...</p>
                      ) : profileFriends.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Chưa có bạn bè nào để hiển thị.</p>
                      ) : (
                        profileFriends.map((friend) => (
                          <button
                            key={friend._id}
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted/40"
                            onClick={() => openFriendProfile(friend._id)}
                          >
                            <Avatar className="h-11 w-11">
                              <AvatarImage src={friend.avatarUrl} alt={friend.displayName} />
                              <AvatarFallback>
                                {friend.displayName?.charAt(0) || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{friend.displayName}</p>
                              <p className="truncate text-sm text-muted-foreground">@{friend.username}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </CardContent>
                  </Card>
                ) : activeSection === "photos" ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Ảnh</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {profilePhotoItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Chưa có ảnh nào.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {profilePhotoItems.map((photo) => (
                            <button
                              key={photo.id}
                              type="button"
                              className="overflow-hidden rounded-lg border bg-muted/20"
                              onClick={() => setPhotoViewerItem(photo)}
                            >
                              <img
                                src={photo.url}
                                alt="profile-photo"
                                className="h-40 w-full object-cover"
                                loading="lazy"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card className="lg:col-span-1">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle>Thông tin cá nhân</CardTitle>
                        {isMe && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setEditingProfile((prev) => !prev)}
                            title="Sửa thông tin cá nhân"
                          >
                            <Pencil className="size-4" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-start gap-3">
                        <MapPin className="mt-0.5 size-5 text-muted-foreground" />
                        <p className="text-foreground">
                          {currentUserInfo.currentCity || "Sống ở Chưa cập nhật"}
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <House className="mt-0.5 size-5 text-muted-foreground" />
                        <p className="text-foreground">
                          {currentUserInfo.hometown || "Từ Chưa cập nhật"}
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <Cake className="mt-0.5 size-5 text-muted-foreground" />
                        <p className="text-foreground">{formatDateVi(currentUserInfo.birthday)}</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <Heart className="mt-0.5 size-5 text-muted-foreground" />
                        <div>
                          <p className="text-foreground">
                            {currentUserInfo.relationshipStatus === "in_relationship" &&
                            currentUserInfo.relationshipPartner?.displayName
                              ? `Đang hẹn hò với ${currentUserInfo.relationshipPartner.displayName}`
                              : relationshipLabel[currentUserInfo.relationshipStatus || ""] ||
                                "Chưa cập nhật"}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-3 border-t pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xl font-semibold text-foreground">Thông tin liên hệ</p>
                          {isMe && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  title="Chỉnh quyền người có thể xem"
                                  disabled={updatingContactVisibility}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                  Chỉnh quyền người có thể xem
                                </div>
                                <DropdownMenuItem onClick={() => handleChangeContactVisibility("only_me")}>
                                  {currentContactVisibility === "only_me" ? "✓ " : ""}
                                  {contactVisibilityLabel.only_me}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleChangeContactVisibility("public")}>
                                  {currentContactVisibility === "public" ? "✓ " : ""}
                                  {contactVisibilityLabel.public}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleChangeContactVisibility("friends")}>
                                  {currentContactVisibility === "friends" ? "✓ " : ""}
                                  {contactVisibilityLabel.friends}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-start gap-3">
                            <Phone className="mt-0.5 size-5 text-muted-foreground" />
                            <p className="text-foreground">
                              Điện thoại: {currentUserInfo.phone || "Chưa cập nhật"}
                            </p>
                          </div>
                          <div className="flex items-start gap-3">
                            <Mail className="mt-0.5 size-5 text-muted-foreground" />
                            <p className="text-foreground">
                              Email: {currentUserInfo.email || "Chưa cập nhật"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Bài viết gần đây</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {userPosts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Chưa có bài viết nào.
                        </p>
                      ) : (
                        userPosts.slice(0, 5).map((post) => (
                          <Card key={post._id} className="overflow-hidden border-border/40 shadow-sm">
                            <CardContent className="p-0">
                              <div className="px-4 pt-3 pb-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-11 w-11 border-2 border-primary/25">
                                      <AvatarImage
                                        src={post.author.avatarUrl ?? undefined}
                                        alt={post.author.displayName}
                                      />
                                      <AvatarFallback>
                                        {post.author.displayName?.charAt(0) || "U"}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <CardTitle className="text-lg leading-none">
                                        {post.author.displayName}
                                      </CardTitle>
                                      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                                        <span>{formatPostAgo(post.createdAt)}</span>
                                        <span>·</span>
                                        <Globe className="size-3.5" />
                                      </p>
                                    </div>
                                  </div>
                                  <Button type="button" size="icon" variant="ghost" className="text-muted-foreground">
                                    <Ellipsis className="size-5" />
                                  </Button>
                                </div>

                                {post.content.trim() ? (
                                  <p className="mt-3 whitespace-pre-wrap text-base leading-6">
                                    {post.content}
                                  </p>
                                ) : null}
                              </div>

                              {post.sharedPost && (
                                <div className="mx-4 mb-3 overflow-hidden rounded-xl border">
                                  <div className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <Avatar className="h-8 w-8 border border-border/60">
                                        <AvatarImage
                                          src={post.sharedPost.author.avatarUrl ?? undefined}
                                          alt={post.sharedPost.author.displayName}
                                        />
                                        <AvatarFallback>
                                          {post.sharedPost.author.displayName?.charAt(0) || "U"}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <p className="text-sm font-semibold leading-none">
                                          {post.sharedPost.author.displayName}
                                        </p>
                                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                          <span>{formatPostAgo(post.sharedPost.createdAt)}</span>
                                          <span>·</span>
                                          <Globe className="size-3" />
                                        </p>
                                      </div>
                                    </div>
                                    {post.sharedPost.content?.trim() ? (
                                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                                        {post.sharedPost.content}
                                      </p>
                                    ) : null}
                                  </div>

                                  {post.sharedPost.isUnavailable ? (
                                    <div className="border-t bg-muted/30 p-3 text-sm text-muted-foreground">
                                      Bài viết gốc hiện không còn khả dụng.
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
                                                className="max-h-[320px] w-full object-contain bg-muted/20"
                                              />
                                            ) : (
                                              <video
                                                src={item.url}
                                                className="max-h-[320px] w-full object-cover"
                                                controls
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
                                    <div key={`${post._id}-${index}`} className="overflow-hidden bg-muted/20">
                                      {item.type === "image" ? (
                                        <img src={item.url} alt="post-media" className="max-h-[340px] w-full object-contain bg-muted/20" />
                                      ) : (
                                        <video src={item.url} className="max-h-[340px] w-full object-cover" controls />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center justify-between border-t px-4 py-3">
                                {post.sharedPost ? (
                                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <span>Không có thông tin chi tiết để hiển thị</span>
                                    <Info className="size-3.5" />
                                  </p>
                                ) : (
                                  <button type="button" className="text-sm font-medium text-blue-700 hover:underline">
                                    Xem thông tin chi tiết
                                  </button>
                                )}
                                <Button type="button" className="h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-700">
                                  Tạo quảng cáo
                                </Button>
                              </div>

                              <div className="border-t px-2 py-1">
                                <div className="grid grid-cols-3 gap-1">
                                  <Button
                                    variant="ghost"
                                    className={cn(
                                      "h-10 justify-center gap-2 text-sm",
                                      post.isLiked ? "text-primary" : "text-muted-foreground"
                                    )}
                                    onClick={() => handleLike(post._id)}
                                    disabled={!!likingMap[post._id]}
                                  >
                                    {post.isLiked ? (
                                      <Heart className="size-4 fill-current" />
                                    ) : (
                                      <ThumbsUp className="size-4" />
                                    )}
                                    {post.isLiked ? "Đã thích" : "Thích"}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    className="h-10 justify-center gap-2 text-sm text-muted-foreground"
                                    onClick={() => toast.info("Bình luận sẽ được cập nhật tiếp")}
                                  >
                                    <MessageCircle className="size-4" />
                                    Bình luận
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    className="h-10 justify-center gap-2 text-sm text-muted-foreground"
                                    onClick={() => handleSharePost(post._id)}
                                    disabled={!!sharingMap[post._id]}
                                  >
                                    <Share2 className="size-4" />
                                    {sharingMap[post._id] ? "Đang chia sẻ..." : "Chia sẻ"}
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
                )}

              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!photoViewerItem}
        onOpenChange={(open) => {
          if (!open) setPhotoViewerItem(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-4xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>Xem ảnh</DialogTitle>
              <div className="flex items-center gap-2">
                {photoViewerItem && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadPhoto(photoViewerItem.url)}
                    disabled={photoActionLoading}
                  >
                    <Download className="mr-1 size-4" />
                    Tải xuống
                  </Button>
                )}
                {isMe && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={handleDeletePhoto}
                    disabled={photoActionLoading || !photoViewerItem}
                  >
                    <Trash2 className="mr-1 size-4" />
                    {photoActionLoading ? "Đang xoá..." : "Xoá ảnh"}
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>
          {photoViewerItem ? (
            <div className="max-h-[75vh] overflow-auto bg-muted/30 p-2">
              <img
                src={photoViewerItem.url}
                alt="photo-viewer"
                className="mx-auto max-h-[72vh] w-auto max-w-full object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default UserProfilePage;
