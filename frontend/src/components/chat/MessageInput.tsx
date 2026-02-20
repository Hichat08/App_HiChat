import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Camera, Clapperboard, ImagePlus, Mic, RefreshCw, Send, ThumbsUp, X } from "lucide-react";
import { Input } from "../ui/input";
import EmojiPicker from "./EmojiPicker";
import { useChatStore } from "@/stores/useChatStore";
import { toast } from "sonner";
import { chatService } from "@/services/chatService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
  const { user } = useAuthStore();
  const {
    sendDirectMessage,
    sendGroupMessage,
    acceptDirectRequest,
    rejectDirectRequest,
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

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

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

  const canSendMessage =
    selectedConvo.type === "group" ||
    ((!isBlockedDirect && !isRestrictedDirect) &&
      ((!isPendingDirect && !isRejectedDirect) || (isRequester && !requestLimitReached)));

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
      toast.error(
        error?.response?.data?.message || "Lỗi xảy ra khi gửi tin nhắn. Bạn hãy thử lại!"
      );
      setValue(currValue);
      setPendingImageUrl(currPendingImageUrl);
      setPendingVideoUrl(currPendingVideoUrl);
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
    await sendMessage({ content: "👍" });
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

    canvasElement.width = width;
    canvasElement.height = height;
    const context = canvasElement.getContext("2d");
    if (!context) {
      toast.error("Không thể chụp ảnh từ camera.");
      return;
    }

    context.drawImage(videoElement, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvasElement.toBlob(resolve, "image/jpeg", 0.92)
    );

    if (!blob) {
      toast.error("Không thể tạo ảnh chụp.");
      return;
    }

    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });

    try {
      setUploadingMedia(true);
      const uploaded = await chatService.uploadChatMedia(file);
      setPendingImageUrl(uploaded.url);
      setPendingVideoUrl(null);
      setCameraOpen(false);
      stopCameraStream();
    } catch (error: any) {
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

  return (
    <div className="bg-background">
      {isPendingDirect && (
        <div className="border-t border-b bg-muted/40 px-3 py-2">
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
        <div className="border-t border-b bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Người này đã từ chối yêu cầu tin nhắn. Bạn cần kết bạn để tiếp tục chat.
        </div>
      )}

      {isBlockedDirect && (
        <div className="border-t border-b bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {selectedConvo.blockedByMe
            ? "Bạn đã chặn người này. Bỏ chặn để tiếp tục nhắn tin."
            : "Bạn đã bị chặn trong cuộc trò chuyện này."}
        </div>
      )}

      {isRestrictedDirect && !isBlockedDirect && (
        <div className="border-t border-b bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {selectedConvo.restrictedByMe
            ? "Bạn đã hạn chế người này. Bỏ hạn chế để tiếp tục nhắn tin."
            : "Bạn đã bị hạn chế trong cuộc trò chuyện này."}
        </div>
      )}

      <div className="flex items-center gap-1.5 border-t px-2 py-2 sm:px-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full text-primary hover:bg-primary/10"
          disabled={!canSendMessage || uploadingMedia}
          title={recordingAudio ? "Dừng và gửi" : "Ghi âm"}
          onClick={handleMicRecord}
        >
          <Mic className={recordingAudio ? "size-5 text-red-500" : "size-5"} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full text-primary hover:bg-primary/10"
          disabled={!canSendMessage || uploadingMedia}
          title="Ảnh"
          onClick={handlePickImage}
        >
          <ImagePlus className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full text-primary hover:bg-primary/10"
          disabled={!canSendMessage || uploadingMedia}
          title="Mở camera"
          onClick={handleOpenCamera}
        >
          <Camera className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full text-primary hover:bg-primary/10"
          disabled={!canSendMessage || uploadingMedia}
          title="Video"
          onClick={handlePickVideo}
        >
          <Clapperboard className="size-5" />
        </Button>
        <div className="relative flex-1">
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
          <Input
            onKeyPress={handleKeyPress}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Aa"
            className="h-11 rounded-full border-border/60 bg-muted/40 pr-12 text-lg"
            disabled={!canSendMessage}
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            <div className="flex size-8 items-center justify-center rounded-full text-primary hover:bg-primary/10">
              <EmojiPicker
                onChange={(emoji: string) => setValue(`${value}${emoji}`)}
              />
            </div>
          </div>
        </div>

        {value.trim() ? (
          <Button
            onClick={() => sendMessage()}
            className="h-10 w-10 rounded-full bg-primary p-0 hover:bg-primary/90"
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
            className="size-10 rounded-full text-primary hover:bg-primary/10"
            disabled={!canSendMessage || uploadingMedia}
            title="Thích"
            onClick={handleSendLike}
          >
            <ThumbsUp className="size-6 fill-current" />
          </Button>
        )}
      </div>
      {(pendingImageUrl || pendingVideoUrl) && !value.trim() && (
        <div className="px-3 pb-2">
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            disabled={!canSendMessage || uploadingMedia}
            onClick={() => sendMessage()}
          >
            Gửi ảnh
          </Button>
        </div>
      )}
      <Dialog
        open={cameraOpen}
        onOpenChange={(open) => {
          setCameraOpen(open);
          if (!open) {
            stopCameraStream();
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-md p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Chụp ảnh</DialogTitle>
            <DialogDescription className="sr-only">
              Mở camera để chụp ảnh và gửi vào cuộc trò chuyện.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 p-4">
            <div className="overflow-hidden rounded-xl bg-black/90">
              <video
                ref={cameraVideoRef}
                autoPlay
                playsInline
                muted
                className="h-64 w-full object-cover"
                style={{
                  transform: cameraFacing === "user" ? "scaleX(-1)" : "scaleX(1)",
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleSwitchCamera}
                disabled={uploadingMedia || cameraStarting}
                title={`Đang dùng ${cameraFacing === "user" ? "cam trước" : "cam sau"}`}
              >
                <RefreshCw className="mr-1 size-4" />
                {cameraFacing === "environment" ? "Đổi sang cam trước" : "Đổi sang cam sau"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCameraOpen(false);
                  stopCameraStream();
                }}
              >
                Đóng
              </Button>
              <Button
                type="button"
                onClick={handleCaptureFromLiveCamera}
                disabled={uploadingMedia || cameraStarting}
              >
                {cameraStarting ? "Đang mở camera..." : "Chụp ảnh"}
              </Button>
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
    </div>
  );
};

export default MessageInput;
