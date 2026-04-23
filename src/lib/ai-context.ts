"use server";

import { createAdminClient } from "@/lib/supabase/config";

// ── In-memory cache (5-minute TTL) ──────────────────────────────────
const contextCache = new Map<string, { data: string; time: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── Event context for AI prompts ──────────────────────────────────
export async function getEventContext(eventId: string): Promise<string> {
  const cacheKey = `event:${eventId}`;
  const cached = contextCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }

  const sb = createAdminClient();

  const [eventRes, tiersRes, ticketsRes, artistsRes, tasksRes, expensesRes, ordersRes] = await Promise.all([
    sb.from("events").select("title, description, status, starts_at, ends_at, doors_at, flyer_url, collective_id, venue_name, venue_address").eq("id", eventId).maybeSingle(),
    sb.from("ticket_tiers").select("id, name, price, capacity").eq("event_id", eventId),
    sb.from("tickets").select("tier_id, status, created_at, order_line_id").in("tier_id",
      (await sb.from("ticket_tiers").select("id").eq("event_id", eventId)).data?.map(t => t.id) ?? []
    ),
    sb.from("event_artists").select("name, fee, set_time").eq("event_id", eventId),
    sb.from("event_tasks").select("title, status").eq("event_id", eventId),
    // NOC-35: include actual_amount so the AI context uses the symmetric column.
    sb.from("event_expenses").select("description, category, amount, actual_amount").eq("event_id", eventId),
    sb.from("orders").select("id, total, status").eq("event_id", eventId).eq("status", "paid"),
  ]);

  const event = eventRes.data;
  if (!event) return "No event data found.";

  const tiers = tiersRes.data || [];
  const tickets = ticketsRes.data || [];
  const artists = artistsRes.data || [];
  const tasks = tasksRes.data || [];
  const expenses = expensesRes.data || [];
  const paidOrders = ordersRes.data || [];

  const paidTickets = tickets.filter((t) => ["paid", "checked_in"].includes(t.status));
  const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalCapacity = tiers.reduce((sum, t) => sum + (t.capacity || 0), 0);
  const checkedIn = tickets.filter((t) => t.status === "checked_in").length;

  const daysUntil = event.starts_at
    ? Math.ceil((new Date(event.starts_at).getTime() - Date.now()) / 86400000)
    : null;

  const lines: string[] = [
    `Event: ${event.title} (${event.status})`,
    event.venue_name ? `Venue: ${event.venue_name}${event.venue_address ? `, ${event.venue_address}` : ""}` : "",
    event.starts_at ? `Date: ${new Date(event.starts_at).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}` : "",
    event.starts_at ? `Time: ${new Date(event.starts_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}` : "",
    daysUntil !== null ? `Days until event: ${daysUntil}` : "",
    "",
    "TICKET TIERS:",
    ...tiers.map((t) => {
      const sold = tickets.filter((tk) => tk.tier_id === t.id && ["valid", "checked_in"].includes(tk.status)).length;
      return `  ${t.name}: $${Number(t.price).toFixed(2)} — ${sold}/${t.capacity} sold`;
    }),
    "",
    `Total tickets sold: ${paidTickets.length}/${totalCapacity} (${totalCapacity > 0 ? Math.round((paidTickets.length / totalCapacity) * 100) : 0}%)`,
    `Total revenue: $${totalRevenue.toFixed(2)}`,
    checkedIn > 0 ? `Checked in: ${checkedIn}` : "",
    "",
    artists.length > 0 ? "LINEUP:" : "",
    ...artists.map((a) => {
      return `  ${a.name || "TBA"} — $${Number(a.fee || 0).toFixed(0)}`;
    }),
    "",
    tasks.length > 0 ? `TASKS: ${tasks.filter((t) => t.status !== "done").length} open, ${tasks.filter((t) => t.status === "done").length} done` : "",
    "",
    expenses.length > 0 ? "EXPENSES:" : "",
    ...expenses.map((e) => `  ${e.description} (${e.category}): $${Number(e.amount).toFixed(2)}`),
    expenses.length > 0 ? `Total expenses: $${totalExpenses.toFixed(2)}` : "",
    expenses.length > 0 ? `Net profit: $${(totalRevenue - totalExpenses).toFixed(2)}` : "",
  ];

  const result = lines.filter(Boolean).join("\n");
  contextCache.set(cacheKey, { data: result, time: Date.now() });
  return result;
}

// ── Collective context for AI prompts ─────────────────────────────
export async function getCollectiveContext(collectiveId: string): Promise<string> {
  const sb = createAdminClient();

  const [collectiveRes, eventsRes, membersRes, settlementsRes] = await Promise.all([
    sb.from("collectives").select("name, slug, bio").eq("id", collectiveId).maybeSingle(),
    sb.from("events").select("id, title, status, starts_at").eq("collective_id", collectiveId).order("starts_at", { ascending: false }).limit(10),
    sb.from("collective_members").select("role").eq("collective_id", collectiveId).is("deleted_at", null),
    sb.from("settlements").select("total_revenue, net_payout, status").eq("collective_id", collectiveId),
  ]);

  const collective = collectiveRes.data;
  if (!collective) return "No collective data found.";

  const events = eventsRes.data || [];
  const members = membersRes.data || [];
  const settlements = settlementsRes.data || [];

  const totalRevenue = settlements.reduce((s, r) => s + Number(r.total_revenue || 0), 0);
  const totalProfit = settlements.reduce((s, r) => s + Number(r.net_payout || 0), 0);
  const upcoming = events.filter((e) => e.status === "published" && new Date(e.starts_at) > new Date());

  const lines: string[] = [
    `Collective: ${collective.name}`,
    collective.bio ? `Bio: ${collective.bio}` : "",
    `Members: ${members.length}`,
    `Total events: ${events.length}`,
    `Upcoming events: ${upcoming.length}`,
    upcoming.length > 0 ? `Next event: ${upcoming[0]?.title} (${new Date(upcoming[0]?.starts_at).toLocaleDateString()})` : "",
    "",
    `All-time revenue: $${totalRevenue.toFixed(2)}`,
    `All-time profit: $${totalProfit.toFixed(2)}`,
    `Pending settlements: ${settlements.filter((s) => s.status !== "paid_out").length}`,
  ];

  return lines.filter(Boolean).join("\n");
}

// ── Dashboard briefing data ───────────────────────────────────────
export async function getDashboardBriefingData(collectiveId: string) {
  const sb = createAdminClient();

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);

  const [eventsRes, ordersRes, tasksRes, settlementsRes] = await Promise.all([
    sb.from("events").select("id, title, status, starts_at").eq("collective_id", collectiveId).in("status", ["draft", "published"]).order("starts_at", { ascending: true }).limit(5),
    sb.from("orders").select("id, event_id, total, created_at").eq("status", "paid").gte("created_at", yesterday.toISOString()),
    sb.from("event_tasks").select("title, status, event_id").neq("status", "done").limit(10),
    sb.from("settlements").select("id, status, total_revenue, net_payout, event_id, events(title)").eq("collective_id", collectiveId).in("status", ["draft", "pending_approval"]),
  ]);

  const events = eventsRes.data || [];
  const recentOrders = ordersRes.data || [];
  const openTasks = tasksRes.data || [];
  const pendingSettlements = settlementsRes.data || [];

  const upcoming = events
    .filter((e) => e.starts_at && new Date(e.starts_at) > now)
    .map((e) => ({
      ...e,
      daysUntil: Math.ceil((new Date(e.starts_at).getTime() - now.getTime()) / 86400000),
    }));

  const ticketsSoldToday = recentOrders.length;
  const revenueToday = recentOrders.reduce((s, o) => s + Number(o.total || 0), 0);

  return {
    upcoming,
    ticketsSoldToday,
    revenueToday,
    openTasks: openTasks.length,
    pendingSettlements: pendingSettlements.map((s) => ({
      eventTitle: (s.events as unknown as { title: string } | null)?.title || "Event",
      grossRevenue: Number(s.total_revenue || 0),
      netRevenue: Number(s.net_payout || 0),
      status: s.status,
    })),
    drafts: events.filter((e) => e.status === "draft").length,
  };
}
