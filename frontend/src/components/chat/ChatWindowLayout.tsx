import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import ChatWindowBody from "./ChatWindowBody";
import MessageInput from "./MessageInput";
import { useEffect, useRef, useState } from "react";
import ChatWindowSkeleton from "../skeleton/ChatWindowSkeleton";
import VoiceCallOverlay from "./VoiceCallOverlay";
import type { Participant } from "@/types/chat";
import { useSocketStore } from "@/stores/useSocketStore";
import { toast } from "sonner";

const OUTGOING_CALL_TIMEOUT_MS = 30000;

const ChatWindowLayout = () => {
  const {
    activeConversationId,
    conversations,
    messageLoading: loading,
    markAsSeen,
    setActiveConversation,
  } = useChatStore();
  const { socket } = useSocketStore();
  const [voiceCallTarget, setVoiceCallTarget] = useState<Participant | null>(null);
  const [callMode, setCallMode] = useState<"audio" | "video">("audio");
  const [callIncoming, setCallIncoming] = useState(false);
  const [callConnected, setCallConnected] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraMuted, setCameraMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [videoInputCount, setVideoInputCount] = useState(1);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const callPartnerIdRef = useRef<string | null>(null);
  const incomingOfferRef = useRef<any>(null);
  const outgoingCallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callConnectedRef = useRef(false);
  const callIncomingRef = useRef(false);

  const selectedConvo =
    conversations.find((c) => c._id === activeConversationId) ?? null;

  useEffect(() => {
    if (!selectedConvo) {
      return;
    }

    const markSeen = async () => {
      try {
        await markAsSeen();
      } catch (error) {
        console.error("Lỗi khi markSeen", error);
      }
    };

    markSeen();
  }, [markAsSeen, selectedConvo]);

  useEffect(() => {
    if (!voiceCallTarget || !callConnected) return;
    const timer = window.setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [voiceCallTarget, callConnected]);

  useEffect(() => {
    callConnectedRef.current = callConnected;
  }, [callConnected]);

  useEffect(() => {
    callIncomingRef.current = callIncoming;
  }, [callIncoming]);

  const clearOutgoingCallTimeout = () => {
    if (outgoingCallTimeoutRef.current) {
      clearTimeout(outgoingCallTimeoutRef.current);
      outgoingCallTimeoutRef.current = null;
    }
  };

  const refreshVideoDeviceCount = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const count = devices.filter((device) => device.kind === "videoinput").length;
      setVideoInputCount(count > 0 ? count : 1);
      if (count <= 1) {
        setCameraFacing("user");
      }
    } catch (error) {
      console.error("Không thể đọc danh sách camera", error);
      setVideoInputCount(1);
      setCameraFacing("user");
    }
  };

  const cleanupCallResources = () => {
    clearOutgoingCallTimeout();
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    callPartnerIdRef.current = null;
    incomingOfferRef.current = null;
    setVoiceCallTarget(null);
    setCallMode("audio");
    setCallIncoming(false);
    setCallConnected(false);
    setAudioReady(false);
    setMicMuted(false);
    setCameraMuted(false);
    setSpeakerMuted(false);
    setCallSeconds(0);
  };

  const endCall = (notify = true) => {
    if (notify && socket && callPartnerIdRef.current) {
      socket.emit("call:end", { toUserId: callPartnerIdRef.current });
    }
    cleanupCallResources();
  };

  const createPeerConnection = (partnerId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("call:ice", {
          toUserId: partnerId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      remoteStreamRef.current = stream;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallConnected(true);
        return;
      }
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        cleanupCallResources();
      }
    };

    return pc;
  };

  const ensureLocalMedia = async (mode: "audio" | "video") => {
    if (localStreamRef.current) {
      const hasVideoTrack = localStreamRef.current.getVideoTracks().length > 0;
      if (mode === "audio" || hasVideoTrack) {
        const activeFacing = localStreamRef.current
          .getVideoTracks?.()[0]
          ?.getSettings?.().facingMode;
        if (activeFacing === "user" || activeFacing === "environment") {
          setCameraFacing(activeFacing);
        }
        return localStreamRef.current;
      }

      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    const facingMode = videoInputCount > 1 ? cameraFacing : "user";
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === "video" ? { facingMode: { ideal: facingMode } } : false,
    });
    localStreamRef.current = stream;
    const actualFacing = stream.getVideoTracks?.()[0]?.getSettings?.().facingMode;
    if (actualFacing === "user" || actualFacing === "environment") {
      setCameraFacing(actualFacing);
    } else {
      setCameraFacing(facingMode);
    }
    await refreshVideoDeviceCount();
    setAudioReady(true);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = mode === "video" ? stream : null;
    }
    return stream;
  };

  const handleSwitchCamera = async () => {
    if (callMode !== "video") return;

    const nextFacing: "user" | "environment" =
      cameraFacing === "user" ? "environment" : "user";

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: nextFacing } },
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error("Không lấy được track video mới.");
      }

      const sender = peerRef.current
        ?.getSenders()
        .find((item) => item.track?.kind === "video");
      await sender?.replaceTrack(newVideoTrack);

      const currentStream = localStreamRef.current;
      const oldVideoTrack = currentStream?.getVideoTracks()[0];
      const shouldMuteCamera = cameraMuted;

      if (currentStream) {
        if (oldVideoTrack) {
          currentStream.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        currentStream.addTrack(newVideoTrack);
      } else {
        localStreamRef.current = new MediaStream([newVideoTrack]);
      }

      newVideoTrack.enabled = !shouldMuteCamera;
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      const actualFacing = newVideoTrack.getSettings?.().facingMode;
      if (actualFacing === "user" || actualFacing === "environment") {
        setCameraFacing(actualFacing);
      } else {
        setCameraFacing(nextFacing);
      }
      await refreshVideoDeviceCount();
    } catch (error) {
      console.error("Không thể chuyển camera", error);
      toast.warning("Thiết bị không hỗ trợ đổi camera.");
      if (videoInputCount <= 1) {
        setCameraFacing("user");
      }
    }
  };

  const handleStartCall = async (mode: "audio" | "video", target: Participant) => {
    if (!socket || !selectedConvo || selectedConvo.type !== "direct") {
      toast.warning("Không thể bắt đầu cuộc gọi ở đoạn chat này.");
      return;
    }

    try {
      const stream = await ensureLocalMedia(mode);
      const partnerId = target._id.toString();
      const pc = createPeerConnection(partnerId);
      peerRef.current = pc;
      callPartnerIdRef.current = partnerId;
      setVoiceCallTarget(target);
      setCallMode(mode);
      setCallIncoming(false);
      setCallConnected(false);

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("call:offer", {
        toUserId: partnerId,
        conversationId: selectedConvo._id,
        offer,
        callType: mode,
      });

      clearOutgoingCallTimeout();
      outgoingCallTimeoutRef.current = setTimeout(() => {
        if (!callConnectedRef.current && !callIncomingRef.current) {
          toast.info("Bên kia chưa nhận máy. Cuộc gọi đã tự kết thúc.");
          endCall(true);
        }
      }, OUTGOING_CALL_TIMEOUT_MS);
    } catch (error) {
      console.error("Không thể bắt đầu gọi", error);
      toast.error("Không thể bắt đầu cuộc gọi.");
      cleanupCallResources();
    }
  };

  const handleAcceptIncoming = async () => {
    const payload = incomingOfferRef.current;
    if (!payload || !socket) return;

    try {
      const acceptMode: "audio" | "video" = payload.callType === "video" ? "video" : "audio";
      setCallMode(acceptMode);
      const stream = await ensureLocalMedia(acceptMode);
      const partnerId = payload.fromUserId?.toString?.();
      if (!partnerId) return;

      const pc = createPeerConnection(partnerId);
      peerRef.current = pc;
      callPartnerIdRef.current = partnerId;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("call:answer", {
        toUserId: partnerId,
        answer,
      });

      setCallIncoming(false);
    } catch (error) {
      console.error("Không thể nhận cuộc gọi", error);
      toast.error("Không thể nhận cuộc gọi.");
      cleanupCallResources();
    }
  };

  const handleDeclineIncoming = () => {
    const payload = incomingOfferRef.current;
    if (socket && payload?.fromUserId) {
      socket.emit("call:reject", { toUserId: payload.fromUserId });
    }
    cleanupCallResources();
  };

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks?.()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicMuted(!track.enabled);
  };

  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraMuted(!track.enabled);
  };

  useEffect(() => {
    refreshVideoDeviceCount();
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onIncoming = (payload: any) => {
      if (!payload?.fromUserId || !payload?.offer) return;
      if (voiceCallTarget) {
        socket.emit("call:reject", { toUserId: payload.fromUserId });
        return;
      }

      const caller: Participant = {
        _id: payload.caller?._id || payload.fromUserId,
        displayName: payload.caller?.displayName || "Người dùng",
        avatarUrl: payload.caller?.avatarUrl ?? null,
        joinedAt: new Date().toISOString(),
      };

      incomingOfferRef.current = payload;
      callPartnerIdRef.current = payload.fromUserId;
      setVoiceCallTarget(caller);
      setCallMode(payload.callType === "video" ? "video" : "audio");
      setCallIncoming(true);
      setCallConnected(false);

      if (payload.conversationId) {
        setActiveConversation(payload.conversationId);
      }

      toast.info(
        `${payload.callType === "video" ? "Cuộc gọi video" : "Cuộc gọi thoại"} đến từ ${caller.displayName}`
      );
    };

    const onAnswered = async ({ answer, fromUserId }: any) => {
      if (!peerRef.current || !answer) return;
      if (callPartnerIdRef.current && fromUserId && callPartnerIdRef.current !== fromUserId) {
        return;
      }
      try {
        clearOutgoingCallTimeout();
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error("Lỗi khi xử lý answer", error);
      }
    };

    const onIce = async ({ candidate, fromUserId }: any) => {
      if (!peerRef.current || !candidate) return;
      if (callPartnerIdRef.current && fromUserId && callPartnerIdRef.current !== fromUserId) {
        return;
      }
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Lỗi khi thêm ICE candidate", error);
      }
    };

    const onRejected = () => {
      toast.warning("Người nhận đã từ chối cuộc gọi.");
      cleanupCallResources();
    };

    const onEnded = () => {
      toast.info("Cuộc gọi đã kết thúc.");
      cleanupCallResources();
    };

    socket.on("call:incoming", onIncoming);
    socket.on("call:answered", onAnswered);
    socket.on("call:ice", onIce);
    socket.on("call:rejected", onRejected);
    socket.on("call:ended", onEnded);

    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:answered", onAnswered);
      socket.off("call:ice", onIce);
      socket.off("call:rejected", onRejected);
      socket.off("call:ended", onEnded);
    };
  }, [socket, setActiveConversation, voiceCallTarget]);

  useEffect(() => {
    return () => {
      cleanupCallResources();
    };
  }, []);

  if (!selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  if (loading) {
    return <ChatWindowSkeleton />;
  }

  return (
    <>
      <SidebarInset className="flex flex-col h-full flex-1 overflow-hidden rounded-lg sm:rounded-2xl border border-border/60 shadow-sm bg-background">
        {/* Header */}
        <ChatWindowHeader
          chat={selectedConvo}
          onStartVoiceCall={(target) => handleStartCall("audio", target)}
          onStartVideoCall={(target) => handleStartCall("video", target)}
        />

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-muted/20">
          <ChatWindowBody />
        </div>

        {/* Footer */}
        <MessageInput selectedConvo={selectedConvo} />
      </SidebarInset>
      <VoiceCallOverlay
        open={!!voiceCallTarget}
        targetUser={voiceCallTarget}
        callMode={callMode}
        incoming={callIncoming}
        connected={callConnected}
        audioReady={audioReady}
        micMuted={micMuted}
        cameraMuted={cameraMuted}
        speakerMuted={speakerMuted}
        callSeconds={callSeconds}
        remoteAudioRef={remoteAudioRef}
        remoteVideoRef={remoteVideoRef}
        localVideoRef={localVideoRef}
        onAccept={handleAcceptIncoming}
        onDecline={handleDeclineIncoming}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        cameraFacing={cameraFacing}
        onSwitchCamera={handleSwitchCamera}
        onToggleSpeaker={() => setSpeakerMuted((prev) => !prev)}
        onEnd={() => endCall(true)}
      />
    </>
  );
};

export default ChatWindowLayout;
