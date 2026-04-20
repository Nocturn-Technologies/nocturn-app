interface NocturnLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
}

export function NocturnLogo({ size = "md", showText = true, className = "" }: NocturnLogoProps) {
  const sizes = {
    sm: { mark: 16, text: "text-lg", gap: "gap-2" },
    md: { mark: 20, text: "text-xl", gap: "gap-2.5" },
    lg: { mark: 28, text: "text-3xl", gap: "gap-3" },
    xl: { mark: 36, text: "text-4xl", gap: "gap-3" },
  };
  const s = sizes[size];

  return (
    <div className={`inline-flex items-center ${s.gap} ${className}`}>
      <svg
        width={s.mark}
        height={s.mark}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="16" cy="16" r="12" fill="#7B2FF7" />
        <circle cx="20" cy="14" r="10" fill="#09090B" />
      </svg>
      {showText && (
        <span
          className={`${s.text} font-heading font-bold tracking-[-0.025em]`}
        >
          nocturn<span className="text-nocturn">.</span>
        </span>
      )}
    </div>
  );
}
