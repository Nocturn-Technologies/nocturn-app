"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ScanLine,
  ClipboardList,
  Music,
  DollarSign,
  Users,
  Clock,
} from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventData {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  doors_at: string | null;
}

interface TicketTier {
  id: string;
  name: string;
  price: number;
  capacity: number | null;
}

interface CheckIn {
  id: string;
  attendee_name: string;
  tier_name: string;
  checked_in_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

function getCapacityColor(pct: number): string {
  if (pct < 70) return "text-green-400";
  if (pct < 90) return "text-yellow-400";
  return "text-red-400";
}

function getCapacityBarColor(pct: number): string {
  if (pct < 70) return "bg-green-500";
  if (pct < 90) return "bg-yellow-500";
  return "bg-red-500";
}

// ─── Live Pulse Badge ─────────────────────────────────────────────────────────

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-400">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      LIVE
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LiveEventPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const supabaseRef = React.useRef(createClient());
  const supabase = supabaseRef.current;

  const [event, setEvent] = useState<EventData | null>(null);
  const [tiers, setTiers] = useState<TicketTier[]>([]);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [recentCheckIns, setRecentCheckIns] = useState<CheckIn[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);

  // Revenue estimate: sum of checked-in ticket prices
  const [revenue, setRevenue] = useState(0);

  // ── Fetch initial data ────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    // Get event
    const { data: eventData } = await supabase
      .from("events")
      .select("id, title, starts_at, ends_at, doors_at, bar_minimum, venue_deposit, estimated_bar_revenue")
      .eq("id", eventId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!eventData) {
      setLoading(false);
      return;
    }
    setEvent(eventData);

    // Parallel: fetch tiers, revenue (all checked-in tickets), and recent check-ins
    const [{ data: tierData }, { data: allTickets, count }, { data: recentTickets }] = await Promise.all([
      supabase
        .from("ticket_tiers")
        .select("id, name, price, capacity")
        .eq("event_id", eventId),
      supabase
        .from("tickets")
        .select("price_paid", { count: "exact" })
        .eq("event_id", eventId)
        .not("checked_in_at", "is", null),
      supabase
        .from("tickets")
        .select("id, checked_in_at, attendee_name, ticket_tiers(name)")
        .eq("event_id", eventId)
        .not("checked_in_at", "is", null)
        .order("checked_in_at", { ascending: false })
        .limit(10),
    ]);

    const tiersArr = tierData ?? [];
    setTiers(tiersArr);
    setTotalCapacity(tiersArr.reduce((sum, t) => sum + (t.capacity ?? 0), 0));

    setCheckedInCount(count ?? 0);

    // Sum actual revenue from all checked-in tickets
    if (allTickets) {
      const rev = allTickets.reduce((sum, t) => sum + (Number(t.price_paid) || 0), 0);
      setRevenue(rev);
    }

    if (recentTickets) {
      setRecentCheckIns(
        recentTickets.map((t) => ({
          id: t.id,
          attendee_name: t.attendee_name ?? "Guest",
          tier_name: (t.ticket_tiers as unknown as { name: string } | null)?.name ?? "GA",
          checked_in_at: t.checked_in_at!,
        }))
      );
    }

    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Elapsed timer ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!event) return;
    const doorsTime = event.doors_at ?? event.starts_at;
    const start = new Date(doorsTime).getTime();

    const interval = setInterval(() => {
      setElapsed(Date.now() - start);
    }, 1000);

    return () => clearInterval(interval);
  }, [event]);

  // ── Supabase Realtime subscription ────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`live-checkins-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tickets",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const newRow = payload.new as {
            id: string;
            checked_in_at: string | null;
            attendee_name: string | null;
          };

          if (newRow.checked_in_at) {
            setCheckedInCount((prev) => prev + 1);

            // Add to recent check-ins
            setRecentCheckIns((prev) => [
              {
                id: newRow.id,
                attendee_name: newRow.attendee_name ?? "Guest",
                tier_name: "GA",
                checked_in_at: newRow.checked_in_at!,
              },
              ...prev.slice(0, 9),
            ]);

            // Estimate revenue bump (average tier price)
            if (tiers.length > 0) {
              const avgPrice =
                tiers.reduce((s, t) => s + Number(t.price), 0) / tiers.length;
              setRevenue((prev) => prev + avgPrice);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // ── Capacity calculations ─────────────────────────────────────────────────

  const capacityPct =
    totalCapacity > 0 ? Math.round((checkedInCount / totalCapacity) * 100) : 0;
  const checkinPct =
    totalCapacity > 0
      ? Math.min((checkedInCount / totalCapacity) * 100, 100)
      : 0;

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-[#7B2FF7] border-t-transparent animate-spin" />
          <span className="text-sm text-zinc-400">Loading live mode...</span>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-zinc-400">Event not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button
            variant="ghost"
            size="icon"
            className="min-h-[44px] min-w-[44px]"
            aria-label="Back to event"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold truncate font-heading">
              {event.title}
            </h1>
            <LiveBadge />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5">
            <Clock className="h-3 w-3" />
            <span>{formatElapsed(elapsed)} since doors</span>
          </div>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 gap-3">
        {/* Check-ins */}
        <div className="rounded-xl border border-white/5 bg-zinc-900 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Check-ins
            </span>
            <Users className="h-4 w-4 text-[#7B2FF7]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-heading text-white tabular-nums">
              {checkedInCount}
            </span>
            <span className="text-lg text-zinc-500">/ {totalCapacity}</span>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#7B2FF7] transition-all duration-700 ease-out"
              style={{ width: `${checkinPct}%` }}
            />
          </div>
        </div>

        {/* Revenue + Capacity row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Revenue */}
          <div className="rounded-xl border border-white/5 bg-zinc-900 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Revenue
              </span>
              <DollarSign className="h-4 w-4 text-green-400" />
            </div>
            <span className="text-3xl font-bold font-heading text-white tabular-nums">
              ${revenue.toLocaleString()}
            </span>
          </div>

          {/* Capacity */}
          <div className="rounded-xl border border-white/5 bg-zinc-900 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Capacity
              </span>
              <div
                className={`h-2 w-2 rounded-full ${getCapacityBarColor(capacityPct)}`}
              />
            </div>
            <span
              className={`text-3xl font-bold font-heading tabular-nums ${getCapacityColor(capacityPct)}`}
            >
              {capacityPct}%
            </span>
          </div>
        </div>
      </div>

      {/* Bar Minimum Tracker */}
      {event && (() => {
        const ev = event as unknown as Record<string, unknown>;
        const barMin = Number(ev.bar_minimum ?? 0);
        if (barMin <= 0) return null;
        const deposit = Number(ev.venue_deposit ?? 0);
        const estimatedBar = Number(ev.estimated_bar_revenue ?? 0);
        const barPct = estimatedBar > 0 ? Math.min(Math.round((estimatedBar / barMin) * 100), 100) : 0;
        const atRisk = estimatedBar < barMin;
        return (
          <div className={`rounded-xl border ${atRisk ? "border-red-500/30 bg-red-500/5" : "border-green-500/30 bg-green-500/5"} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Bar Minimum
              </span>
              {atRisk ? (
                <span className="text-[11px] font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                  ⚠️ ${deposit.toLocaleString()} deposit at risk
                </span>
              ) : (
                <span className="text-[11px] font-medium text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                  ✅ On track
                </span>
              )}
            </div>
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-bold font-heading text-white tabular-nums">
                ${estimatedBar.toLocaleString()}
              </span>
              <span className="text-sm text-zinc-400">/ ${barMin.toLocaleString()}</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${atRisk ? "bg-red-500" : "bg-green-500"}`}
                style={{ width: `${barPct}%` }}
              />
            </div>
            {atRisk && deposit > 0 && (
              <p className="text-[11px] text-red-400/80 mt-2">
                You need ${(barMin - estimatedBar).toLocaleString()} more in bar sales to keep your ${deposit.toLocaleString()} deposit.
              </p>
            )}
          </div>
        );
      })()}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href={`/dashboard/events/${eventId}/check-in`}>
          <button className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-zinc-900 p-5 min-h-[80px] hover:bg-zinc-800 active:scale-[0.98] transition-all">
            <ScanLine className="h-6 w-6 text-[#7B2FF7]" />
            <span className="text-sm font-medium text-white">
              Scan Tickets
            </span>
          </button>
        </Link>

        <Link href={`/dashboard/events/${eventId}/guests`}>
          <button className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-zinc-900 p-5 min-h-[80px] hover:bg-zinc-800 active:scale-[0.98] transition-all">
            <ClipboardList className="h-6 w-6 text-[#7B2FF7]" />
            <span className="text-sm font-medium text-white">Guest List</span>
          </button>
        </Link>

        <Link href={`/dashboard/events/${eventId}/lineup`}>
          <button className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-zinc-900 p-5 min-h-[80px] hover:bg-zinc-800 active:scale-[0.98] transition-all">
            <Music className="h-6 w-6 text-[#7B2FF7]" />
            <span className="text-sm font-medium text-white">Lineup</span>
          </button>
        </Link>

        <button
          onClick={() => {
            // Quick door-sale: future implementation
            setCheckedInCount((prev) => prev + 1);
            if (tiers.length > 0) {
              const avgPrice =
                tiers.reduce((s, t) => s + Number(t.price), 0) / tiers.length;
              setRevenue((prev) => prev + avgPrice);
            }
            setRecentCheckIns((prev) => [
              {
                id: `walk-up-${Date.now()}`,
                attendee_name: "Walk-up",
                tier_name: "Door Sale",
                checked_in_at: new Date().toISOString(),
              },
              ...prev.slice(0, 9),
            ]);
          }}
          className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-zinc-900 p-5 min-h-[80px] hover:bg-zinc-800 active:scale-[0.98] transition-all"
        >
          <DollarSign className="h-6 w-6 text-green-400" />
          <span className="text-sm font-medium text-white">Door Sales</span>
        </button>
      </div>

      {/* Recent Activity Feed */}
      <div className="rounded-xl border border-white/5 bg-zinc-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Recent Activity
          </span>
        </div>
        {recentCheckIns.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-zinc-500">
              No check-ins yet. Waiting for guests...
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
            {recentCheckIns.map((ci) => (
              <div
                key={ci.id}
                className="flex items-center justify-between px-5 py-3 animate-fade-in-up"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-[#7B2FF7]/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-[#7B2FF7]">
                      {ci.attendee_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {ci.attendee_name}
                    </p>
                    <p className="text-xs text-zinc-500">{ci.tier_name}</p>
                  </div>
                </div>
                <span className="text-xs text-zinc-500 shrink-0">
                  {timeAgo(ci.checked_in_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
