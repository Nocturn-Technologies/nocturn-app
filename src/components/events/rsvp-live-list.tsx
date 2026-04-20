"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { listEventRsvps, type RsvpStatus } from "@/app/actions/rsvps";
import { Users, Mail, Check, HelpCircle, X, Copy, CheckCheck, Download } from "lucide-react";

interface Rsvp {
  id: string;
  status: RsvpStatus;
  full_name: string | null;
  email: string | null;
  plus_ones: number;
  message: string | null;
  created_at: string;
}

interface Props {
  eventId: string;
  initialRsvps: Rsvp[];
}

const STATUS_META: Record<RsvpStatus, { label: string; icon: typeof Check; color: string; bg: string }> = {
  yes: { label: "Going", icon: Check, color: "text-green-400", bg: "bg-green-500/10 ring-green-500/20" },
  maybe: { label: "Maybe", icon: HelpCircle, color: "text-yellow-400", bg: "bg-yellow-500/10 ring-yellow-500/20" },
  no: { label: "Can't make it", icon: X, color: "text-zinc-400", bg: "bg-zinc-500/10 ring-zinc-500/20" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

export function RsvpLiveList({ eventId, initialRsvps }: Props) {
  const [rsvps, setRsvps] = useState<Rsvp[]>(initialRsvps);
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<RsvpStatus | "all">("all");
  const [copiedAll, setCopiedAll] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<string | null>(null);

  // Realtime subscription — any insert/update/delete on this event's rsvps triggers a refetch
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`rsvps-live-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rsvps", filter: `event_id=eq.${eventId}` },
        (payload) => {
          startTransition(async () => {
            const { rsvps: fresh } = await listEventRsvps(eventId);
            setRsvps(fresh);
            // Flash the newest row briefly so the organizer sees the change
            const rowId =
              (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id ?? null;
            if (rowId) {
              setFlashId(rowId);
              setTimeout(() => setFlashId((cur) => (cur === rowId ? null : cur)), 2500);
              // Announce to screen readers for new/updated RSVPs
              const row = fresh.find((r) => r.id === rowId);
              if (row && payload.eventType !== "DELETE") {
                const statusLabel = STATUS_META[row.status]?.label ?? row.status;
                const who = row.full_name || "Anonymous";
                setAnnounce(`New RSVP: ${who}, ${statusLabel}`);
                setTimeout(() => setAnnounce(null), 3000);
              }
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const counts = {
    yes: rsvps.filter((r) => r.status === "yes").reduce((sum, r) => sum + 1 + r.plus_ones, 0),
    maybe: rsvps.filter((r) => r.status === "maybe").length,
    no: rsvps.filter((r) => r.status === "no").length,
    total: rsvps.length,
  };

  const visible = filter === "all" ? rsvps : rsvps.filter((r) => r.status === filter);

  async function copyAllEmails() {
    const emails = rsvps
      .filter((r) => r.status !== "no" && r.email)
      .map((r) => r.email as string);
    if (emails.length === 0) return;
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // noop — clipboard may be blocked
    }
  }

  function downloadCsv() {
    const header = ["Name", "Email", "Status", "Plus Ones", "Message", "RSVP'd At"];
    const rows = rsvps.map((r) => [
      r.full_name ?? "",
      r.email ?? "",
      r.status,
      String(r.plus_ones),
      r.message ?? "",
      r.created_at,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell).replace(/"/g, '""');
            return /[",\n]/.test(s) ? `"${s}"` : s;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsvps-${eventId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (rsvps.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-nocturn/10">
          <Users className="h-5 w-5 text-nocturn" />
        </div>
        <p className="text-sm font-medium text-foreground">No RSVPs yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          As people RSVP on your public page, they&apos;ll show up here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary row + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all min-h-[44px] ${
            filter === "all"
              ? "bg-nocturn text-white"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          All <span className="opacity-70">({counts.total})</span>
        </button>
        <button
          onClick={() => setFilter("yes")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all min-h-[44px] ${
            filter === "yes"
              ? "bg-green-500/20 text-green-300 ring-1 ring-green-500/40"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          Going <span className="opacity-70">({counts.yes})</span>
        </button>
        <button
          onClick={() => setFilter("maybe")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all min-h-[44px] ${
            filter === "maybe"
              ? "bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/40"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          Maybe <span className="opacity-70">({counts.maybe})</span>
        </button>
        <button
          onClick={() => setFilter("no")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all min-h-[44px] ${
            filter === "no"
              ? "bg-zinc-500/20 text-zinc-300 ring-1 ring-zinc-500/40"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          Can&apos;t make it <span className="opacity-70">({counts.no})</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={copyAllEmails}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-nocturn/30 transition-all min-h-[44px]"
            title="Copy all Going + Maybe emails"
          >
            {copiedAll ? (
              <>
                <CheckCheck className="h-3 w-3 text-green-400" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Copy emails
              </>
            )}
          </button>
          <button
            onClick={downloadCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-nocturn/30 transition-all min-h-[44px]"
            title="Download CSV"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
      </div>

      {/* Screen reader announcement */}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      {/* List */}
      <ul className="space-y-2" role="status" aria-live="polite" aria-atomic="false">
        {visible.map((r) => {
          const meta = STATUS_META[r.status];
          const Icon = meta.icon;
          const isFlash = flashId === r.id;
          return (
            <li
              key={r.id}
              className={`flex items-start gap-3 rounded-2xl border p-3 transition-all duration-500 ${
                isFlash
                  ? "border-nocturn/60 bg-nocturn/5 ring-1 ring-nocturn/30"
                  : "border-border bg-card hover:border-nocturn/20"
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${meta.bg}`}
              >
                <Icon className={`h-4 w-4 ${meta.color}`} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="font-semibold text-foreground truncate">
                    {r.full_name || <span className="text-muted-foreground italic">Anonymous</span>}
                  </p>
                  {r.plus_ones > 0 && (
                    <span className="rounded-full bg-nocturn/10 px-2 py-0.5 text-[11px] font-semibold text-nocturn">
                      +{r.plus_ones}
                    </span>
                  )}
                  <span className={`text-[11px] font-medium ${meta.color}`}>{meta.label}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground/70">
                    {timeAgo(r.created_at)}
                  </span>
                </div>

                {r.email && (
                  <a
                    href={`mailto:${r.email}`}
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-nocturn transition-colors"
                  >
                    <Mail className="h-3 w-3" /> {r.email}
                  </a>
                )}

                {r.message && (
                  <p className="mt-1.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground italic">
                    &ldquo;{r.message}&rdquo;
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
