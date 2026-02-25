type PageLoaderProps = {
  open: boolean;
  tone?: "white" | "glass";
};

const PageLoader = ({ open, tone = "glass" }: PageLoaderProps) => {
  return (
    <div
      className={[
        "fixed inset-0 z-[9999] grid place-items-center transition-opacity duration-300",
        tone === "white"
          ? "bg-white"
          : "bg-background/60 backdrop-blur-md",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      ].join(" ")}
      aria-hidden={!open}
    >
      <div
        role="status"
        aria-live="polite"
        aria-label="Đang tải trang"
        className="flex w-[min(92vw,360px)] flex-col items-center gap-4 rounded-3xl border border-white/70 bg-white/70 p-6 text-center shadow-[0_20px_60px_-30px_rgba(76,29,149,0.45)] backdrop-blur"
      >
        <div className="space-y-1">
          <p className="text-base font-semibold text-slate-900">Đang tải trang</p>
          <p className="text-sm text-slate-600">Vui lòng đợi trong giây lát...</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 rounded-full"
            style={{
              background: "hsl(var(--primary))",
              boxShadow: "0 0 14px hsl(var(--primary-glow))",
            }}
          />
          <span
            className="h-3 w-3 animate-pulse rounded-full"
            style={{ background: "hsl(var(--primary) / 0.85)" }}
          />
          <span
            className="h-3 w-3 animate-pulse rounded-full [animation-delay:150ms]"
            style={{ background: "hsl(var(--primary) / 0.7)" }}
          />
          <span
            className="h-3 w-3 animate-pulse rounded-full [animation-delay:300ms]"
            style={{ background: "hsl(var(--primary) / 0.55)" }}
          />
        </div>
      </div>
    </div>
  );
};

export default PageLoader;
