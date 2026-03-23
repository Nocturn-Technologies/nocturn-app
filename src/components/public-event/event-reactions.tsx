"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const EMOJIS = ["🔥", "💯", "🙌", "🎉", "💜"] as const;

interface ReactionCounts {
  [emoji: string]: number;
}

interface EventReactionsProps {
  eventId: string;
  initialCounts: ReactionCounts;
}

function getFingerprint(): string {
  // Simple browser fingerprint — good enough for casual dedup
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const raw = [
    nav?.userAgent ?? "",
    nav?.language ?? "",
    screen?.width ?? 0,
    screen?.height ?? 0,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join("|");

  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function EventReactions({ eventId, initialCounts }: EventReactionsProps) {
  const [counts, setCounts] = useState<ReactionCounts>(initialCounts);
  const [reacted, setReacted] = useState<Set<string>>(new Set());
  const [animating, setAnimating] = useState<string | null>(null);

  // Load which emojis this user already reacted to
  useEffect(() => {
    const fp = getFingerprint();
    const supabase = createClient();

    supabase
      .from("event_reactions")
      .select("emoji")
      .eq("event_id", eventId)
      .eq("fingerprint", fp)
      .then(({ data }) => {
        if (data) {
          setReacted(new Set(data.map((r) => r.emoji)));
        }
      });
  }, [eventId]);

  const handleReaction = useCallback(
    async (emoji: string) => {
      if (reacted.has(emoji)) return; // already reacted

      const fp = getFingerprint();
      const supabase = createClient();

      // Optimistic update
      setCounts((prev) => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
      setReacted((prev) => new Set(prev).add(emoji));
      setAnimating(emoji);
      setTimeout(() => setAnimating(null), 600);

      const { error } = await supabase
        .from("event_reactions")
        .insert({ event_id: eventId, emoji, fingerprint: fp });

      if (error) {
        // Revert on conflict (already reacted)
        setCounts((prev) => ({ ...prev, [emoji]: Math.max(0, (prev[emoji] || 0) - 1) }));
        setReacted((prev) => {
          const next = new Set(prev);
          next.delete(emoji);
          return next;
        });
      }
    },
    [eventId, reacted]
  );

  const totalReactions = Object.values(counts).reduce((s, c) => s + c, 0);

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-white/40">
        Vibes
      </h2>
      <div className="flex flex-wrap gap-2">
        {EMOJIS.map((emoji) => {
          const count = counts[emoji] || 0;
          const isReacted = reacted.has(emoji);
          const isAnimating = animating === emoji;

          return (
            <button
              key={emoji}
              onClick={() => handleReaction(emoji)}
              disabled={isReacted}
              className={`
                flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm
                transition-all duration-200
                ${
                  isReacted
                    ? "border-white/20 bg-white/10 cursor-default"
                    : "border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/10 active:scale-95"
                }
                ${isAnimating ? "scale-110" : ""}
              `}
            >
              <span className={`text-base ${isAnimating ? "animate-bounce" : ""}`}>
                {emoji}
              </span>
              {count > 0 && (
                <span className="text-xs font-medium text-white/50">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {totalReactions > 0 && (
        <p className="text-xs text-white/30">
          {totalReactions} {totalReactions === 1 ? "reaction" : "reactions"}
        </p>
      )}
    </div>
  );
}
