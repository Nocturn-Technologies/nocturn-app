"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";

interface LiveModeBannerProps {
  eventId: string;
  startsAt: string;
  endsAt: string | null;
}

export function LiveModeBanner({ eventId, startsAt, endsAt }: LiveModeBannerProps) {
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    function check() {
      const now = Date.now();
      const start = new Date(startsAt).getTime();
      // If no ends_at, consider live for 6 hours after start
      const end = endsAt
        ? new Date(endsAt).getTime() + 2 * 60 * 60 * 1000 // +2 hour grace
        : start + 6 * 60 * 60 * 1000;
      setIsLive(now >= start && now <= end);
    }

    check();
    const interval = setInterval(check, 30000); // re-check every 30s
    return () => clearInterval(interval);
  }, [startsAt, endsAt]);

  if (!isLive) return null;

  return (
    <Link href={`/dashboard/events/${eventId}/live`}>
      <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 hover:bg-red-500/15 active:scale-[0.99] transition-all cursor-pointer">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
          <div>
            <span className="text-sm font-bold text-red-400">
              Event is LIVE
            </span>
            <p className="text-xs text-zinc-400">
              Tap to enter live operations mode
            </p>
          </div>
        </div>
        <Radio className="h-5 w-5 text-red-400" />
      </div>
    </Link>
  );
}
