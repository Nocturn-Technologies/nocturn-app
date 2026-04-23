import { createClient as createServerClient } from "@/lib/supabase/server";
import { DashboardHome } from "@/components/dashboard-home";
import { createAdminClient } from "@/lib/supabase/config";
import { getFinancialPulse } from "@/app/actions/finance-pulse";
import { getActionItems } from "@/app/actions/action-items";
import { getMyTasks } from "@/app/actions/tasks";
import { isDemoUser } from "@/lib/demo/demo-mode";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { const { redirect } = await import("next/navigation"); redirect("/login"); return; }
  const admin = createAdminClient();

  // ── PHASE 1: Essential data (fast — all in parallel) ──
  const now = new Date().toISOString();

  const profileP = admin
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const membershipsP = admin
    .from("collective_members")
    .select("collective_id, collectives(name, metadata, created_at)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1);

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    profileP,
    membershipsP,
  ]);

  const profileRow = profile as { full_name: string } | null;
  const membershipRows = (memberships ?? []) as unknown as { collective_id: string; collectives: { name: string; metadata: Record<string, unknown> | null; created_at: string } | null }[];
  const firstName = (profileRow?.full_name ?? user.email ?? "").split(" ")[0] || "there";
  const membership = membershipRows[0];
  const collective = membership?.collectives as {
    name: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  } | null;

  const collectiveName = collective?.name ?? "your collective";
  const collectiveAge = collective?.created_at
    ? Math.floor((Date.now() - new Date(collective.created_at).getTime()) / 86400000)
    : 999;
  const collectiveIds = membershipRows.map((m) => m.collective_id);
  const collectiveId = collectiveIds[0] || "";

  // ── PHASE 2: All event data in parallel ──
  let upcomingCount = 0;
  let nextEvent: { title: string; daysUntil: number } | null = null;
  let hasDraftEvent = false;
  let draftEventTitle: string | undefined;
  let totalRevenue = 0;
  let totalAttendees = 0;
  let financialPulse: Awaited<ReturnType<typeof getFinancialPulse>> | null = null;
  let actionItems: Awaited<ReturnType<typeof getActionItems>> = [];
  let myTasksData: Record<string, unknown>[] = [];
  // Setup checklist data
  let totalEventsCount = 0;
  let hasTicketTiers = false;
  let hasPublishedEvent = false;
  let totalTicketsSold = 0;

  if (collectiveIds.length > 0) {
    // Fire ALL queries at once — not sequentially
    const [
      upcomingResult,
      nextEventsResult,
      draftsResult,
      allEventsResult,
      revenueResult,
      pulseResult,
      actionItemsResult,
      myTasksResult,
      totalEventsResult,
      ticketTiersResult,
      publishedEventsResult,
    ] = await Promise.all([
      // Upcoming count
      admin
        .from("events")
        .select("*", { count: "exact", head: true })
        .in("collective_id", collectiveIds)
        .in("status", ["published", "upcoming"])
        .gte("starts_at", now),

      // Next event
      admin
        .from("events")
        .select("title, starts_at")
        .in("collective_id", collectiveIds)
        .in("status", ["published", "upcoming"])
        .gte("starts_at", now)
        .order("starts_at", { ascending: true })
        .limit(1),

      // Draft check
      admin
        .from("events")
        .select("title")
        .in("collective_id", collectiveIds)
        .eq("status", "draft")
        .limit(1),

      // Attendee count (direct query instead of fetching event IDs first)
      admin
        .from("tickets")
        .select("id, events!inner(collective_id)", { count: "exact", head: true })
        .in("events.collective_id", collectiveIds)
        .in("status", ["valid", "checked_in"]),

      // Revenue via orders table — sum subtotal for paid orders belonging to this collective's events
      admin
        .from("orders")
        .select("subtotal, events!inner(collective_id)")
        .in("events.collective_id", collectiveIds)
        .eq("status", "paid"),

      // Financial pulse — pass collectiveIds to skip redundant auth + membership re-fetch
      getFinancialPulse(collectiveIds).catch((err) => { console.error("[dashboard] getFinancialPulse failed:", err); return null; }),

      // Action items / alerts (catch individually to prevent entire page crash)
      getActionItems().catch((err) => { console.error("[dashboard] getActionItems failed:", err); return [] as Awaited<ReturnType<typeof getActionItems>>; }),

      // My tasks (catch individually to prevent entire page crash)
      getMyTasks(5).catch((err) => { console.error("[dashboard] getMyTasks failed:", err); return [] as Record<string, unknown>[]; }),

      // Setup checklist: total events (any status)
      admin
        .from("events")
        .select("*", { count: "exact", head: true })
        .in("collective_id", collectiveIds),

      // Setup checklist: any event with ticket tiers
      admin
        .from("ticket_tiers")
        .select("id, events!inner(collective_id)", { count: "exact", head: true })
        .in("events.collective_id", collectiveIds),

      // Setup checklist: any published event
      admin
        .from("events")
        .select("*", { count: "exact", head: true })
        .in("collective_id", collectiveIds)
        .eq("status", "published"),
    ]);

    upcomingCount = upcomingResult.count ?? 0;

    const nextEventRow = (nextEventsResult.data as { title: string; starts_at: string }[] | null)?.[0];
    if (nextEventRow) {
      const daysUntil = Math.ceil(
        (new Date(nextEventRow.starts_at).getTime() - Date.now()) / 86400000
      );
      nextEvent = { title: nextEventRow.title, daysUntil };
    }

    const draftRow = (draftsResult.data as { title: string }[] | null)?.[0];
    if (draftRow) {
      hasDraftEvent = true;
      draftEventTitle = draftRow.title;
    }

    financialPulse = pulseResult;
    actionItems = actionItemsResult;
    myTasksData = (myTasksResult ?? []) as Record<string, unknown>[];

    // Attendee count (already fetched in parallel above)
    totalAttendees = allEventsResult.count ?? 0;

    // Revenue from paid orders — sum subtotals client-side
    totalRevenue = (revenueResult.data ?? []).reduce(
      (sum, row) => sum + Number((row as { subtotal: number }).subtotal ?? 0),
      0
    );

    // Setup checklist data
    totalEventsCount = totalEventsResult.count ?? 0;
    hasTicketTiers = (ticketTiersResult.count ?? 0) > 0;
    hasPublishedEvent = (publishedEventsResult.count ?? 0) > 0;
    totalTicketsSold = totalAttendees; // totalAttendees is already paid/checked_in tickets
  }

  // Demo-mode overlay — pitch account gets populated home stats so the
  // dashboard hero + checklist feel fullsome for customer demos.
  if (isDemoUser(user.email) && totalRevenue === 0 && totalAttendees === 0) {
    upcomingCount = 2;
    nextEvent = { title: "Deep Frequencies Vol. 3", daysUntil: 18 };
    hasDraftEvent = true;
    draftEventTitle = "Summer Rooftop Session";
    totalRevenue = 12480;
    totalAttendees = 487;
    totalEventsCount = 6;
    hasTicketTiers = true;
    hasPublishedEvent = true;
    totalTicketsSold = 487;
  }

  // ── AI Briefing loads AFTER the page renders (streamed in) ──
  // Don't block the entire page on a 2-5 second AI call
  return (
    <DashboardHome
      firstName={firstName}
      collectiveName={collectiveName}
      collectiveAge={collectiveAge}
      upcomingCount={upcomingCount}
      nextEvent={nextEvent}
      hasDraftEvent={hasDraftEvent}
      draftEventTitle={draftEventTitle}
      totalRevenue={totalRevenue}
      totalAttendees={totalAttendees}
      financialPulse={financialPulse}
      briefing={[]}
      collectiveId={collectiveId}
      totalEventsCount={totalEventsCount}
      hasTicketTiers={hasTicketTiers}
      hasPublishedEvent={hasPublishedEvent}
      totalTicketsSold={totalTicketsSold}
      actionItems={actionItems}
      myTasks={myTasksData.map((t: Record<string, unknown>) => ({
        // NOC-32: priority + metadata.task_type dropped in PR #93.
        // Dashboard Home no longer surfaces priority dots or the Content pill.
        id: t.id as string,
        title: t.title as string,
        eventTitle: ((t.events as Record<string, unknown>)?.title as string) ?? "Event",
        eventId: t.event_id as string,
        dueAt: (t.due_at as string) ?? null,
        status: (t.status as string) ?? "todo",
      }))}
    />
  );
}
