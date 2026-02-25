import { cn } from "@/lib/utils";

type VerifiedBadgeProps = {
  className?: string;
  title?: string;
};

const VerifiedBadge = ({ className, title = "Tài khoản đã xác minh" }: VerifiedBadgeProps) => (
  <span
    className={cn(
      "relative inline-flex h-[0.8em] w-[0.8em] min-h-[12px] min-w-[12px] max-h-[15px] max-w-[15px] shrink-0 items-center justify-center align-middle leading-none translate-y-[1px]",
      className,
    )}
    title={title}
    aria-label={title}
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-full w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.22)]"
      aria-hidden="true"
    >
      <polygon
        points="12,1.6 14.2,2.8 16.8,2.5 18.3,4.6 20.8,5.2 21.2,7.8 23,9.7 22.2,12 23,14.3 21.2,16.2 20.8,18.8 18.3,19.4 16.8,21.5 14.2,21.2 12,22.4 9.8,21.2 7.2,21.5 5.7,19.4 3.2,18.8 2.8,16.2 1,14.3 1.8,12 1,9.7 2.8,7.8 3.2,5.2 5.7,4.6 7.2,2.5 9.8,2.8"
        fill="#0f7deb"
      />
      <ellipse cx="9.2" cy="7.2" rx="5.7" ry="3.8" fill="#4bb7ff" opacity="0.38" />
      <path
        d="M6.35 12.25L10.15 16.05L17.75 8.45"
        stroke="#FFFFFF"
        strokeWidth="2.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

export default VerifiedBadge;
