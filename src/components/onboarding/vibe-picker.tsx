"use client";

import { VIBE_OPTIONS, type VibeKey } from "@/lib/event-templates";

interface VibePickerProps {
  collectiveName: string;
  selected: VibeKey | null;
  onSelect: (vibe: VibeKey) => void;
}

export function VibePicker({ collectiveName, selected, onSelect }: VibePickerProps) {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="space-y-3">
        <div className="section-label-mono">02 / YOUR VIBE</div>
        <h2 className="text-3xl md:text-4xl font-bold font-heading tracking-[-0.025em] leading-[1.05]">
          What&apos;s the vibe<br/>for{" "}
          <span className="text-nocturn-glow">{collectiveName}</span>?
        </h2>
        <p className="text-sm text-muted-foreground">
          This shapes your event templates and page style.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {VIBE_OPTIONS.map((vibe) => {
          const isSelected = selected === vibe.key;
          return (
            <button
              key={vibe.key}
              onClick={() => onSelect(vibe.key)}
              className={`relative flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.98] ${
                isSelected
                  ? "border-nocturn-glow/50 bg-nocturn/10 ring-1 ring-nocturn-glow/40"
                  : "border-white/10 hover:border-nocturn/40 hover:bg-nocturn/[0.04]"
              }`}
            >
              <span className="text-2xl grayscale-0">{vibe.emoji}</span>
              <div>
                <p className="font-semibold text-sm text-white">{vibe.label}</p>
                <p className="text-[11px] font-mono text-muted-foreground leading-tight mt-1 tracking-wide">
                  {vibe.subgenres.join(" · ")}
                </p>
              </div>
              {isSelected && (
                <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-nocturn flex items-center justify-center">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
