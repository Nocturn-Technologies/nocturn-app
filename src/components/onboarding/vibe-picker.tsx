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
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          Pick a vibe for{" "}
          <span className="text-nocturn">{collectiveName}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          This shapes your event templates and page style
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {VIBE_OPTIONS.map((vibe) => {
          const isSelected = selected === vibe.key;
          return (
            <button
              key={vibe.key}
              onClick={() => onSelect(vibe.key)}
              className={`relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                isSelected
                  ? "border-nocturn bg-nocturn/10 ring-1 ring-nocturn/50"
                  : "border-border hover:border-nocturn/30 hover:bg-card"
              }`}
            >
              <span className="text-2xl">{vibe.emoji}</span>
              <div>
                <p className="font-semibold text-sm text-white">{vibe.label}</p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  {vibe.subgenres.join(" / ")}
                </p>
              </div>
              {isSelected && (
                <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-nocturn flex items-center justify-center">
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
