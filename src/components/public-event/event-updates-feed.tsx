"use client";

import { useMemo, useState } from "react";
import { Megaphone, Mail, ChevronDown } from "lucide-react";
import type { EventUpdate } from "@/app/actions/event-updates";

interface EventUpdatesFeedProps {
  updates: EventUpdate[];
  accentColor: string;
  collectiveName: string;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

export function EventUpdatesFeed({ updates, accentColor, collectiveName }: EventUpdatesFeedProps) {
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(
    () => [...updates].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [updates]
  );

  if (sorted.length === 0) return null;

  const visible = expanded ? sorted : sorted.slice(0, 3);
  const hasMore = sorted.length > 3;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4" style={{ color: accentColor }} />
          <h3 className="font-heading text-[11px] font-bold tracking-[0.3em] uppercase text-white/40">
            Updates from {collectiveName}
          </h3>
        </div>
        <span className="text-[11px] text-white/50">{sorted.length}</span>
      </div>

      <ol className="space-y-3">
        {visible.map((u) => (
          <li
            key={u.id}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="text-xs font-medium text-white/70 truncate">
                  {u.author_name ?? collectiveName}
                </span>
                <span className="text-[11px] text-white/50 shrink-0">
                  {formatRelative(u.created_at)}
                </span>
              </div>
              {u.email_sent && u.recipient_count > 0 && (
                <span
                  className="flex items-center gap-1 text-[11px] text-white/50 shrink-0"
                  title={`Emailed to ${u.recipient_count} ${u.recipient_count === 1 ? "person" : "people"}`}
                >
                  <Mail className="h-3 w-3" />
                  {u.recipient_count}
                </span>
              )}
            </div>
            <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed break-words">
              {u.body}
            </p>
          </li>
        ))}
      </ol>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full rounded-xl border border-white/10 px-4 py-2.5 text-xs text-white/60 hover:text-white hover:border-white/20 transition-all min-h-[40px] flex items-center justify-center gap-1.5"
        >
          {expanded ? "Show less" : `Show ${sorted.length - 3} more`}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </section>
  );
}
