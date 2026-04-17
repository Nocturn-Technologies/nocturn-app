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
        ? "bg-gradient-to-r from-nocturn/20 to-[#E040FB]/20 border border-nocturn/30"
        : "bg-white/5 border border-white/5"
    }`}>
      <div className={`text-lg font-mono font-bold tracking-wider ${
        urgent ? "text-nocturn" : "text-white"
      }`}>
        {timeLeft}
      </div>
      <div className="h-4 w-px bg-white/10" />
      <span className={`text-xs font-medium ${
        urgent ? "text-nocturn" : "text-white/50"
      }`}>
        {label}
      </span>
      {urgent && (
        <span className="ml-auto inline-block w-2 h-2 rounded-full bg-nocturn animate-pulse" />
      )}
    </div>
  );
}
