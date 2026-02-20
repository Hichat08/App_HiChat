import { cn } from "@/lib/utils";
import { Flame, Hourglass } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type StreakBadgeProps = {
  count: number;
  atRisk?: boolean;
  recoveryMode?: "free" | "minus_one" | null;
};

type StreakTier = {
  level: number;
  minDays: number;
  name: string;
  meaning: string;
  color: string;
  gradient?: string;
};

const STREAK_TIERS: StreakTier[] = [
  { level: 1, minDays: 3, name: "Vàng", meaning: "khởi đầu", color: "#FFC107" },
  { level: 2, minDays: 7, name: "Cam", meaning: "nhiệt huyết", color: "#FF9800" },
  { level: 3, minDays: 30, name: "Đỏ", meaning: "gắn bó", color: "#F44336" },
  { level: 4, minDays: 100, name: "Tím", meaning: "hiếm", color: "#9C27B0" },
  { level: 5, minDays: 365, name: "Xanh dương", meaning: "bền vững", color: "#2196F3" },
  { level: 6, minDays: 1000, name: "Xanh lá neon", meaning: "huyền thoại", color: "#00E676" },
];

const getStreakTier = (count: number): StreakTier => {
  if (count >= 5000) {
    return {
      level: 7,
      minDays: 5000,
      name: "Vô hạn",
      meaning: "huyền thoại",
      color: "#FFFFFF",
      gradient:
        "linear-gradient(90deg,#FF5252,#FFC107,#00E676,#2196F3,#9C27B0)",
    };
  }
  if (count >= 1000) return STREAK_TIERS[5];
  if (count >= 365) return STREAK_TIERS[4];
  if (count >= 100) return STREAK_TIERS[3];
  if (count >= 30) return STREAK_TIERS[2];
  if (count >= 7) return STREAK_TIERS[1];
  if (count >= 3) return STREAK_TIERS[0];
  return { level: 0, minDays: 0, name: "Mới", meaning: "khởi đầu", color: "#94A3B8" };
};

const StreakBadge = ({
  count,
  atRisk = false,
  recoveryMode = null,
}: StreakBadgeProps) => {
  if (!count || count <= 0) return null;
  const tier = getStreakTier(count);

  const title =
    recoveryMode === "free"
      ? "Lần 1 bỏ lỡ: khôi phục miễn phí (không cộng)"
      : recoveryMode === "minus_one"
        ? "Lần 2 bỏ lỡ: khôi phục sẽ bị trừ 1"
        : atRisk
          ? "Chuỗi đang có nguy cơ mất"
          : `Chuỗi cấp ${tier.name} - ${tier.meaning}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 shrink-0 items-center gap-1 align-middle"
          title={title}
        >
          <span
            className={cn(
              "inline-flex size-5 items-center justify-center rounded-full",
              atRisk ? "bg-zinc-200/80" : "bg-white/80"
            )}
            style={
              atRisk
                ? undefined
                : {
                    boxShadow: `0 0 8px ${tier.color}88`,
                  }
            }
          >
            <Flame
              className={cn("size-3.5", atRisk ? "text-zinc-500" : "")}
              style={atRisk ? undefined : { color: tier.color }}
            />
          </span>
          <span
            className="text-base font-black leading-none tracking-tight sm:text-[1.05rem]"
            style={
              atRisk
                ? { color: "#71717A" }
                : tier.gradient
                  ? {
                      backgroundImage: tier.gradient,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                      textShadow: "0 0 4px rgba(255,255,255,0.25)",
                    }
                  : {
                      color: tier.color,
                      textShadow: `0 0 4px ${tier.color}66`,
                    }
            }
          >
            {count}
          </span>
          {atRisk && recoveryMode && (
            <Hourglass className="size-3.5 animate-pulse text-amber-500" />
          )}
          {recoveryMode === "free" && (
            <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700">
              restore
            </span>
          )}
          {recoveryMode === "minus_one" && (
            <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-700">
              -1
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[250px] rounded-2xl border-zinc-700 bg-black/95 p-3 text-white">
        <p className="text-center text-sm font-bold">Chuỗi của bạn hiện tại</p>
        <p className="mt-1 text-center text-lg font-black" style={tier.gradient ? { backgroundImage: tier.gradient, WebkitBackgroundClip: "text", color: "transparent" } : { color: tier.color }}>
          {tier.level === 0 ? "Chưa đạt cấp" : `${tier.name} (${count})`}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {STREAK_TIERS.map((item) => {
            const isReached = count >= item.minDays;
            return (
              <div
                key={item.level}
                className={cn(
                  "rounded-lg border px-2 py-1 text-xs",
                  isReached ? "border-white/45 bg-white/10" : "border-white/20 bg-white/5 opacity-80"
                )}
              >
                <p className="font-semibold">{item.level}. {item.name}</p>
                <p className="font-black" style={{ color: item.color }}>
                  🔥 {item.minDays}
                </p>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default StreakBadge;
