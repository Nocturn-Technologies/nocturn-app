"use server";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Event context for AI prompts ──────────────────────────────────
export async function getEventContext(eventId: string): Promise<string> {
  const sb = admin();

  const [eventRes, tiersRes, ticketsRes, artistsRes, tasksRes] = await Promise.all([
    sb.from("events").select("title, description, status, starts_at, ends_at, doors_at, flyer_url, collective_id, venues(name, city, capacity)").eq("id", eventId).maybeSingle(),
    sb.from("ticket_tiers").select("name, price, capacity").eq("event_id", eventId),
    sb.from("tickets").select("status, price_paid, created_at").eq("event_id", eventId),
    sb.from("event_artists").select("artists(name), fee, set_time, booking_status").eq("event_id", eventId),
    sb.from("event_tasks").select("title, completed").eq("event_id", eventId),
  ]);

  const event = eventRes.data;
  if (!event) return "No event data found.";

  const venue = event.venues as unknown as { name: string; city: string; capacity: number } | null;
  const tiers = tiersRes.data || [];
  const tickets = ticketsRes.data || [];
  const artists = artistsRes.data || [];
  const tasks = tasksRes.data || [];

  const paidTickets = tickets.filter((t) => ["paid", "checked_in"].includes(t.status));
  const totalRevenue = paidTickets.reduce((sum, t) => sum + Number(t.price_paid || 0), 0);
  const totalCapacity = tiers.reduce((sum, t) => sum + (t.capacity || 0), 0);
  const checkedIn = tickets.filter((t) => t.status === "checked_in").length;

  const daysUntil = event.starts_at
    ? Math.ceil((new Date(event.starts_at).getTime() - Date.now()) / 86400000)
    : null;

  const lines: string[] = [
    `Event: ${event.title} (${event.status})`,
    venue ? `Venue: ${venue.name}, ${venue.city} (capacity: ${venue.capacity})` : "",
    event.starts_at ? `Date: ${new Date(event.starts_at).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}` : "",
    event.starts_at ? `Time: ${new Date(event.starts_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}` : "",
    daysUntil !== null ? `Days until event: ${daysUntil}` : "",
    "",
    "TICKET TIERS:",
    ...tiers.map((t) => {
      const sold = tickets.filter((tk) => ["paid", "checked_in"].includes(tk.status)).length;
      return `  ${t.name}: $${Number(t.price).toFixed(2)} — ${sold}/${t.capacity} sold`;
    }),
    "",
    `Total tickets sold: ${paidTickets.length}/${totalCapacity} (${totalCapacity > 0 ? Math.round((paidTickets.length / totalCapacity) * 100) : 0}%)`,
    `Total revenue: $${totalRevenue.toFixed(2)}`,
    checkedIn > 0 ? `Checked in: ${checkedIn}` : "",
    "",
    artists.length > 0 ? "LINEUP:" : "",
    ...artists.map((a) => {
      const artist = a.artists as unknown as { name: string } | null;
      return `  ${artist?.name || "TBA"} — $${Number(a.fee || 0).toFixed(0)} (${a.booking_status})`;
    }),
    "",
    tasks.length > 0 ? `TASKS: ${tasks.filter((t) => !t.completed).length} open, ${tasks.filter((t) => t.completed).length} done` : "",
  ];

  return lines.filter(Boolean).join("\n");
}

// ── Collective context for AI prompts ─────────────────────────────
export async function getCollectiveContext(collectiveId: string): Promise<string> {
  const sb = admin();

  const [collectiveRes, eventsRes, membersRes, settlementsRes] = await Promise.all([
    sb.from("collectives").select("name, slug, bio").eq("id", collectiveId).maybeSingle(),
    sb.from("events").select("id, title, status, starts_at").eq("collective_id", collectiveId).order("starts_at", { ascending: false }).limit(10),
    sb.from("collective_members").select("role").eq("collective_id", collectiveId),
    sb.from("settlements").select("gross_revenue, net_revenue, status").eq("collective_id", collectiveId),
  ]);

  const collective = collectiveRes.data;
  if (!collective) return "No collective data found.";

  const events = eventsRes.data || [];
  const members = membersRes.data || [];
  const settlements = settlementsRes.data || [];

  const totalRevenue = settlements.reduce((s, r) => s + Number(r.gross_revenue || 0), 0);
  const totalProfit = settlements.reduce((s, r) => s + Number(r.net_revenue || 0), 0);
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
  const sb = admin();

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);

  const [eventsRes, ticketsRes, tasksRes, settlementsRes] = await Promise.all([
    sb.from("events").select("id, title, status, starts_at").eq("collective_id", collectiveId).in("status", ["draft", "published"]).order("starts_at", { ascending: true }).limit(5),
    sb.from("tickets").select("event_id, status, created_at, price_paid").eq("status", "paid").gte("created_at", yesterday.toISOString()),
    sb.from("event_tasks").select("title, completed, event_id").eq("completed", false).limit(10),
    sb.from("settlements").select("id, status, gross_revenue, net_revenue, event_id, events(title)").eq("collective_id", collectiveId).in("status", ["draft", "pending_approval"]),
  ]);

  const events = eventsRes.data || [];
  const recentTickets = ticketsRes.data || [];
  const openTasks = tasksRes.data || [];
  const pendingSettlements = settlementsRes.data || [];

  const upcoming = events
    .filter((e) => e.starts_at && new Date(e.starts_at) > now)
    .map((e) => ({
      ...e,
      daysUntil: Math.ceil((new Date(e.starts_at).getTime() - now.getTime()) / 86400000),
    }));

  const ticketsSoldToday = recentTickets.length;
  const revenueToday = recentTickets.reduce((s, t) => s + Number(t.price_paid || 0), 0);

  return {
    upcoming,
    ticketsSoldToday,
    revenueToday,
    openTasks: openTasks.length,
    pendingSettlements: pendingSettlements.map((s) => ({
      eventTitle: (s.events as unknown as { title: string })?.title || "Event",
      grossRevenue: Number(s.gross_revenue || 0),
      netRevenue: Number(s.net_revenue || 0),
      status: s.status,
    })),
    drafts: events.filter((e) => e.status === "draft").length,
  };
}
