"use client";

import { useState, useEffect } from "react";

export function EventCountdown({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [label, setLabel] = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    function update() {
      const now = Date.now();
      const target = new Date(targetDate).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft("NOW");
        setLabel("Happening now");
        setUrgent(true);
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h`);
        setLabel(days === 1 ? "Tomorrow" : `${days} days to go`);
        setUrgent(days <= 1);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
        setLabel("Doors open soon");
        setUrgent(true);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`);
        setLabel("Almost time");
        setUrgent(true);
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (!timeLeft) return null;

  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
      urgent
        ? "bg-gradient-to-r from-[#7B2FF7]/20 to-[#E040FB]/20 border border-[#7B2FF7]/30"
        : "bg-white/5 border border-white/5"
    }`}>
      <div className={`text-lg font-mono font-bold tracking-wider ${
        urgent ? "text-[#7B2FF7]" : "text-white"
      }`}>
        {timeLeft}
      </div>
      <div className="h-4 w-px bg-white/10" />
      <span className={`text-xs font-medium ${
        urgent ? "text-[#7B2FF7]" : "text-white/50"
      }`}>
        {label}
      </span>
      {urgent && (
        <span className="ml-auto inline-block w-2 h-2 rounded-full bg-[#7B2FF7] animate-pulse" />
      )}
    </div>
  );
}

export function SellingFastBadge({ soldPercent }: { soldPercent: number }) {
  if (soldPercent < 50) return null;

  const label = soldPercent >= 90
    ? "Almost sold out!"
    : soldPercent >= 75
      ? "Selling fast 🔥"
      : "Over 50% sold";

  const color = soldPercent >= 90
    ? "bg-red-500/10 text-red-400 border-red-500/20"
    : soldPercent >= 75
      ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
      : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${color}`}>
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {label}
    </span>
  );
}
