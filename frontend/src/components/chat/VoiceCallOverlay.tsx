import { Button } from "../ui/button";
import { Camera, CameraOff, Mic, MicOff, Phone, PhoneOff, RefreshCw, UserPlus, Volume2, VolumeX } from "lucide-react";
import type { Participant } from "@/types/chat";
import { useMemo } from "react";

interface VoiceCallOverlayProps {
  open: boolean;
  targetUser: Participant | null;
  callMode: "audio" | "video";
  incoming: boolean;
  connected: boolean;
  audioReady: boolean;
  micMuted: boolean;
  cameraMuted: boolean;
  speakerMuted: boolean;
  callSeconds: number;
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  onAccept: () => void;
  onDecline: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  cameraFacing: "user" | "environment";
  onSwitchCamera: () => void;
  onToggleSpeaker: () => void;
  onEnd: () => void;
}

const VoiceCallOverlay = ({
  open,
  targetUser,
  callMode,
  incoming,
  connected,
  audioReady,
  micMuted,
  cameraMuted,
  speakerMuted,
  callSeconds,
  remoteAudioRef,
  remoteVideoRef,
  localVideoRef,
  onAccept,
  onDecline,
  onToggleMic,
  onToggleCamera,
  cameraFacing,
  onSwitchCamera,
  onToggleSpeaker,
  onEnd,
}: VoiceCallOverlayProps) => {
  const callDurationLabel = useMemo(() => {
    const minutes = Math.floor(callSeconds / 60);
    const seconds = callSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [callSeconds]);

  if (!open || !targetUser) return null;

  const targetInitial = targetUser.displayName?.trim()?.charAt(0)?.toUpperCase() || "U";

  return (
    <div className="fixed inset-0 z-[120] bg-black text-white">
      {callMode === "audio" ? (
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          muted={speakerMuted}
        />
      ) : null}

      {callMode === "video" ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted={speakerMuted}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}

      <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full bg-zinc-300 text-zinc-600">
              {targetUser.avatarUrl ? (
                <img
                  src={targetUser.avatarUrl}
                  alt={targetUser.displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold">
                  {targetInitial}
                </div>
              )}
            </div>
            <div>
              <p className="text-3xl font-semibold">{targetUser.displayName}</p>
              <p className="text-base text-zinc-300">
                {incoming
                  ? "Cuộc gọi đến..."
                  : connected
                    ? `Đang gọi... ${callDurationLabel}`
                    : "Đang kết nối..."}
              </p>
            </div>
          </div>
        </div>

        {audioReady && (
          <div className="mx-auto mb-8 w-full max-w-xl rounded-3xl bg-zinc-800/90 px-5 py-4 text-zinc-100 backdrop-blur">
            <p className="text-sm sm:text-base">Micrô và loa đã được kết nối.</p>
          </div>
        )}

        <div className="flex flex-1 items-center justify-center">
          {callMode === "video" ? (
            <div className="h-full w-full" />
          ) : (
            <div className="h-52 w-52 overflow-hidden rounded-full bg-zinc-300 text-zinc-600 shadow-2xl">
              {targetUser.avatarUrl ? (
                <img
                  src={targetUser.avatarUrl}
                  alt={targetUser.displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-7xl font-semibold">
                  {targetInitial}
                </div>
              )}
            </div>
          )}
        </div>

        {callMode === "video" && (
          <div className="pointer-events-none absolute bottom-28 right-4 h-36 w-28 overflow-hidden rounded-2xl border border-white/20 bg-zinc-900/80 shadow-xl sm:h-44 sm:w-32">
            {!cameraMuted ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
                style={{
                  transform: cameraFacing === "user" ? "scaleX(-1)" : "scaleX(1)",
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-zinc-300">
                Camera tắt
              </div>
            )}
          </div>
        )}

        {incoming ? (
          <div className="mb-2 flex items-center justify-center gap-6">
            <Button
              type="button"
              size="icon"
              className="h-16 w-16 rounded-full bg-zinc-700 hover:bg-zinc-600"
              onClick={onDecline}
            >
              <PhoneOff className="size-7" />
            </Button>
            <Button
              type="button"
              size="icon"
              className="h-16 w-16 rounded-full bg-emerald-600 hover:bg-emerald-500"
              onClick={onAccept}
            >
              <Phone className="size-7" />
            </Button>
          </div>
        ) : (
          <div className="mb-2 flex items-center justify-center gap-4">
            <Button
              type="button"
              size="icon"
              className="h-14 w-14 rounded-full bg-zinc-700 hover:bg-zinc-600"
              onClick={onToggleSpeaker}
            >
              {speakerMuted ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
            </Button>
            <Button
              type="button"
              size="icon"
              className="h-14 w-14 rounded-full bg-zinc-700 hover:bg-zinc-600"
              onClick={onToggleMic}
            >
              {micMuted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
            </Button>
            {callMode === "video" && (
              <Button
                type="button"
                size="icon"
                className="h-14 w-14 rounded-full bg-zinc-700 hover:bg-zinc-600"
                onClick={onToggleCamera}
              >
                {cameraMuted ? <CameraOff className="size-6" /> : <Camera className="size-6" />}
              </Button>
            )}
            {callMode === "video" && (
              <Button
                type="button"
                size="icon"
                className="h-14 w-14 rounded-full bg-zinc-700 hover:bg-zinc-600"
                onClick={onSwitchCamera}
                title={cameraFacing === "user" ? "Đổi sang cam sau" : "Đổi sang cam trước"}
              >
                <RefreshCw className="size-6" />
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              className="h-14 w-14 rounded-full bg-zinc-700 hover:bg-zinc-600"
            >
              <UserPlus className="size-6" />
            </Button>
            <Button
              type="button"
              size="icon"
              className="h-14 w-14 rounded-full bg-red-600 text-white hover:bg-red-500"
              onClick={onEnd}
            >
              <PhoneOff className="size-6" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceCallOverlay;
