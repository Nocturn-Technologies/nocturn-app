"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ActionItem {
  id: string;
  type: "unsettled" | "draft" | "upcoming" | "low-sales" | "pending-settlement";
  message: string;
  link: string;
  priority: "urgent" | "high" | "normal";
  emoji: string;
}

export async function getActionItems(): Promise<ActionItem[]> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  try {
  const admin = createAdminClient();

  // Get user's collectives
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];
  if (collectiveIds.length === 0) return [];

  const now = new Date();
  const nowISO = now.toISOString();
  const sevenDaysFromNow = new Date(
    now.getTime() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const fourteenDaysFromNow = new Date(
    now.getTime() + 14 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Fire all queries in parallel
  const [
    completedEventsResult,
    draftEventsResult,
    upcomingEventsResult,
    soonEventsResult,
    pendingSettlementsResult,
  ] = await Promise.all([
    // 1. Completed events without settlements (unsettled)
    admin
      .from("events")
      .select("id, title, ends_at")
      .in("collective_id", collectiveIds)
      .in("status", ["published", "upcoming", "completed"])
      .lt("ends_at", nowISO)
      .order("ends_at", { ascending: false })
      .limit(10),

    // 2. Draft events
    admin
      .from("events")
      .select("id, title")
      .in("collective_id", collectiveIds)
      .eq("status", "draft")
      .limit(10),

    // 3. Events this week (published, starts within 7 days)
    admin
      .from("events")
      .select("id, title, starts_at")
      .in("collective_id", collectiveIds)
      .in("status", ["published", "upcoming"])
      .gte("starts_at", nowISO)
      .lte("starts_at", sevenDaysFromNow)
      .order("starts_at", { ascending: true })
      .limit(10),

    // 4. Events within 14 days for low-sales check
    admin
      .from("events")
      .select("id, title, starts_at")
      .in("collective_id", collectiveIds)
      .in("status", ["published", "upcoming"])
      .gte("starts_at", nowISO)
      .lte("starts_at", fourteenDaysFromNow)
      .order("starts_at", { ascending: true })
      .limit(10),

    // 5. Pending settlements (draft or sent)
    admin
      .from("settlements")
      .select("id, event_id, status, events(title)")
      .in("collective_id", collectiveIds)
      .in("status", ["draft", "sent"])
      .limit(10),
  ]);

  const items: ActionItem[] = [];

  // ── 1. Unsettled events ──
  // Find completed events that have no settlement at all
  const completedEvents = completedEventsResult.data ?? [];
  if (completedEvents.length > 0) {
    const completedIds = completedEvents.map((e) => e.id);
    const { data: settledEvents } = await admin
      .from("settlements")
      .select("event_id")
      .in("event_id", completedIds);

    const settledEventIds = new Set(
      (settledEvents ?? []).map((s) => s.event_id)
    );

    for (const event of completedEvents) {
      if (!settledEventIds.has(event.id)) {
        const daysAgo = Math.floor(
          (now.getTime() - new Date(event.ends_at).getTime()) / 86400000
        );
        items.push({
          id: `unsettled-${event.id}`,
          type: "unsettled",
          message: `${event.title} ended ${daysAgo} day${daysAgo !== 1 ? "s" : ""} ago — settle your finances`,
          link: `/dashboard/finance/${event.id}`,
          priority: daysAgo > 7 ? "urgent" : "high",
          emoji: "\u{1F4B8}",
        });
      }
    }
  }

  // ── 2. Draft events ──
  const draftEvents = draftEventsResult.data ?? [];
  for (const event of draftEvents) {
    items.push({
      id: `draft-${event.id}`,
      type: "draft",
      message: `${event.title} is still in draft — publish or delete it`,
      link: `/dashboard/events/${event.id}/edit`,
      priority: "normal",
      emoji: "\u{1F4DD}",
    });
  }

  // ── 3. Events this week ──
  const upcomingEvents = upcomingEventsResult.data ?? [];
  for (const event of upcomingEvents) {
    const daysUntil = Math.ceil(
      (new Date(event.starts_at).getTime() - now.getTime()) / 86400000
    );
    items.push({
      id: `upcoming-${event.id}`,
      type: "upcoming",
      message: `${event.title} is in ${daysUntil} day${daysUntil !== 1 ? "s" : ""} — check your playbook`,
      link: `/dashboard/events/${event.id}/playbook`,
      priority: daysUntil <= 2 ? "high" : "normal",
      emoji: "\u{1F3B6}",
    });
  }

  // ── 4. Low ticket sales ──
  const soonEvents = soonEventsResult.data ?? [];
  if (soonEvents.length > 0) {
    const soonIds = soonEvents.map((e) => e.id);

    // Get ticket tiers and sold counts in parallel
    const [tiersResult, ticketsResult] = await Promise.all([
      admin
        .from("ticket_tiers")
        .select("event_id, capacity")
        .in("event_id", soonIds),
      admin
        .from("tickets")
        .select("event_id")
        .in("event_id", soonIds)
        .in("status", ["paid", "checked_in"]),
    ]);

    // Aggregate capacity per event
    const capacityByEvent: Record<string, number> = {};
    for (const tier of tiersResult.data ?? []) {
      capacityByEvent[tier.event_id] =
        (capacityByEvent[tier.event_id] || 0) + (Number(tier.capacity) || 0);
    }

    // Count tickets sold per event
    const soldByEvent: Record<string, number> = {};
    for (const ticket of ticketsResult.data ?? []) {
      soldByEvent[ticket.event_id] =
        (soldByEvent[ticket.event_id] || 0) + 1;
    }

    for (const event of soonEvents) {
      const capacity = capacityByEvent[event.id] || 0;
      const sold = soldByEvent[event.id] || 0;
      if (capacity <= 0) continue;

      const pctSold = (sold / capacity) * 100;
      if (pctSold < 25) {
        const daysUntil = Math.ceil(
          (new Date(event.starts_at).getTime() - now.getTime()) / 86400000
        );
        items.push({
          id: `low-sales-${event.id}`,
          type: "low-sales",
          message: `${event.title} has only sold ${Math.round(pctSold)}% of tickets with ${daysUntil} day${daysUntil !== 1 ? "s" : ""} to go — push promo`,
          link: `/dashboard/events/${event.id}/playbook`,
          priority: daysUntil <= 5 ? "urgent" : "high",
          emoji: "\u{1F6A8}",
        });
      }
    }
  }

  // ── 5. Pending settlements ──
  const pendingSettlements = pendingSettlementsResult.data ?? [];
  for (const settlement of pendingSettlements) {
    const event = settlement.events as unknown as { title: string } | null;
    const eventTitle = event?.title ?? "Unknown Event";
    items.push({
      id: `pending-settlement-${settlement.id}`,
      type: "pending-settlement",
      message: `Settlement for ${eventTitle} is pending approval`,
      link: `/dashboard/finance/${settlement.event_id}`,
      priority: "high",
      emoji: "\u{23F3}",
    });
  }

  // Sort by priority: urgent first, then high, then normal
  const priorityOrder: Record<string, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
  };
  items.sort(
    (a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
  );

  // Deduplicate: an event shouldn't appear in both "upcoming" and "low-sales"
  // Keep the higher-priority version
  const seen = new Set<string>();
  const deduped: ActionItem[] = [];
  for (const item of items) {
    // Extract event ID from the item id (format: "type-eventId")
    const eventId = item.id.split("-").slice(1).join("-");
    const key = `${item.type === "low-sales" ? "upcoming-or-low" : item.type}-${eventId}`;

    // For upcoming vs low-sales, keep only low-sales (it's more actionable)
    if (item.type === "upcoming") {
      const lowSalesKey = `upcoming-or-low-${eventId}`;
      if (seen.has(lowSalesKey)) continue;
    }
    if (item.type === "low-sales") {
      // Mark so upcoming version is skipped
      const upcomingKey = `upcoming-or-low-${eventId}`;
      seen.add(upcomingKey);
    }

    if (!seen.has(item.id)) {
      seen.add(item.id);
      deduped.push(item);
    }
  }

  return deduped;
  } catch {
    return [];
  }
}
