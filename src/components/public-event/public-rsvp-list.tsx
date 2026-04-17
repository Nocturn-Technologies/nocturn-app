"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { listPublicEventRsvps } from "@/app/actions/rsvps";

interface PublicRsvp {
  id: string;
  display_name: string | null;
  status: "yes" | "maybe";
  plus_ones: number;
  created_at: string;
}

interface Props {
  eventId: string;
  accentColor: string;
  initialRsvps: PublicRsvp[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function initialsFromDisplay(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  // "Maya K." → M + K
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Partiful-style live guest list for free / RSVP events.
 *
 * Privacy model:
 * - Server action `listPublicEventRsvps` strips the last name to an initial
 *   BEFORE sending to the client. Raw last names never leave the server.
 * - Realtime subscription is best-effort: payload is IGNORED entirely; we
 *   use the event as a "something changed" ping and refetch the sanitized
 *   list via the server action. If RLS blocks the channel, the 12s poll
 *   keeps the counter accurate.
 */
export function PublicRsvpList({ eventId, accentColor, initialRsvps }: Props) {
  const [rsvps, setRsvps] = useState<PublicRsvp[]>(initialRsvps);
  const [tab, setTab] = useState<"yes" | "maybe">("yes");
  const [, startTransition] = useTransition();
  const [flashId, setFlashId] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(
    new Set(initialRsvps.map((r) => r.id))
  );

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function refetch() {
      const { rsvps: fresh } = await listPublicEventRsvps(eventId);
      if (cancelled) return;
      startTransition(() => {
        setRsvps(fresh);
        // Flash the newest row we've never seen — this is the Partiful
        // dopamine hit. Don't flash on initial hydration since seenIdsRef
        // was primed with initialRsvps.
        for (const r of fresh) {
          if (!seenIdsRef.current.has(r.id)) {
            seenIdsRef.current.add(r.id);
            setFlashId(r.id);
            const id = r.id;
            setTimeout(() => {
              setFlashId((cur) => (cur === id ? null : cur));
            }, 2500);
            break;
          }
        }
        for (const r of fresh) seenIdsRef.current.add(r.id);
      });
    }

    // 12s poll — indistinguishable from "real-time" for an RSVP page and
    // doesn't rely on realtime delivery at all. The poll is the floor.
    const interval = setInterval(refetch, 12_000);

    // Best-effort realtime ping. If RLS blocks SELECT for anon users the
    // channel simply no-ops — no errors, no leaked payload, just falls
    // back to the poll above.
    const channel = supabase
      .channel(`public-rsvps-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rsvps",
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const going = rsvps.filter((r) => r.status === "yes");
  const maybe = rsvps.filter((r) => r.status === "maybe");
  // Going count includes plus-ones (each +1 = one more body in the room).
  // Maybe count is people only — plus-ones on maybes aren't real commitments.
  const goingCount = going.reduce((sum, r) => sum + 1 + r.plus_ones, 0);
  const maybeCount = maybe.length;

  const visible = tab === "yes" ? going : maybe;
  const avatarStackSource = going.slice(0, 8);
  const overflowCount = Math.max(0, going.length - avatarStackSource.length);

  // Empty state — show nothing jarring. The RSVP widget above already
  // prompts people to RSVP; don't double up with a big empty panel.
  if (rsvps.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-[11px] font-bold tracking-[0.3em] uppercase text-white/60">
            Guest list
          </h3>
        </div>
        <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
          <div
            className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: `${accentColor}20` }}
          >
            <Users className="h-5 w-5" style={{ color: accentColor }} />
          </div>
          <p className="text-sm font-medium text-white/80">
            Be the first to RSVP
          </p>
          <p className="mt-1 text-xs text-white/50">
            Everyone who RSVPs will show up here live.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row: section title + live counter */}
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-[11px] font-bold tracking-[0.3em] uppercase text-white/60">
          Guest list
        </h3>
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" style={{ color: accentColor }} />
          <span className="text-xs font-medium text-white/60">
            {goingCount} going
            {maybeCount > 0 ? ` · ${maybeCount} maybe` : ""}
          </span>
        </div>
      </div>

      {/* Avatar stack + headline count — the "social proof" strip */}
      {avatarStackSource.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {avatarStackSource.map((r) => (
              <div
                key={r.id}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-[11px] font-bold text-white"
                style={{
                  backgroundColor: `${accentColor}40`,
                  borderColor: "#09090B",
                }}
                title={r.display_name ?? "Anonymous"}
              >
                {initialsFromDisplay(r.display_name)}
              </div>
            ))}
            {overflowCount > 0 && (
              <div
                className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 bg-white/10 text-[11px] font-semibold text-white/80"
                style={{ borderColor: "#09090B" }}
                aria-label={`+${overflowCount} more going`}
              >
                +{overflowCount}
              </div>
            )}
          </div>
          <p className="text-sm text-white/60">
            <span className="font-semibold text-white">{goingCount}</span>{" "}
            {goingCount === 1 ? "person is" : "people are"} going
          </p>
        </div>
      )}

      {/* Tabs — Going default, Maybe secondary */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("yes")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all min-h-[44px] ${
            tab === "yes"
              ? "bg-white/10 text-white"
              : "bg-transparent text-white/50 hover:text-white/80"
          }`}
        >
          Going <span className="opacity-70">({goingCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("maybe")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all min-h-[44px] ${
            tab === "maybe"
              ? "bg-white/10 text-white"
              : "bg-transparent text-white/50 hover:text-white/80"
          }`}
          disabled={maybeCount === 0}
        >
          Maybe <span className="opacity-70">({maybeCount})</span>
        </button>
      </div>

      {/* The list itself. role=status + aria-live so screen readers
          announce new RSVPs the same way the organizer dashboard does. */}
      <ul
        className="space-y-2"
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        {visible.map((r) => {
          const isFlash = flashId === r.id;
          return (
            <li
              key={r.id}
              className={`flex items-center gap-3 rounded-2xl border p-3 transition-all duration-500 ${
                isFlash
                  ? "bg-white/[0.04]"
                  : "border-white/5 bg-white/[0.02]"
              }`}
              style={
                isFlash
                  ? {
                      borderColor: `${accentColor}60`,
                      boxShadow: `0 0 0 1px ${accentColor}30`,
                    }
                  : undefined
              }
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                style={{ backgroundColor: `${accentColor}30` }}
              >
                {initialsFromDisplay(r.display_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="font-semibold text-white truncate">
                    {r.display_name || (
                      <span className="text-white/50 italic">Anonymous</span>
                    )}
                  </p>
                  {r.plus_ones > 0 && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0"
                      style={{
                        backgroundColor: `${accentColor}20`,
                        color: accentColor,
                      }}
                    >
                      +{r.plus_ones}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-white/60 shrink-0">
                    {timeAgo(r.created_at)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
