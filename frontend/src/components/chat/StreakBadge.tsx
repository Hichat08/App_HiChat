import { cn } from "@/lib/utils";
import { Flame, Heart, Hourglass } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type StreakBadgeProps = {
  count: number;
  atRisk?: boolean;
  recoveryMode?: "free" | "minus_one" | null;
  modeType?: "love" | "dating" | "friends" | null;
  forceVisible?: boolean;
};

type StreakTier = {
  level: number;
  minDays: number;
  name: string;
  meaning: string;
  color: string;
  gradient?: string;
};

const FIRE_STREAK_TIERS: StreakTier[] = [
  { level: 1, minDays: 3, name: "Vàng", meaning: "khởi đầu", color: "#FFC107" },
  { level: 2, minDays: 7, name: "Cam", meaning: "nhiệt huyết", color: "#FF9800" },
  { level: 3, minDays: 30, name: "Đỏ", meaning: "gắn bó", color: "#F44336" },
  { level: 4, minDays: 100, name: "Tím", meaning: "hiếm", color: "#9C27B0" },
  { level: 5, minDays: 365, name: "Xanh dương", meaning: "bền vững", color: "#2196F3" },
  { level: 6, minDays: 1000, name: "Xanh lá neon", meaning: "huyền thoại", color: "#00E676" },
];

const LOVE_STREAK_TIERS: StreakTier[] = [
  { level: 1, minDays: 3, name: "Hồng", meaning: "khởi đầu ngọt ngào", color: "#FB7185" },
  { level: 2, minDays: 14, name: "Hồng đậm", meaning: "rung động", color: "#F43F5E" },
  { level: 3, minDays: 45, name: "Đỏ", meaning: "đam mê", color: "#F43F5E" },
  { level: 4, minDays: 100, name: "Tím", meaning: "chung thủy", color: "#A78BFA" },
  { level: 5, minDays: 180, name: "Xanh dương", meaning: "tin tưởng", color: "#60A5FA" },
  { level: 6, minDays: 365, name: "Vàng", meaning: "hạnh phúc", color: "#FBBF24" },
  {
    level: 7,
    minDays: 700,
    name: "Xanh Galaxy",
    meaning: "gắn kết sâu sắc",
    color: "#818CF8",
    gradient: "linear-gradient(90deg,#60A5FA,#818CF8,#C084FC)",
  },
  {
    level: 8,
    minDays: 1000,
    name: "Rainbow",
    meaning: "tình yêu hoàn hảo",
    color: "#FFFFFF",
    gradient: "linear-gradient(90deg,#FB7185,#FBBF24,#34D399,#60A5FA,#C084FC)",
  },
];

const getStreakTier = (count: number, isLoveMode: boolean): StreakTier => {
  const tiers = isLoveMode ? LOVE_STREAK_TIERS : FIRE_STREAK_TIERS;

  if (isLoveMode) {
    if (count >= 1000) return tiers[7];
    if (count >= 700) return tiers[6];
    if (count >= 365) return tiers[5];
    if (count >= 180) return tiers[4];
    if (count >= 100) return tiers[3];
    if (count >= 45) return tiers[2];
    if (count >= 14) return tiers[1];
    if (count >= 3) return tiers[0];
    return { level: 0, minDays: 0, name: "Mới", meaning: "khởi đầu", color: "#94A3B8" };
  }

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
  if (count >= 1000) return tiers[5];
  if (count >= 365) return tiers[4];
  if (count >= 100) return tiers[3];
  if (count >= 30) return tiers[2];
  if (count >= 7) return tiers[1];
  if (count >= 3) return tiers[0];
  return { level: 0, minDays: 0, name: "Mới", meaning: "khởi đầu", color: "#94A3B8" };
};

const getLoveBadgeStyle = (count: number) => {
  if (count >= 1000) {
    return {
      background: "linear-gradient(135deg,#FB7185,#FBBF24,#34D399,#60A5FA,#C084FC)",
      shadow: "0 0 10px rgba(192,132,252,0.6)",
    };
  }
  if (count >= 700) {
    return {
      background: "linear-gradient(135deg,#334155,#6366F1,#A855F7)",
      shadow: "0 0 10px rgba(129,140,248,0.55)",
    };
  }
  if (count >= 365) {
    return {
      background: "linear-gradient(135deg,#F59E0B,#FCD34D)",
      shadow: "0 0 9px rgba(251,191,36,0.55)",
    };
  }
  if (count >= 180) {
    return {
      background: "linear-gradient(135deg,#2563EB,#60A5FA)",
      shadow: "0 0 9px rgba(96,165,250,0.55)",
    };
  }
  if (count >= 100) {
    return {
      background: "linear-gradient(135deg,#7C3AED,#A78BFA)",
      shadow: "0 0 9px rgba(167,139,250,0.55)",
    };
  }
  if (count >= 45) {
    return {
      background: "linear-gradient(135deg,#DC2626,#F87171)",
      shadow: "0 0 9px rgba(248,113,113,0.5)",
    };
  }
  if (count >= 14) {
    return {
      background: "linear-gradient(135deg,#E11D48,#FB7185)",
      shadow: "0 0 8px rgba(251,113,133,0.5)",
    };
  }
  return {
    background: "linear-gradient(135deg,#F472B6,#FB7185)",
    shadow: "0 0 8px rgba(244,114,182,0.45)",
  };
};

const StreakBadge = ({
  count,
  atRisk = false,
  recoveryMode = null,
  modeType = null,
  forceVisible = false,
}: StreakBadgeProps) => {
  if (!forceVisible && (!count || count <= 0)) return null;
  const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
  const isLoveMode = modeType === "love" || modeType === "dating";
  const tier = getStreakTier(safeCount, isLoveMode);
  const tierList = isLoveMode ? LOVE_STREAK_TIERS : FIRE_STREAK_TIERS;
  const tierEmoji = isLoveMode ? "💖" : "🔥";
  const StreakIcon = isLoveMode ? Heart : Flame;
  const loveBadgeStyle = getLoveBadgeStyle(safeCount);

  const title =
    recoveryMode === "free"
      ? "Lần 1 bỏ lỡ: khôi phục miễn phí (không cộng)"
      : recoveryMode === "minus_one"
        ? "Lần 2 bỏ lỡ: khôi phục sẽ bị trừ 1"
        : atRisk
          ? "Chuỗi đang có nguy cơ mất"
          : `${isLoveMode ? "Chuỗi tình yêu" : "Chuỗi lửa"} cấp ${tier.name} - ${tier.meaning}`;

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
              atRisk ? "bg-zinc-200/80" : isLoveMode ? "" : "bg-white/80"
            )}
            style={
              atRisk
                ? undefined
                : isLoveMode
                  ? {
                      background: loveBadgeStyle.background,
                      boxShadow: loveBadgeStyle.shadow,
                    }
                : {
                    boxShadow: `0 0 8px ${tier.color}88`,
                  }
            }
          >
            {isLoveMode ? (
              <Heart
                className={cn("size-3.5", atRisk ? "text-zinc-500" : "text-white")}
                style={
                  atRisk
                    ? undefined
                    : {
                        fill: "currentColor",
                        filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.22))",
                      }
                }
              />
            ) : (
              <StreakIcon
                className={cn("size-3.5", atRisk ? "text-zinc-500" : "")}
                style={atRisk ? undefined : { color: tier.color }}
              />
            )}
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
            {safeCount}
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
        <p className="text-center text-sm font-bold">
          {isLoveMode ? "Chuỗi tình yêu hiện tại" : "Chuỗi lửa hiện tại"}
        </p>
        <p className="mt-1 text-center text-lg font-black" style={tier.gradient ? { backgroundImage: tier.gradient, WebkitBackgroundClip: "text", color: "transparent" } : { color: tier.color }}>
          {tier.level === 0 ? `Khởi tạo (${safeCount})` : `${tier.name} (${safeCount})`}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {tierList.map((item) => {
            const isReached = safeCount >= item.minDays;
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
                  {tierEmoji} {item.minDays}
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
