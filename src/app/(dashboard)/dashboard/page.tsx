import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { DashboardHome } from "@/components/dashboard-home";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import { getFinancialPulse } from "@/app/actions/finance-pulse";
import { getActionItems } from "@/app/actions/action-items";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const firstName = (profile?.full_name ?? user!.email ?? "").split(" ")[0] || "there";
  const membership = memberships?.[0];
  const collective = membership?.collectives as unknown as {
    name: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  } | null;

  const collectiveName = collective?.name ?? "your collective";
  const collectiveAge = collective?.created_at
    ? Math.floor((Date.now() - new Date(collective.created_at).getTime()) / 86400000)
    : 999;
  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];
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

      // All events (for attendee count)
      admin
        .from("events")
        .select("id")
        .in("collective_id", collectiveIds),

      // Financial pulse
      getFinancialPulse(),

      // Action items / alerts
      getActionItems(),
    ]);

    upcomingCount = upcomingResult.count ?? 0;

    if (nextEventsResult.data?.[0]) {
      const daysUntil = Math.ceil(
        (new Date(nextEventsResult.data[0].starts_at).getTime() - Date.now()) / 86400000
      );
      nextEvent = { title: nextEventsResult.data[0].title, daysUntil };
    }

    if (draftsResult.data?.[0]) {
      hasDraftEvent = true;
      draftEventTitle = draftsResult.data[0].title;
    }

    financialPulse = pulseResult;
    actionItems = actionItemsResult;

    // Attendee count (depends on events result)
    const eventIds = allEventsResult.data?.map((e) => e.id) ?? [];
    if (eventIds.length > 0) {
      const { count } = await admin
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .in("event_id", eventIds)
        .in("status", ["paid", "checked_in"]);
      totalAttendees = count ?? 0;
    }
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
