export function MeridianMark({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.5" />
      <ellipse cx="8" cy="8" rx="2.75" ry="6.5" />
      <path d="M8 0.5v15" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-1.5 text-text">
      <MeridianMark />
      <span className="text-[13px] font-semibold tracking-[-0.01em]">
        Code Meridian
      </span>
    </span>
  );
}
