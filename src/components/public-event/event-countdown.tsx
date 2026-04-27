"use client";

import { useState, useEffect } from "react";

type Variant = "default" | "hero";

interface EventCountdownProps {
  targetDate: string;
  variant?: Variant;
  /** Optional footer line (e.g. "MAY 9 · 10:00 PM EDT") rendered under the hero variant */
  footerLine?: string;
}

interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

function pad(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function diffParts(targetMs: number): Parts {
  const now = Date.now();
  const diff = Math.max(0, targetMs - now);
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { days, hours, minutes, seconds, done: false };
}

export function EventCountdown({ targetDate, variant = "default", footerLine }: EventCountdownProps) {
  const [parts, setParts] = useState<Parts | null>(null);

  useEffect(() => {
    const targetMs = new Date(targetDate).getTime();
    function tick() {
      setParts(diffParts(targetMs));
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (!parts) return null;

  if (variant === "hero") {
    return (
      <div className="max-w-[420px] lg:ml-auto" aria-live="polite">
        <div className="flex items-center justify-between mb-3">
          <div className="brutalist-mono text-[11px] tracking-[0.32em] uppercase text-white/55 font-medium">
            &mdash; DOORS IN
          </div>
          <div className="brutalist-mono text-[10px] tracking-[0.28em] uppercase text-white/35 hidden sm:block">
            LIVE
          </div>
        </div>
        <div className="h-[1.5px] bg-white/[0.18] mb-1" />

        <CountdownRow value={pad(parts.days)} unit="Days" />
        <CountdownRow value={pad(parts.hours)} unit="Hrs" />
        <CountdownRow value={pad(parts.minutes)} unit="Min" />
        <CountdownRow value={pad(parts.seconds)} unit="Sec" accent />

        <div className="h-[1.5px] bg-white/[0.18] mt-1 mb-3" />
        {footerLine && (
          <div className="brutalist-mono text-[11px] tracking-[0.28em] uppercase text-white/45">
            {footerLine}
          </div>
        )}
      </div>
    );
  }

  // Default variant — preserved original presentation
  const totalMinutes = parts.days * 24 * 60 + parts.hours * 60 + parts.minutes;
  const urgent = parts.done || parts.days <= 1;
  const timeLeft = parts.done
    ? "NOW"
    : parts.days > 0
      ? `${parts.days}d ${parts.hours}h`
      : parts.hours > 0
        ? `${parts.hours}h ${parts.minutes}m`
        : `${parts.minutes}m ${parts.seconds}s`;
  const label = parts.done
    ? "Happening now"
    : parts.days > 1
      ? `${parts.days} days to go`
      : parts.days === 1
        ? "Tomorrow"
        : parts.hours > 0
          ? "Doors open soon"
          : "Almost time";

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
        urgent
          ? "bg-gradient-to-r from-nocturn/20 to-[#E040FB]/20 border border-nocturn/30"
          : "bg-white/5 border border-white/5"
      }`}
      data-total-minutes={totalMinutes}
    >
      <div className={`text-lg font-mono font-bold tracking-wider ${urgent ? "text-nocturn" : "text-white"}`}>
        {timeLeft}
      </div>
      <div className="h-4 w-px bg-white/10" />
      <span className={`text-xs font-medium ${urgent ? "text-nocturn" : "text-white/50"}`}>
        {label}
      </span>
      {urgent && (
        <span className="ml-auto inline-block w-2 h-2 rounded-full bg-nocturn animate-pulse" />
      )}
    </div>
  );
}

function CountdownRow({ value, unit, accent = false }: { value: string; unit: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[0.85rem] border-t border-white/[0.06] first-of-type:border-t-0">
      <span
        className={`brutalist-mono font-bold leading-none ${accent ? "text-nocturn" : "text-white"}`}
        style={{ fontSize: "clamp(2.6rem, 6vw, 4.5rem)" }}
      >
        {value}
      </span>
      <span className="brutalist-mono text-[11px] tracking-[0.32em] uppercase text-white/45 font-medium">
        {unit}
      </span>
    </div>
  );
}
