"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContactSegment = "vip" | "repeat" | "new" | "lapsed";

export interface CRMContact {
  email: string;
  name: string | null;
  eventsAttended: number;
  totalSpent: number;
  ticketCount: number;
  firstSeen: string;
  lastSeen: string;
  referralCount: number;
  segment: ContactSegment;
  eventTitles: string[];
  // Sparkline data: spent per event (last 6)
  spendHistory: number[];
}

export interface CRMStats {
  totalContacts: number;
  vipCount: number;
  repeatRate: number; // percentage of contacts with 2+ events
  avgLTV: number;
}

export interface CRMResult {
  error: string | null;
  contacts: CRMContact[];
  stats: CRMStats;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeSegment(eventsAttended: number, lastSeen: string): ContactSegment {
  if (!lastSeen) return "new";

  const daysSinceLastSeen =
    (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceLastSeen >= 90) return "lapsed";
  if (eventsAttended >= 5) return "vip";
  if (eventsAttended >= 2) return "repeat";
  return "new";
}

async function getCollectiveIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", userId)
    .is("deleted_at", null);

  return (data as { collective_id: string }[] | null)?.map((m) => m.collective_id) ?? [];
}

// ── Main Action ────────────────────────────────────────────────────────────────

export async function getNetworkCRM(): Promise<CRMResult> {
  const empty: CRMResult = {
    error: null,
    contacts: [],
    stats: { totalContacts: 0, vipCount: 0, repeatRate: 0, avgLTV: 0 },
  };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ...empty, error: "Not logged in" };
  }

  const admin = createAdminClient();

  // Get user's collectives
  const collectiveIds = await getCollectiveIds(user.id);
  if (collectiveIds.length === 0) return empty;

  // Get all events for these collectives
  const { data: eventsRaw } = await admin
    .from("events")
    .select("id, title, starts_at")
    .in("collective_id", collectiveIds);

  const events = eventsRaw as { id: string; title: string; starts_at: string }[] | null;
  if (!events || events.length === 0) return empty;

  const eventIds = events.map((e) => e.id);
  const eventMap = new Map(events.map((e) => [e.id, e]));

  // Fetch all paid/checked-in tickets
  const { data: ticketsRaw, error: ticketError } = await admin
    .from("tickets")
    .select("id, event_id, price_paid, metadata, created_at")
    .in("event_id", eventIds)
    .in("status", ["paid", "checked_in"])
    .limit(10000);

  if (ticketError) {
    return { ...empty, error: `Failed to fetch tickets: ${ticketError.message}` };
  }

  const tickets = ticketsRaw as {
    id: string;
    event_id: string;
    price_paid: number | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }[] | null;

  if (!tickets || tickets.length === 0) return empty;

  // ── Aggregate by email ──────────────────────────────────────────────────────

  type EmailEntry = {
    name: string | null;
    events: Map<string, { title: string; date: string; spent: number }>;
    totalSpent: number;
    ticketCount: number;
    referralCount: number;
    purchaseDates: string[];
  };

  const emailMap = new Map<string, EmailEntry>();

  // First pass: count referrals (emails that appear in referred_by field)
  const referralCounts = new Map<string, number>();
  for (const ticket of tickets) {
    const meta = ticket.metadata as Record<string, unknown> | null;
    const referrer =
      (meta?.referred_by as string) ||
      (meta?.referral_code as string) ||
      null;
    if (referrer) {
      const normalized = referrer.toLowerCase().trim();
      referralCounts.set(normalized, (referralCounts.get(normalized) ?? 0) + 1);
    }
  }

  // Second pass: build contact map
  for (const ticket of tickets) {
    const meta = ticket.metadata as Record<string, unknown> | null;
    const email =
      (meta?.customer_email as string) ||
      (meta?.buyer_email as string) ||
      null;

    if (!email) continue;

    const normalized = email.toLowerCase().trim();
    const name =
      (meta?.customer_name as string) ||
      (meta?.buyer_name as string) ||
      null;

    if (!emailMap.has(normalized)) {
      emailMap.set(normalized, {
        name: name ?? null,
        events: new Map(),
        totalSpent: 0,
        ticketCount: 0,
        referralCount: referralCounts.get(normalized) ?? 0,
        purchaseDates: [],
      });
    }

    const entry = emailMap.get(normalized)!;

    // Update name if we have one
    if (name && !entry.name) entry.name = name;

    const event = eventMap.get(ticket.event_id);
    if (event) {
      const existing = entry.events.get(ticket.event_id);
      const spent = Number(ticket.price_paid) || 0;

      if (existing) {
        existing.spent += spent;
      } else {
        entry.events.set(ticket.event_id, {
          title: event.title,
          date: event.starts_at,
          spent,
        });
      }

      entry.totalSpent += spent;
      entry.ticketCount += 1;
      entry.purchaseDates.push(ticket.created_at);
    }
  }

  // ── Build contact rows ──────────────────────────────────────────────────────

  const contacts: CRMContact[] = Array.from(emailMap.entries())
    .map(([email, data]) => {
      const sortedEvents = Array.from(data.events.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const firstSeen = sortedEvents[0]?.date ?? "";
      const lastSeen = sortedEvents[sortedEvents.length - 1]?.date ?? "";
      const eventsAttended = data.events.size;
      const segment = computeSegment(eventsAttended, lastSeen);

      // Sparkline: last 6 events' spend
      const spendHistory = sortedEvents.slice(-6).map((e) => e.spent);

      return {
        email,
        name: data.name,
        eventsAttended,
        totalSpent: data.totalSpent,
        ticketCount: data.ticketCount,
        firstSeen,
        lastSeen,
        referralCount: data.referralCount,
        segment,
        eventTitles: sortedEvents.map((e) => e.title),
        spendHistory,
      };
    })
    .sort((a, b) => {
      // Sort: VIP → Repeat → New → Lapsed, then by totalSpent desc
      const segmentOrder: Record<ContactSegment, number> = { vip: 0, repeat: 1, new: 2, lapsed: 3 };
      const segDiff = segmentOrder[a.segment] - segmentOrder[b.segment];
      if (segDiff !== 0) return segDiff;
      return b.totalSpent - a.totalSpent;
    });

  // ── Stats ───────────────────────────────────────────────────────────────────

  const totalContacts = contacts.length;
  const vipCount = contacts.filter((c) => c.segment === "vip").length;
  const repeatOrHigher = contacts.filter(
    (c) => c.eventsAttended >= 2
  ).length;
  const repeatRate = totalContacts > 0
    ? Math.round((repeatOrHigher / totalContacts) * 100)
    : 0;
  const avgLTV = totalContacts > 0
    ? contacts.reduce((sum, c) => sum + c.totalSpent, 0) / totalContacts
    : 0;

  return {
    error: null,
    contacts,
    stats: { totalContacts, vipCount, repeatRate, avgLTV },
  };
}
