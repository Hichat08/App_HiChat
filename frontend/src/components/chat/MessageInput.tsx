import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Camera, Clapperboard, Flame, Heart, HeartHandshake, ImagePlus, Mic, RefreshCw, Send, X } from "lucide-react";
import { Input } from "../ui/input";
import EmojiPicker from "./EmojiPicker";
import { useChatStore } from "@/stores/useChatStore";
import { toast } from "sonner";
import { chatService } from "@/services/chatService";
import { userService } from "@/services/userService";
import { useChatAppearanceStore } from "@/stores/useChatAppearanceStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type { RelationshipRequest } from "@/types/user";
import { useLocation } from "react-router";

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
  const { user, setUser } = useAuthStore();
  const location = useLocation();
  const quickReaction = useChatAppearanceStore((state) => state.quickReaction);
  const setQuickReaction = useChatAppearanceStore((state) => state.setQuickReaction);
  const {
    sendDirectMessage,
    sendGroupMessage,
    acceptDirectRequest,
    rejectDirectRequest,
    updateConversation,
  } = useChatStore();
  const [value, setValue] = useState("");
  const [requestActionLoading, setRequestActionLoading] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [pendingVideoUrl, setPendingVideoUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const recordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micErrorToastRef = useRef<string | number | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [cameraCaption, setCameraCaption] = useState("");
  const [datingDialogOpen, setDatingDialogOpen] = useState(false);
  const [sendingDatingRequest, setSendingDatingRequest] = useState(false);
  const [streakDialogOpen, setStreakDialogOpen] = useState(false);
  const [sendingStreakPrompt, setSendingStreakPrompt] = useState(false);
  const [streakResponding, setStreakResponding] = useState(false);
  const [selectedStreakType, setSelectedStreakType] = useState<"love" | "friends">("friends");
  const [showSuggestionActions, setShowSuggestionActions] = useState(true);
  const [relationshipReceived, setRelationshipReceived] = useState<RelationshipRequest[]>([]);
  const [relationshipSent, setRelationshipSent] = useState<RelationshipRequest[]>([]);
  const [relationshipActionLoading, setRelationshipActionLoading] = useState(false);
  const [lockedRecipientIncidentPrompt, setLockedRecipientIncidentPrompt] = useState<{
    targetUserId: string;
    displayName: string;
  } | null>(null);
  const [sendingLockedRecipientVote, setSendingLockedRecipientVote] = useState(false);
  const [lockedRecipientVoteAcknowledged, setLockedRecipientVoteAcknowledged] = useState(false);

  useEffect(() => {
    const state = location.state as { studyPrompt?: string } | null;
    const studyPrompt = state?.studyPrompt?.trim();
    if (!studyPrompt) return;
    setValue(studyPrompt);
  }, [location.key, location.state]);

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    setShowSuggestionActions(true);
    setLockedRecipientIncidentPrompt(null);
    setLockedRecipientVoteAcknowledged(false);
  }, [selectedConvo._id]);

  if (!user) return;

  const directRequest = selectedConvo.directRequest;
  const isPendingDirect =
    selectedConvo.type === "direct" && directRequest?.status === "pending";
  const isRejectedDirect =
    selectedConvo.type === "direct" && directRequest?.status === "rejected";
  const isBlockedDirect =
    selectedConvo.type === "direct" &&
    !!(selectedConvo.blockedByMe || selectedConvo.blockedByOther);
  const isRestrictedDirect =
    selectedConvo.type === "direct" &&
    !!(selectedConvo.restrictedByMe || selectedConvo.restrictedByOther);

  const isRequester =
    isPendingDirect && directRequest?.requesterId === user._id;
  const isResponder =
    isPendingDirect && directRequest?.responderId === user._id;

  const requesterMessageCount = directRequest?.requesterMessageCount ?? 0;
  const requestLimitReached = requesterMessageCount >= 3;
  const directOtherUser =
    selectedConvo.type === "direct"
      ? selectedConvo.participants.find((p) => p._id !== user._id) || null
      : null;
  const directOtherDisplayName =
    selectedConvo.type === "direct"
      ? (selectedConvo.nickname || directOtherUser?.displayName || "người dùng này")
      : "người dùng này";
  const isLockedDirect =
    selectedConvo.type === "direct" && !!directOtherUser?.isLocked;
  const incomingRelationshipRequest =
    selectedConvo.type === "direct" && directOtherUser?._id
      ? relationshipReceived.find((request) => request.from?._id === directOtherUser._id)
      : null;
  const outgoingRelationshipRequest =
    selectedConvo.type === "direct" && directOtherUser?._id
      ? relationshipSent.find((request) => request.to?._id === directOtherUser._id)
      : null;

  const canSendMessage =
    selectedConvo.type === "group" ||
    ((!isBlockedDirect && !isRestrictedDirect && !isLockedDirect) &&
      ((!isPendingDirect && !isRejectedDirect) || (isRequester && !requestLimitReached)));
  const isDirectThemed = selectedConvo.type === "direct";

  const streakSuggestionMap: Record<
    "love" | "friends",
    { label: string; icon: typeof Heart; prompt: string; themeId: string }
  > = {
    love: {
      label: "Chuỗi tình yêu",
      icon: Heart,
      prompt: "💖 Hôm nay mình giữ chuỗi yêu nhé? Kể mình 1 điều bạn biết ơn về tụi mình đi.",
      themeId: "rose",
    },
    friends: {
      label: "Chuỗi lửa",
      icon: Flame,
      prompt: "🔥 Giữ chuỗi lửa hôm nay nào! Kể mình nghe 1 chuyện vui trong ngày đi.",
      themeId: "ocean",
    },
  };
  const SelectedStreakIcon = streakSuggestionMap[selectedStreakType].icon;
  const streakStyleMap: Record<"love" | "friends", string> = {
    love: "from-rose-50 to-pink-100 text-rose-700",
    friends: "from-amber-50 to-orange-100 text-orange-700",
  };
  const streakCardStyleMap: Record<
    "love" | "friends",
    { card: string; chip: string; hint: string; icon: typeof Heart }
  > = {
    love: {
      card: "border-rose-200 bg-gradient-to-br from-rose-50 to-pink-100",
      chip: "bg-rose-100 text-rose-700",
      hint: "Giữ lửa tình cảm mỗi ngày bằng lời yêu thương.",
      icon: Heart,
    },
    friends: {
      card: "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100",
      chip: "bg-amber-100 text-amber-700",
      hint: "Điểm danh mỗi ngày để giữ chuỗi lửa thật đều.",
      icon: Flame,
    },
  };
  const streakMode = selectedConvo.type === "direct" ? selectedConvo.streakMode : undefined;
  const streakModeStatus = streakMode?.status || "none";
  const streakModeType = (streakMode?.type || "friends") as "love" | "dating" | "friends";
  const normalizedStreakModeType =
    streakModeType === "dating" ? "love" : (streakModeType as "love" | "friends");
  const streakVisual = streakCardStyleMap[normalizedStreakModeType];
  const StreakModeIcon = streakVisual.icon;
  const streakAcceptedSet = new Set(streakMode?.acceptedUserIds || []);
  const hasAcceptedStreak = !!user?._id && streakAcceptedSet.has(user._id);
  const streakWaitingForOther = streakModeStatus === "pending" && hasAcceptedStreak;
  const canRespondStreak = streakModeStatus === "pending" && !hasAcceptedStreak;
  const hasRelationship =
    user.relationshipStatus === "in_relationship" || !!user.relationshipPartner?._id;
  const hasRunningStreak = selectedConvo.type === "direct" && streakModeStatus !== "none";
  const canShowDatingSuggestion =
    selectedConvo.type === "direct" && !hasRelationship && !hasRunningStreak;
  const canShowStreakSuggestion =
    selectedConvo.type === "direct" && !hasRunningStreak;
  const canShowAnySuggestion = canShowDatingSuggestion || canShowStreakSuggestion;

  useEffect(() => {
    if (selectedConvo.type !== "direct") return;
    const modeType = selectedConvo.streakMode?.type;
    const modeStatus = selectedConvo.streakMode?.status || "none";
    const hasLoveStreak =
      (modeType === "love" || modeType === "dating") && modeStatus !== "none";
    const hasLoveTheme = selectedConvo.directThemeId === "rose";
    const shouldUseHeart = hasLoveTheme || hasLoveStreak;

    if (shouldUseHeart && quickReaction !== "❤️") {
      setQuickReaction("❤️");
    } else if (!shouldUseHeart && quickReaction === "❤️") {
      setQuickReaction("👍");
    }
  }, [
    quickReaction,
    selectedConvo.directThemeId,
    selectedConvo.streakMode?.status,
    selectedConvo.streakMode?.type,
    selectedConvo.type,
    setQuickReaction,
  ]);

  useEffect(() => {
    if (!canShowAnySuggestion) {
      setShowSuggestionActions(false);
    }
  }, [canShowAnySuggestion]);

  useEffect(() => {
    if (selectedConvo.type !== "direct" || !directOtherUser?._id || !isLockedDirect) {
      setLockedRecipientIncidentPrompt(null);
      setLockedRecipientVoteAcknowledged(false);
      return;
    }

    const hasVoted = !!selectedConvo.lockIncidentVote?.hasVoted;
    if (hasVoted) {
      setLockedRecipientIncidentPrompt(null);
      setLockedRecipientVoteAcknowledged(true);
      return;
    }

    setLockedRecipientVoteAcknowledged(false);
    setLockedRecipientIncidentPrompt({
      targetUserId: directOtherUser._id,
      displayName: directOtherUser.displayName || "người dùng này",
    });
  }, [
    directOtherUser?._id,
    directOtherUser?.displayName,
    isLockedDirect,
    selectedConvo.lockIncidentVote?.hasVoted,
    selectedConvo.type,
  ]);

  const loadRelationshipRequestsInChat = async () => {
    try {
      const result = await userService.getRelationshipRequests();
      setRelationshipReceived(result.received || []);
      setRelationshipSent(result.sent || []);
    } catch {
      setRelationshipReceived([]);
      setRelationshipSent([]);
    }
  };

  useEffect(() => {
    if (selectedConvo.type !== "direct") {
      setRelationshipReceived([]);
      setRelationshipSent([]);
      return;
    }

    let alive = true;
    const run = async () => {
      try {
        const result = await userService.getRelationshipRequests();
        if (!alive) return;
        setRelationshipReceived(result.received || []);
        setRelationshipSent(result.sent || []);
      } catch {
        if (!alive) return;
        setRelationshipReceived([]);
        setRelationshipSent([]);
      }
    };

    void run();
    const timer = setInterval(run, 12000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selectedConvo._id, selectedConvo.type]);

  const sendMessage = async (payload?: {
    content?: string;
    imgUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    ignorePendingImage?: boolean;
  }) => {
    if (!canSendMessage) return;
    const draftContent = payload?.content ?? value;
    const content = draftContent.trim();
    const imgUrl =
      payload?.ignorePendingImage ? payload?.imgUrl : payload?.imgUrl ?? pendingImageUrl ?? undefined;
    const videoUrl = payload?.videoUrl ?? pendingVideoUrl ?? undefined;
    const audioUrl = payload?.audioUrl;
    if (!content && !imgUrl && !audioUrl && !videoUrl) return;
    const currValue = value;
    const currPendingImageUrl = pendingImageUrl;
    const currPendingVideoUrl = pendingVideoUrl;
    setValue("");
    setPendingImageUrl(null);
    setPendingVideoUrl(null);

    try {
      if (selectedConvo.type === "direct") {
        const participants = selectedConvo.participants;
        const otherUser = participants.filter((p) => p._id !== user._id)[0];
        await sendDirectMessage(otherUser._id, content, imgUrl, audioUrl, videoUrl);
      } else {
        await sendGroupMessage(selectedConvo._id, content, imgUrl, audioUrl, videoUrl);
      }
    } catch (error: any) {
      console.error(error);
      const status = error?.response?.status;
      const code = error?.response?.data?.code;
      const recipient = error?.response?.data?.recipient;
      const lockIncidentVote = error?.response?.data?.lockIncidentVote;
      if (
        selectedConvo.type === "direct" &&
        status === 423 &&
        code === "RECIPIENT_LOCKED" &&
        recipient?._id
      ) {
        if (lockIncidentVote?.hasVoted) {
          setLockedRecipientIncidentPrompt(null);
          setLockedRecipientVoteAcknowledged(true);
        } else {
          setLockedRecipientIncidentPrompt({
            targetUserId: recipient._id,
            displayName: recipient.displayName || "người dùng này",
          });
        }
      }
      toast.error(
        error?.response?.data?.message || "Lỗi xảy ra khi gửi tin nhắn. Bạn hãy thử lại!"
      );
      setValue(currValue);
      setPendingImageUrl(currPendingImageUrl);
      setPendingVideoUrl(currPendingVideoUrl);
    }
  };

  const handleVoteLockedRecipientIncident = async (vote: "safe" | "suspicious") => {
    if (!lockedRecipientIncidentPrompt?.targetUserId) return;

    try {
      setSendingLockedRecipientVote(true);
      await chatService.voteLockedRecipientIncident(
        lockedRecipientIncidentPrompt.targetUserId,
        vote,
      );
      setLockedRecipientIncidentPrompt(null);
      setLockedRecipientVoteAcknowledged(true);
      updateConversation({
        ...selectedConvo,
        lockIncidentVote: {
          hasVoted: true,
          myVote: vote,
        },
      });
      toast.success("Đỗi ngũ đã tiếp nhận cảm ơn bạn đã hỗ trợ bộ phận xác minh.");
    } catch (error: any) {
      const message = error?.response?.data?.message || "Không thể gửi bình chọn lúc này";
      if (error?.response?.status === 409) {
        setLockedRecipientIncidentPrompt(null);
      }
      toast.error(message);
    } finally {
      setSendingLockedRecipientVote(false);
    }
  };

  const handleAcceptRequest = async () => {
    try {
      setRequestActionLoading(true);
      await acceptDirectRequest(selectedConvo._id);
      toast.success("Bạn đã chấp nhận yêu cầu tin nhắn");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể chấp nhận yêu cầu");
    } finally {
      setRequestActionLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    try {
      setRequestActionLoading(true);
      await rejectDirectRequest(selectedConvo._id);
      toast.success("Bạn đã từ chối yêu cầu tin nhắn");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể từ chối yêu cầu");
    } finally {
      setRequestActionLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSendLike = async () => {
    await sendMessage({ content: quickReaction || "👍" });
  };

  const handlePickImage = () => {
    if (!canSendMessage) return;
    imageInputRef.current?.click();
  };

  const handlePickVideo = () => {
    if (!canSendMessage) return;
    videoInputRef.current?.click();
  };

  const stopCameraStream = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  };

  const startCameraStream = async (facingMode: "user" | "environment") => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      setCameraStarting(true);
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      const actualFacing = stream.getVideoTracks?.()[0]?.getSettings?.().facingMode;
      if (actualFacing === "user" || actualFacing === "environment") {
        setCameraFacing(actualFacing);
      } else {
        setCameraFacing(facingMode);
      }
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
      }
      return true;
    } catch (error) {
      console.error("Không mở được camera", error);
      toast.error("Không thể mở camera. Vui lòng cấp quyền rồi thử lại.");
      return false;
    } finally {
      setCameraStarting(false);
    }
  };

  const handleOpenCamera = async () => {
    if (!canSendMessage) return;
    const started = await startCameraStream(cameraFacing);
    if (started) {
      setCameraCaption("");
      setCameraOpen(true);
      return;
    }
    cameraInputRef.current?.click();
  };

  const handleSwitchCamera = async () => {
    if (cameraStarting) return;
    const nextFacing = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(nextFacing);
    const started = await startCameraStream(nextFacing);
    if (!started) {
      toast.warning("Thiết bị không hỗ trợ đổi camera.");
    }
  };
  const IMAGE_EXTENSIONS = new Set([
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "avif",
    "bmp",
    "tif",
    "tiff",
    "jfif",
    "heic",
    "heif",
    "svg",
  ]);
  const getFileExtension = (filename: string) =>
    filename.split(".").pop()?.toLowerCase() || "";

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = getFileExtension(file.name);
    if (!file.type.startsWith("image/") && !IMAGE_EXTENSIONS.has(ext)) {
      toast.warning("Vui lòng chọn file ảnh");
      return;
    }
    try {
      setUploadingMedia(true);
      const uploaded = await chatService.uploadChatMedia(file);
      setPendingImageUrl(uploaded.url);
      setPendingVideoUrl(null);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể tải ảnh lên");
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.warning("Vui lòng chọn file video");
      return;
    }
    try {
      setUploadingMedia(true);
      const uploaded = await chatService.uploadChatMedia(file);
      if (uploaded.mediaType !== "video") {
        toast.warning("File không phải video hợp lệ");
        return;
      }
      setPendingVideoUrl(uploaded.url);
      setPendingImageUrl(null);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể tải video lên");
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.warning("Ảnh chụp không hợp lệ");
      return;
    }

    try {
      setUploadingMedia(true);
      const uploaded = await chatService.uploadChatMedia(file);
      setPendingImageUrl(uploaded.url);
      setPendingVideoUrl(null);
      if (cameraCaption.trim()) {
        setValue(cameraCaption.trim());
      }
      setCameraCaption("");
      setCameraOpen(false);
      stopCameraStream();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể tải ảnh chụp lên");
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleCaptureFromLiveCamera = async () => {
    const videoElement = cameraVideoRef.current;
    const canvasElement = cameraCanvasRef.current;
    if (!videoElement || !canvasElement) return;

    const width = videoElement.videoWidth;
    const height = videoElement.videoHeight;
    if (!width || !height) {
      toast.warning("Camera chưa sẵn sàng. Vui lòng thử lại.");
      return;
    }

    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    canvasElement.width = targetWidth;
    canvasElement.height = targetHeight;
    const context = canvasElement.getContext("2d");
    if (!context) {
      toast.error("Không thể chụp ảnh từ camera.");
      return;
    }

    // Keep selfie preview mirrored, but save uploaded photo in normal orientation.
    const streamFacing =
      cameraStreamRef.current?.getVideoTracks?.()[0]?.getSettings?.().facingMode;
    const shouldUnmirror = (streamFacing || cameraFacing) === "user";
    if (shouldUnmirror) {
      context.save();
      context.translate(targetWidth, 0);
      context.scale(-1, 1);
      context.drawImage(videoElement, 0, 0, targetWidth, targetHeight);
      context.restore();
    } else {
      context.drawImage(videoElement, 0, 0, targetWidth, targetHeight);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvasElement.toBlob(resolve, "image/jpeg", 0.82)
    );

    if (!blob) {
      toast.error("Không thể tạo ảnh chụp.");
      return;
    }

    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
    const localPreviewUrl = URL.createObjectURL(file);

    // Show preview immediately for snappy UX, upload continues in background.
    setPendingImageUrl(localPreviewUrl);
    setPendingVideoUrl(null);
    if (cameraCaption.trim()) {
      setValue(cameraCaption.trim());
    }
    setCameraCaption("");
    setCameraOpen(false);
    stopCameraStream();

    try {
      setUploadingMedia(true);
      const uploaded = await chatService.uploadChatMedia(file);
      setPendingImageUrl(uploaded.url);
      URL.revokeObjectURL(localPreviewUrl);
    } catch (error: any) {
      URL.revokeObjectURL(localPreviewUrl);
      setPendingImageUrl(null);
      toast.error(error?.response?.data?.message || "Không thể tải ảnh chụp lên");
    } finally {
      setUploadingMedia(false);
    }
  };

  const stopRecorderStream = () => {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  };

  const clearRecordTimeout = () => {
    if (recordTimeoutRef.current) {
      clearTimeout(recordTimeoutRef.current);
      recordTimeoutRef.current = null;
    }
  };

  const handleMicRecord = async () => {
    if (!canSendMessage) {
      if (isLockedDirect) {
        toast.warning("Không thể gửi tin nhắn vì tài khoản này đang bị khóa.");
        return;
      }
      if (isBlockedDirect) {
        toast.warning("Không thể gửi âm thanh do quan hệ chặn.");
        return;
      }
      if (isRestrictedDirect) {
        toast.warning("Không thể gửi âm thanh do quan hệ hạn chế.");
        return;
      }
      if (isPendingDirect && isResponder) {
        toast.warning("Bạn cần chấp nhận yêu cầu tin nhắn trước khi gửi âm thanh.");
        return;
      }
      if (isPendingDirect && isRequester && requestLimitReached) {
        toast.warning("Bạn đã đạt giới hạn 3 tin nhắn làm quen, hãy chờ đối phương chấp nhận.");
        return;
      }
      return;
    }

    if (uploadingMedia) return;

    if (recordingAudio && mediaRecorderRef.current) {
      clearRecordTimeout();
      mediaRecorderRef.current.stop();
      return;
    }

    const MediaRecorderApi = (window as any).MediaRecorder;
    const hasMediaRecorder = typeof MediaRecorderApi !== "undefined";
    const isSecureContextEnabled = typeof window !== "undefined" && window.isSecureContext;

    if (!hasMediaRecorder || !isSecureContextEnabled) {
      if (micErrorToastRef.current) {
        toast.dismiss(micErrorToastRef.current);
      }
      micErrorToastRef.current = toast.error(
        "Mic chưa hỗ trợ trên thiết bị/trình duyệt này. Hãy dùng localhost/https."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioChunksRef.current = [];
        clearRecordTimeout();
        stopRecorderStream();
        setRecordingAudio(false);

        if (!blob.size) return;

        const file = new File([blob], `voice-${Date.now()}.webm`, {
          type: blob.type || "audio/webm",
        });

        try {
          setUploadingMedia(true);
          const uploaded = await chatService.uploadChatMedia(file);
          const audioUrl = uploaded.url;
          // Gửi audio trực tiếp để tránh dính media đang chờ trong ô soạn.
          if (selectedConvo.type === "direct") {
            const participants = selectedConvo.participants;
            const otherUser = participants.filter((p) => p._id !== user._id)[0];
            await sendDirectMessage(otherUser._id, "", undefined, audioUrl);
          } else {
            await sendGroupMessage(selectedConvo._id, "", undefined, audioUrl);
          }
        } catch (error: any) {
          const status = error?.response?.status;
          const code = error?.response?.data?.code;
          const recipient = error?.response?.data?.recipient;
          const lockIncidentVote = error?.response?.data?.lockIncidentVote;
          if (
            selectedConvo.type === "direct" &&
            status === 423 &&
            code === "RECIPIENT_LOCKED" &&
            recipient?._id
          ) {
            if (lockIncidentVote?.hasVoted) {
              setLockedRecipientIncidentPrompt(null);
              setLockedRecipientVoteAcknowledged(true);
            } else {
              setLockedRecipientIncidentPrompt({
                targetUserId: recipient._id,
                displayName: recipient.displayName || "người dùng này",
              });
            }
          }
          toast.error(error?.response?.data?.message || "Không thể gửi âm thanh");
        } finally {
          setUploadingMedia(false);
        }
      };

      recorder.onerror = () => {
        clearRecordTimeout();
        stopRecorderStream();
        setRecordingAudio(false);
        toast.error("Không thể ghi âm. Vui lòng thử lại.");
      };

      recorder.start();
      setRecordingAudio(true);
      recordTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, 60000);
    } catch {
      clearRecordTimeout();
      stopRecorderStream();
      setRecordingAudio(false);
      toast.error("Không truy cập được microphone.");
    }
  };

  const handleSendDatingSuggestion = async () => {
    if (!directOtherUser?._id) return;
    if (sendingDatingRequest) return;
    if (user.relationshipStatus === "in_relationship" || user.relationshipPartner?._id) {
      toast.info("Bạn đang trong mối quan hệ, không thể gửi thêm lời mời hẹn hò.");
      return;
    }

    try {
      setSendingDatingRequest(true);
      const result = await userService.sendRelationshipRequest(directOtherUser._id);
      toast.success(result?.message || "Đã gửi gợi ý hẹn hò.");
      setDatingDialogOpen(false);
      setShowSuggestionActions(false);
      await loadRelationshipRequestsInChat();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể gửi gợi ý hẹn hò.");
    } finally {
      setSendingDatingRequest(false);
    }
  };

  const handleAcceptRelationshipInChat = async (requestId: string) => {
    try {
      setRelationshipActionLoading(true);
      const result = await userService.acceptRelationshipRequest(requestId);
      if (result?.user) {
        setUser(result.user);
      }
      toast.success(result?.message || "Đã đồng ý lời mời hẹn hò");
      await loadRelationshipRequestsInChat();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể đồng ý lời mời hẹn hò");
    } finally {
      setRelationshipActionLoading(false);
    }
  };

  const handleDeclineRelationshipInChat = async (requestId: string) => {
    try {
      setRelationshipActionLoading(true);
      const result = await userService.declineRelationshipRequest(requestId);
      toast.success(result?.message || "Đã từ chối lời mời hẹn hò");
      await loadRelationshipRequestsInChat();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể từ chối lời mời hẹn hò");
    } finally {
      setRelationshipActionLoading(false);
    }
  };

  const handleSendStreakPrompt = async () => {
    if (selectedConvo.type !== "direct" || !directOtherUser?._id || sendingStreakPrompt) return;

    try {
      setSendingStreakPrompt(true);
      const res = await chatService.requestDirectStreakMode(selectedConvo._id, selectedStreakType);
      updateConversation({
        _id: selectedConvo._id,
        streakMode: res.streakMode,
        ...(res.directThemeId ? { directThemeId: res.directThemeId } : {}),
      });
      toast.success(res.message || `Đã gửi gợi ý ${streakSuggestionMap[selectedStreakType].label.toLowerCase()}.`);
      setStreakDialogOpen(false);
      setShowSuggestionActions(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể gửi gợi ý chuỗi.");
    } finally {
      setSendingStreakPrompt(false);
    }
  };

  const handleAcceptStreakMode = async () => {
    if (selectedConvo.type !== "direct" || streakResponding) return;
    try {
      setStreakResponding(true);
      const res = await chatService.acceptDirectStreakMode(selectedConvo._id);
      updateConversation({
        _id: selectedConvo._id,
        streakMode: res.streakMode,
        ...(res.directThemeId ? { directThemeId: res.directThemeId } : {}),
        ...(typeof res.streakCount === "number" ? { streakCount: res.streakCount } : {}),
      });
      toast.success(res.message || "Đã xác nhận chuỗi.");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể xác nhận chuỗi.");
    } finally {
      setStreakResponding(false);
    }
  };

  const handleRejectStreakMode = async () => {
    if (selectedConvo.type !== "direct" || streakResponding) return;
    try {
      setStreakResponding(true);
      const res = await chatService.rejectDirectStreakMode(selectedConvo._id);
      updateConversation({
        _id: selectedConvo._id,
        streakMode: res.streakMode,
      });
      toast.info(res.message || "Đã từ chối đề nghị chuỗi.");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể từ chối đề nghị chuỗi.");
    } finally {
      setStreakResponding(false);
    }
  };

  return (
    <div style={isDirectThemed ? { backgroundColor: "var(--direct-chat-input-bg)" } : undefined}>
      {selectedConvo.type === "direct" && directOtherUser && canShowAnySuggestion && (
        <div
          className="border-t px-3 py-2"
          style={isDirectThemed ? { borderColor: "var(--direct-chat-input-border)" } : undefined}
        >
          {showSuggestionActions && canShowAnySuggestion ? (
            <div className="space-y-2">
              {canShowDatingSuggestion && (
                <button
                  type="button"
                  className="w-full rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 to-pink-100 px-3 py-2 text-left shadow-sm hover:brightness-[0.99]"
                  onClick={() => setDatingDialogOpen(true)}
                  disabled={sendingDatingRequest}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-rose-700">Gợi ý hẹn hò</p>
                      <p className="text-xs text-rose-600/90">
                        Gửi lời mời hẹn hò tới {directOtherDisplayName}
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-100 p-2 text-rose-700">
                      <HeartHandshake className="size-4" />
                    </span>
                  </div>
                </button>
              )}
              {canShowStreakSuggestion && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["love", "friends"] as const).map((type) => {
                    const style = streakCardStyleMap[type];
                    const Icon = style.icon;
                    return (
                      <button
                        key={type}
                        type="button"
                        className={`rounded-2xl border px-3 py-2 text-left shadow-sm transition hover:brightness-[0.99] ${style.card}`}
                        disabled={sendingStreakPrompt || !canSendMessage || streakModeStatus === "pending"}
                        onClick={() => {
                          setSelectedStreakType(type);
                          setStreakDialogOpen(true);
                        }}
                      >
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <span className={`rounded-full p-1.5 ${style.chip}`}>
                            <Icon className="size-3.5" />
                          </span>
                          <p className="text-xs font-semibold">{streakSuggestionMap[type].label}</p>
                        </div>
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">{style.hint}</p>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:bg-muted"
                  onClick={() => setShowSuggestionActions(false)}
                  title="Ẩn gợi ý"
                >
                  Ẩn gợi ý
                </Button>
              </div>
            </div>
          ) : canShowAnySuggestion ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:bg-muted"
              onClick={() => setShowSuggestionActions(true)}
            >
              Hiện gợi ý
            </Button>
          ) : null}
        </div>
      )}
      {selectedConvo.type === "direct" && incomingRelationshipRequest && (
        <div
          className="border-t border-b bg-rose-50/60 px-3 py-2"
          style={isDirectThemed ? { borderColor: "var(--direct-chat-input-border)" } : undefined}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-rose-700">
                {directOtherDisplayName} muốn hẹn hò với bạn
              </p>
              <p className="text-xs text-muted-foreground">
                Chấp nhận hoặc từ chối ngay trong cuộc trò chuyện.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={relationshipActionLoading}
                onClick={() => void handleDeclineRelationshipInChat(incomingRelationshipRequest._id)}
              >
                Từ chối
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={relationshipActionLoading}
                onClick={() => void handleAcceptRelationshipInChat(incomingRelationshipRequest._id)}
              >
                Chấp nhận
              </Button>
            </div>
          </div>
        </div>
      )}
      {selectedConvo.type === "direct" && !incomingRelationshipRequest && outgoingRelationshipRequest && (
        <div
          className="border-t border-b bg-amber-50/60 px-3 py-2"
          style={isDirectThemed ? { borderColor: "var(--direct-chat-input-border)" } : undefined}
        >
          <p className="text-sm font-medium text-amber-700">
            Đã gửi lời mời hẹn hò cho {directOtherDisplayName}.
          </p>
          <p className="text-xs text-muted-foreground">Đang chờ đối phương chấp nhận hoặc từ chối.</p>
        </div>
      )}
      {selectedConvo.type === "direct" && streakModeStatus === "pending" && (
        <div
          className={`border-t border-b px-3 py-2 ${streakVisual.card}`}
          style={isDirectThemed ? { borderColor: "var(--direct-chat-input-border)" } : undefined}
        >
          <div className="flex items-start gap-2">
            <span className={`mt-0.5 rounded-full p-1.5 ${streakVisual.chip}`}>
              <StreakModeIcon className="size-4" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                {(streakSuggestionMap[normalizedStreakModeType]?.label || "Chuỗi")}: đang chờ đồng ý
              </p>
              <p className="text-xs text-muted-foreground">
                {streakWaitingForOther
                  ? `Bạn đã đồng ý. Chờ ${directOtherDisplayName} xác nhận để bắt đầu chuỗi.`
                  : `${directOtherDisplayName} muốn bật ${(streakSuggestionMap[normalizedStreakModeType]?.label || "chuỗi").toLowerCase()}.`}
              </p>
            </div>
            <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold text-muted-foreground shadow-sm">
              Pending
            </span>
          </div>
          {canRespondStreak && (
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={streakResponding}
                onClick={handleRejectStreakMode}
              >
                Không đồng ý
              </Button>
              <Button
                type="button"
                size="sm"
                className={`${streakVisual.chip} border border-transparent hover:brightness-95`}
                disabled={streakResponding}
                onClick={handleAcceptStreakMode}
              >
                Đồng ý
              </Button>
            </div>
          )}
        </div>
      )}
      {isPendingDirect && (
        <div
          className="border-t border-b bg-muted/40 px-3 py-2"
          style={isDirectThemed ? { borderColor: "var(--direct-chat-input-border)" } : undefined}
        >
          {isResponder ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Người lạ muốn nhắn tin với bạn.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={requestActionLoading}
                  onClick={handleRejectRequest}
                >
                  Không chấp nhận
                </Button>
                <Button
                  size="sm"
                  disabled={requestActionLoading}
                  onClick={handleAcceptRequest}
                >
                  Chấp nhận
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tin nhắn làm quen: {requesterMessageCount}/3
              {requestLimitReached
                ? " (đã đạt giới hạn, chờ người kia chấp nhận)"
                : ""}
            </p>
          )}
        </div>
      )}

      {isRejectedDirect && (
        <div
          className="border-t border-b bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          style={isDirectThemed ? { borderColor: "var(--direct-chat-input-border)" } : undefined}
        >
          Người này đã từ chối yêu cầu tin nhắn. Bạn cần kết bạn để tiếp tục chat.
        </div>
      )}

      {isBlockedDirect && (
        <div
          className="border-t border-b bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          style={isDirectThemed ? { borderColor: "var(--direct-chat-input-border)" } : undefined}
        >
          {selectedConvo.blockedByMe
            ? "Bạn đã chặn người này. Bỏ chặn để tiếp tục nhắn tin."
            : "Bạn đã bị chặn trong cuộc trò chuyện này."}
        </div>
      )}

      {isRestrictedDirect && !isBlockedDirect && (
        <div
          className="border-t border-b bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          style={isDirectThemed ? { borderColor: "var(--direct-chat-input-border)" } : undefined}
        >
          {selectedConvo.restrictedByMe
            ? "Bạn đã hạn chế người này. Bỏ hạn chế để tiếp tục nhắn tin."
            : "Bạn đã bị hạn chế trong cuộc trò chuyện này."}
        </div>
      )}

      {isLockedDirect && !isBlockedDirect && !isRestrictedDirect && (
        <div
          className="border-t border-b bg-muted/40 px-3 py-2"
          style={isDirectThemed ? { borderColor: "var(--direct-chat-input-border)" } : undefined}
        >
          <p className="text-sm text-muted-foreground">
            Tài khoản {directOtherDisplayName} đang bị khóa xác minh. Bạn không thể gửi tin nhắn như trạng thái chặn.
          </p>
          {lockedRecipientIncidentPrompt ? (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground">
                Bạn đánh giá tài khoản này:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sendingLockedRecipientVote}
                  onClick={() => handleVoteLockedRecipientIncident("safe")}
                >
                  Không vi phạm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sendingLockedRecipientVote}
                  onClick={() => handleVoteLockedRecipientIncident("suspicious")}
                >
                  Có vi phạm
                </Button>
              </div>
            </div>
          ) : null}
          {(lockedRecipientVoteAcknowledged || selectedConvo.lockIncidentVote?.hasVoted) ? (
            <p className="mt-2 text-sm font-medium text-emerald-700">
              Đỗi ngũ đã tiếp nhận cảm ơn bạn đã hỗ trợ bộ phận xác minh.
            </p>
          ) : null}
        </div>
      )}

      {(pendingImageUrl || pendingVideoUrl) && (
        <div
          className="border-t px-2 pt-2 sm:px-3"
          style={isDirectThemed ? { borderColor: "var(--direct-chat-input-border)" } : undefined}
        >
          {pendingImageUrl && (
            <div className="mb-1 flex items-center gap-2 rounded-lg border bg-muted/30 p-1.5">
              <img
                src={pendingImageUrl}
                alt="pending-image"
                className="h-12 w-12 rounded-md object-cover"
              />
              <span className="flex-1 truncate text-xs text-muted-foreground">
                Ảnh đã chọn - có thể nhập văn bản rồi gửi
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPendingImageUrl(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          )}
          {pendingVideoUrl && (
            <div className="mb-1 flex items-center gap-2 rounded-lg border bg-muted/30 p-1.5">
              <video
                src={pendingVideoUrl}
                className="h-12 w-12 rounded-md object-cover"
                muted
                playsInline
              />
              <span className="flex-1 truncate text-xs text-muted-foreground">
                Video đã chọn - có thể nhập văn bản rồi gửi
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPendingVideoUrl(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          )}
        </div>
      )}
      <div
        className="flex items-center gap-1.5 border-t px-2 py-2 sm:px-3"
        style={isDirectThemed ? { borderColor: "var(--direct-chat-input-border)", color: "var(--direct-chat-accent)" } : undefined}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full hover:bg-black/5"
          disabled={!canSendMessage || uploadingMedia}
          title={recordingAudio ? "Dừng và gửi" : "Ghi âm"}
          onClick={handleMicRecord}
        >
          <Mic className={recordingAudio ? "size-5 text-red-500" : "size-5"} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full hover:bg-black/5"
          disabled={!canSendMessage || uploadingMedia}
          title="Ảnh"
          onClick={handlePickImage}
        >
          <ImagePlus className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full hover:bg-black/5"
          disabled={!canSendMessage || uploadingMedia}
          title="Mở camera"
          onClick={handleOpenCamera}
        >
          <Camera className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full hover:bg-black/5"
          disabled={!canSendMessage || uploadingMedia}
          title="Video"
          onClick={handlePickVideo}
        >
          <Clapperboard className="size-5" />
        </Button>
        <div className="relative flex-1">
          <Input
            onKeyPress={handleKeyPress}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Aa"
            className="h-11 rounded-full pr-12 text-lg"
            style={
              isDirectThemed
                ? {
                    backgroundColor: "var(--direct-chat-input-bg)",
                    borderColor: "var(--direct-chat-input-border)",
                  }
                : undefined
            }
            disabled={!canSendMessage}
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            <div className="flex size-8 items-center justify-center rounded-full hover:bg-black/5">
              <EmojiPicker
                onChange={(emoji: string) => setValue(`${value}${emoji}`)}
              />
            </div>
          </div>
        </div>

        {value.trim() || pendingImageUrl || pendingVideoUrl ? (
          <Button
            onClick={() => sendMessage()}
            className="h-10 w-10 rounded-full p-0 text-white hover:opacity-90"
            style={isDirectThemed ? { backgroundColor: "var(--direct-chat-accent)" } : undefined}
            disabled={!canSendMessage || uploadingMedia}
            title="Gửi"
          >
            <Send className="size-5 text-white" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 rounded-full hover:bg-black/5"
            disabled={!canSendMessage || uploadingMedia}
            title={`Phản ứng nhanh (${quickReaction || "👍"})`}
            onClick={handleSendLike}
          >
            <span className="text-xl leading-none">{quickReaction || "👍"}</span>
          </Button>
        )}
      </div>
      <Dialog
        open={cameraOpen}
        onOpenChange={(open) => {
          setCameraOpen(open);
          if (!open) {
            stopCameraStream();
            setCameraCaption("");
          }
        }}
      >
        <DialogContent className="h-[100dvh] w-screen max-w-none border-0 bg-black p-0 text-white [&>button]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Chụp ảnh</DialogTitle>
            <DialogDescription>Mở camera để chụp ảnh, thêm chữ và gửi vào cuộc trò chuyện.</DialogDescription>
          </DialogHeader>
          <div className="mx-auto flex h-full w-full max-w-md flex-col">
            <div className="flex items-center justify-between px-3 pb-2 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20"
                onClick={() => {
                  setCameraOpen(false);
                  stopCameraStream();
                }}
              >
                <X className="size-4.5" />
              </Button>
              <div className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">1x</div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20"
                onClick={handleSwitchCamera}
                disabled={uploadingMedia || cameraStarting}
                title={`Đang dùng ${cameraFacing === "user" ? "cam trước" : "cam sau"}`}
              >
                <RefreshCw className="size-4.5" />
              </Button>
            </div>

            <div className="mx-3 flex-1 overflow-hidden rounded-3xl bg-black/90">
              <video
                ref={cameraVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
                style={{
                  transform: cameraFacing === "user" ? "scaleX(-1)" : "scaleX(1)",
                }}
              />
            </div>

            <div className="space-y-2.5 px-3 pb-4 pt-3">
              <Input
                value={cameraCaption}
                onChange={(event) => setCameraCaption(event.target.value)}
                placeholder="Thêm chữ vào ảnh (không bắt buộc)"
                className="h-10 border-white/20 bg-white/10 text-sm text-white placeholder:text-white/60"
              />
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20"
                  onClick={() => {
                    setCameraOpen(false);
                    stopCameraStream();
                    imageInputRef.current?.click();
                  }}
                >
                  <ImagePlus className="size-5" />
                </Button>
                <button
                  type="button"
                  className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-amber-400 bg-white disabled:opacity-60"
                  onClick={handleCaptureFromLiveCamera}
                  disabled={uploadingMedia || cameraStarting}
                  title={cameraStarting ? "Đang mở camera..." : "Chụp ảnh"}
                >
                  <span className="h-11 w-11 rounded-full border border-black/20 bg-white" />
                </button>
                <div className="h-10 w-10" />
              </div>
            </div>
          </div>
          <canvas ref={cameraCanvasRef} hidden />
        </DialogContent>
      </Dialog>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleImageChange}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={handleVideoChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleCameraCapture}
      />
      <Dialog
        open={datingDialogOpen}
        onOpenChange={setDatingDialogOpen}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-sm rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Gợi ý hẹn hò</DialogTitle>
            <DialogDescription>
              Gửi lời mời hẹn hò tới {directOtherDisplayName}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDatingDialogOpen(false)}
              disabled={sendingDatingRequest}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={handleSendDatingSuggestion}
              disabled={sendingDatingRequest}
            >
              {sendingDatingRequest ? "Đang gửi..." : "Gửi lời mời"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={streakDialogOpen}
        onOpenChange={setStreakDialogOpen}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-sm rounded-2xl p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="flex items-center gap-2">
              <SelectedStreakIcon className="size-4 text-muted-foreground" />
              {streakSuggestionMap[selectedStreakType].label}
            </DialogTitle>
            <DialogDescription>
              Gửi gợi ý chuỗi tới {directOtherDisplayName}?
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 py-3 text-sm text-muted-foreground">
            <div
              className={`rounded-xl bg-gradient-to-r px-3 py-2 ${streakStyleMap[selectedStreakType]}`}
            >
              {streakSuggestionMap[selectedStreakType].prompt}
            </div>
          </div>
          <DialogFooter className="px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStreakDialogOpen(false)}
              disabled={sendingStreakPrompt}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={handleSendStreakPrompt}
              disabled={sendingStreakPrompt || !canSendMessage}
            >
              {sendingStreakPrompt ? "Đang gửi..." : "Gửi gợi ý"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MessageInput;
