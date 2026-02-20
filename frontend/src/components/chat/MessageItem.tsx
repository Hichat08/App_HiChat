import { cn, formatMessageTime } from "@/lib/utils";
import type { Conversation, Message, Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Pause, Play } from "lucide-react";
import { useMemo, useRef, useState } from "react";

interface MessageItemProps {
  message: Message;
  index: number;
  messages: Message[];
  selectedConvo: Conversation;
  showStatus: boolean;
}

const MessageItem = ({
  message,
  index,
  messages,
  selectedConvo,
  showStatus,
}: MessageItemProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const prev = index + 1 < messages.length ? messages[index + 1] : undefined;

  const isShowTime =
    index === 0 ||
    new Date(message.createdAt).getTime() -
      new Date(prev?.createdAt || 0).getTime() >
      300000; // 5 phút

  const isGroupBreak = isShowTime || message.senderId !== prev?.senderId;

  const participant = selectedConvo.participants.find(
    (p: Participant) => p._id.toString() === message.senderId.toString()
  );

  const messageStatusLabel = message.seenAt
    ? "Đã xem"
    : message.deliveredAt
      ? "Đã nhận"
      : "Đang gửi";

  const formatAudioTime = (value: number) => {
    if (!Number.isFinite(value) || value < 0) return "0:00";
    const total = Math.floor(value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const audioBars = useMemo(() => {
    const seed = (message._id || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return Array.from({ length: 14 }).map((_, idx) => 18 + ((seed + idx * 11) % 26));
  }, [message._id]);

  const handleToggleAudio = () => {
    const player = audioRef.current;
    if (!player) return;

    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
      return;
    }

    player.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  };

  const handleToggleSpeed = () => {
    const player = audioRef.current;
    if (!player) return;

    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    player.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  return (
    <>
      {/* time */}
      {isShowTime && (
        <span className="flex justify-center text-xs text-muted-foreground px-1">
          {formatMessageTime(new Date(message.createdAt))}
        </span>
      )}

      <div
        className={cn(
          "flex gap-2 message-bounce mt-1",
          message.isOwn ? "justify-end" : "justify-start"
        )}
      >
        {/* avatar */}
        {!message.isOwn && (
          <div className="w-8">
            {isGroupBreak && (
              <UserAvatar
                type="chat"
                name={participant?.displayName ?? "HiChat"}
                avatarUrl={participant?.avatarUrl ?? undefined}
              />
            )}
          </div>
        )}

        {/* tin nhắn */}
        <div
          className={cn(
            "max-w-[78vw] sm:max-w-xs lg:max-w-md space-y-1 flex flex-col",
            message.isOwn ? "items-end" : "items-start"
          )}
        >
          <Card
            className={cn(
              "overflow-hidden p-2.5 sm:p-3",
              message.isOwn ? "chat-bubble-sent border-0" : "chat-bubble-received"
            )}
          >
            {message.imgUrl ? (
              <img
                src={message.imgUrl}
                alt="message-image"
                className="max-h-96 w-full rounded-md object-contain bg-muted/20"
              />
            ) : null}
            {message.videoUrl ? (
              <video
                src={message.videoUrl}
                className="max-h-96 w-full rounded-md object-cover bg-muted/20"
                controls
                preload="metadata"
                playsInline
              />
            ) : null}
            {message.audioUrl ? (
              <div className="min-w-[220px] max-w-[320px] rounded-3xl bg-muted/70 px-3 py-2">
                <audio
                  ref={audioRef}
                  preload="metadata"
                  src={message.audioUrl}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onLoadedMetadata={(e) => {
                    const nextDuration = e.currentTarget.duration;
                    setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
                    e.currentTarget.playbackRate = playbackRate;
                  }}
                  onTimeUpdate={(e) => {
                    setCurrentTime(e.currentTarget.currentTime || 0);
                  }}
                  onEnded={() => {
                    setIsPlaying(false);
                    setCurrentTime(0);
                  }}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleToggleAudio}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition",
                      isPlaying
                        ? "border-blue-500 bg-zinc-200 text-zinc-900"
                        : "border-transparent bg-foreground/90 text-background hover:bg-foreground"
                    )}
                  >
                    {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </button>

                  <div className="flex h-10 flex-1 items-center gap-1.5 overflow-hidden">
                    {audioBars.map((height, barIndex) => {
                      const progressRatio = duration > 0 ? currentTime / duration : 0;
                      const playedBars = Math.floor(progressRatio * audioBars.length);
                      const isActive = barIndex < playedBars;
                      return (
                        <span
                          key={`${message._id}-bar-${barIndex}`}
                          className={cn(
                            "block w-1 rounded-full transition-colors",
                            isActive ? "bg-foreground" : "bg-foreground/40"
                          )}
                          style={{ height: `${height}px` }}
                        />
                      );
                    })}
                  </div>

                  <span className="min-w-10 text-right text-sm font-medium tabular-nums text-foreground/90">
                    {formatAudioTime(isPlaying ? currentTime : duration || currentTime)}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleSpeed}
                    className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-300"
                  >
                    {`${playbackRate}x`}
                  </button>
                </div>
              </div>
            ) : null}
            {message.content?.trim() ? (
              <p
                className={cn(
                  "text-sm leading-relaxed break-words",
                  message.imgUrl || message.videoUrl || message.audioUrl ? "mt-2" : ""
                )}
              >
                {message.content}
              </p>
            ) : null}
          </Card>

          {/* status for sender's latest message */}
          {message.isOwn && showStatus && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs px-1.5 py-0.5 h-4 border-0",
                messageStatusLabel === "Đã xem"
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {messageStatusLabel}
            </Badge>
          )}
        </div>
      </div>
    </>
  );
};

export default MessageItem;
