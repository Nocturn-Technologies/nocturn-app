"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  listEventTicketHolders,
  type TicketHolder,
  type TicketHolderStatus,
} from "@/app/actions/ticket-holders";
import { Ticket, Mail, Check, RotateCcw, Circle, Copy, CheckCheck, Download } from "lucide-react";

interface Props {
  eventId: string;
  initialHolders: TicketHolder[];
}

type Filter = TicketHolderStatus | "all";

// Paid + checked_in are the "real" holders (money in, at the door or not).
// Refunded surfaces for visibility (cancellations matter for settlement).
// Reserved = Stripe Checkout session that hasn't completed — rarely useful
// but worth leaving filterable rather than hiding outright.
const STATUS_META: Record<TicketHolderStatus, { label: string; icon: typeof Check; color: string; bg: string }> = {
  paid:       { label: "Paid",       icon: Check,    color: "text-green-400",  bg: "bg-green-500/10 ring-green-500/20" },
  checked_in: { label: "Checked in", icon: CheckCheck, color: "text-nocturn",  bg: "bg-nocturn/10 ring-nocturn/30" },
  refunded:   { label: "Refunded",   icon: RotateCcw, color: "text-zinc-400",  bg: "bg-zinc-500/10 ring-zinc-500/20" },
  reserved:   { label: "Pending",    icon: Circle,   color: "text-yellow-400", bg: "bg-yellow-500/10 ring-yellow-500/20" },
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

function formatMoney(amount: number, currency: string): string {
  const c = currency.toUpperCase();
  return `${c === "USD" || c === "CAD" || c === "AUD" ? "$" : ""}${amount.toFixed(2)}${c !== "USD" ? ` ${c}` : ""}`;
}

export function TicketHoldersLiveList({ eventId, initialHolders }: Props) {
  const [holders, setHolders] = useState<TicketHolder[]>(initialHolders);
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [copiedAll, setCopiedAll] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);

  // Realtime: any ticket insert/update/delete for this event triggers a refetch.
  // Covers new purchases, check-ins, and refunds in one subscription.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`tickets-live-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets", filter: `event_id=eq.${eventId}` },
        (payload) => {
          startTransition(async () => {
            const { holders: fresh } = await listEventTicketHolders(eventId);
            setHolders(fresh);
            const rowId =
              (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id ?? null;
            if (rowId) {
              setFlashId(rowId);
              setTimeout(() => setFlashId((cur) => (cur === rowId ? null : cur)), 2500);
            }
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  // Counts exclude reserved (in-flight Stripe sessions) from headline numbers.
  const counts = {
    paid: holders.filter((h) => h.status === "paid").length,
    checked_in: holders.filter((h) => h.status === "checked_in").length,
    refunded: holders.filter((h) => h.status === "refunded").length,
    reserved: holders.filter((h) => h.status === "reserved").length,
    total: holders.filter((h) => h.status !== "reserved").length,
  };

  // Revenue totals, grouped by currency so mixed-currency events don't
  // lie about the number. Buyers typically pay in one currency per event
  // (Stripe checkout currency), but allow for edge cases gracefully.
  const revenueByCurrency = holders
    .filter((h) => h.status === "paid" || h.status === "checked_in")
    .reduce<Record<string, number>>((acc, h) => {
      acc[h.currency] = (acc[h.currency] ?? 0) + h.price_paid;
      return acc;
    }, {});

  const visible =
    filter === "all"
      ? holders.filter((h) => h.status !== "reserved") // hide pending by default
      : holders.filter((h) => h.status === filter);

  async function copyAllEmails() {
    const emails = holders
      .filter((h) => (h.status === "paid" || h.status === "checked_in") && h.email)
      .map((h) => h.email as string);
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
    const header = ["Name", "Email", "Status", "Tier", "Price Paid", "Currency", "Checked In At", "Purchased At"];
    const rows = holders.map((h) => [
      h.full_name ?? "",
      h.email ?? "",
      h.status,
      h.tier_name ?? "",
      h.price_paid.toFixed(2),
      h.currency.toUpperCase(),
      h.checked_in_at ?? "",
      h.created_at,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell).replace(/"/g, '""');
            return /[",\n]/.test(s) ? `"${s}"` : s;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-holders-${eventId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (holders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-nocturn/10">
          <Ticket className="h-5 w-5 text-nocturn" />
        </div>
        <p className="text-sm font-medium text-foreground">No ticket sales yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          As people buy tickets, they&apos;ll show up here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all min-h-[44px] ${
            filter === "all" ? "bg-nocturn text-white" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          All <span className="opacity-70">({counts.total})</span>
        </button>
        <button
          onClick={() => setFilter("paid")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all min-h-[44px] ${
            filter === "paid"
              ? "bg-green-500/20 text-green-300 ring-1 ring-green-500/40"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          Paid <span className="opacity-70">({counts.paid})</span>
        </button>
        <button
          onClick={() => setFilter("checked_in")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all min-h-[44px] ${
            filter === "checked_in"
              ? "bg-nocturn/20 text-nocturn ring-1 ring-nocturn/40"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          Checked in <span className="opacity-70">({counts.checked_in})</span>
        </button>
        {counts.refunded > 0 && (
          <button
            onClick={() => setFilter("refunded")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all min-h-[44px] ${
              filter === "refunded"
                ? "bg-zinc-500/20 text-zinc-300 ring-1 ring-zinc-500/40"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            Refunded <span className="opacity-70">({counts.refunded})</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={copyAllEmails}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-nocturn/30 transition-all min-h-[44px]"
            title="Copy all paid + checked-in emails"
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

      {/* Revenue summary row — mixed currency aware */}
      {Object.keys(revenueByCurrency).length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Revenue</span>
          {Object.entries(revenueByCurrency).map(([curr, amount]) => (
            <span key={curr} className="font-mono">
              {formatMoney(amount, curr)}
            </span>
          ))}
          <span className="ml-auto text-muted-foreground/70">
            {counts.checked_in} of {counts.paid + counts.checked_in} checked in
          </span>
        </div>
      )}

      {/* List — aria-live so screen readers hear ticket updates as they
          stream in. Matches the visual flash-on-change pattern for SR users. */}
      <ul className="space-y-2" role="status" aria-live="polite" aria-atomic="false">
        {visible.map((h) => {
          const meta = STATUS_META[h.status];
          const Icon = meta.icon;
          const isFlash = flashId === h.id;
          return (
            <li
              key={h.id}
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
                    {h.full_name || <span className="text-muted-foreground italic">Guest</span>}
                  </p>
                  {h.tier_name && (
                    <span className="rounded-full bg-nocturn/10 px-2 py-0.5 text-[11px] font-semibold text-nocturn">
                      {h.tier_name}
                    </span>
                  )}
                  <span className={`text-[11px] font-medium ${meta.color}`}>{meta.label}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground/70">
                    {timeAgo(h.created_at)}
                  </span>
                </div>

                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {h.email && (
                    <a
                      href={`mailto:${h.email}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-nocturn transition-colors"
                    >
                      <Mail className="h-3 w-3" /> {h.email}
                    </a>
                  )}
                  <span className="text-xs text-muted-foreground/80 font-mono">
                    {formatMoney(h.price_paid, h.currency)}
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
