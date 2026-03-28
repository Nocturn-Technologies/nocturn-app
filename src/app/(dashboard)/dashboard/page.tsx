import { Suspense } from "react";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { DashboardHome } from "@/components/dashboard-home";
import { createAdminClient } from "@/lib/supabase/config";
import { getFinancialPulse } from "@/app/actions/finance-pulse";
import { getActionItems } from "@/app/actions/action-items";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { const { redirect } = await import("next/navigation"); redirect("/login"); }
  const admin = createAdminClient();

  // ── PHASE 1: Essential data (fast — all in parallel) ──
  const now = new Date().toISOString();

  const profileP = admin
    .from("users")
    .select("full_name")
    .eq("id", user!.id)
    .maybeSingle();

  const membershipsP = admin
    .from("collective_members")
    .select("collective_id, collectives(name, metadata, created_at)")
    .eq("user_id", user!.id)
    .is("deleted_at", null)
    .limit(1);

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    profileP,
    membershipsP,
  ]);

  const profileRow = profile as { full_name: string } | null;
  const membershipRows = (memberships ?? []) as unknown as { collective_id: string; collectives: { name: string; metadata: Record<string, unknown> | null; created_at: string } | null }[];
  const firstName = (profileRow?.full_name ?? user!.email ?? "").split(" ")[0] || "there";
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
        .in("status", ["paid", "checked_in"]),

      // Revenue from paid tickets
      admin
        .from("tickets")
        .select("price_paid, events!inner(collective_id)")
        .in("events.collective_id", collectiveIds)
        .in("status", ["paid", "checked_in"]),

      // Financial pulse
      getFinancialPulse(),

      // Action items / alerts
      getActionItems(),
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

    // Attendee count (already fetched in parallel above)
    totalAttendees = allEventsResult.count ?? 0;

    // Revenue from actual ticket payments
    totalRevenue = (revenueResult.data || []).reduce(
      (sum: number, t: { price_paid: unknown }) => sum + (Number(t.price_paid) || 0),
      0
    );
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
      actionItems={actionItems}
    />
  );
}
