"use client";

interface NocturnLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
}

export function NocturnLogo({ size = "md", showText = true, className = "" }: NocturnLogoProps) {
  const sizes = {
    sm: { moon: "text-lg", text: "text-lg" },
    md: { moon: "text-2xl", text: "text-2xl" },
    lg: { moon: "text-4xl", text: "text-4xl" },
    xl: { moon: "text-5xl", text: "text-5xl" },
  };
  const s = sizes[size];

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className={s.moon}>🌙</span>
      {showText && (
        <span className={`${s.text} font-bold tracking-tight font-heading`}>
          noctur<span className="text-[#A855F7]">n</span>
        </span>
      )}
    </div>
  );
}
