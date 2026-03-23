import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { DashboardHome } from "@/components/dashboard-home";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import { getFinancialPulse } from "@/app/actions/finance-pulse";
import { generateMorningBriefing } from "@/app/actions/ai-briefing";

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

  // Get user profile
  const { data: profile } = await admin
    .from("users")
    .select("full_name")
    .eq("id", user!.id)
    .maybeSingle();

  const firstName = (profile?.full_name ?? user!.email ?? "").split(" ")[0] || "there";

  // Get user's collectives
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id, collectives(name, metadata, created_at)")
    .eq("user_id", user!.id)
    .is("deleted_at", null)
    .limit(1);

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

  // Get upcoming events count + next event + draft check
  let upcomingCount = 0;
  let nextEvent: { title: string; daysUntil: number } | null = null;
  let hasDraftEvent = false;
  let draftEventTitle: string | undefined;

  if (collectiveIds.length > 0) {
    const now = new Date().toISOString();

    const { count } = await admin
      .from("events")
      .select("*", { count: "exact", head: true })
      .in("collective_id", collectiveIds)
      .in("status", ["published", "upcoming"])
      .gte("starts_at", now);

    upcomingCount = count ?? 0;

    // Next upcoming event
    const { data: nextEvents } = await admin
      .from("events")
      .select("title, starts_at")
      .in("collective_id", collectiveIds)
      .in("status", ["published", "upcoming"])
      .gte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(1);

    if (nextEvents?.[0]) {
      const daysUntil = Math.ceil(
        (new Date(nextEvents[0].starts_at).getTime() - Date.now()) / 86400000
      );
      nextEvent = { title: nextEvents[0].title, daysUntil };
    }

    // Check for drafts
    const { data: drafts } = await admin
      .from("events")
      .select("title")
      .in("collective_id", collectiveIds)
      .eq("status", "draft")
      .limit(1);

    if (drafts?.[0]) {
      hasDraftEvent = true;
      draftEventTitle = drafts[0].title;
    }
  }

  // Revenue from settlements
  let totalRevenue = 0;
  if (collectiveIds.length > 0) {
    const { data: settlements } = await admin
      .from("settlements")
      .select("gross_revenue")
      .in("collective_id", collectiveIds);

    totalRevenue = (settlements ?? []).reduce(
      (sum, s) => sum + (Number(s.gross_revenue) || 0), 0
    );
  }

  // Financial Pulse + AI Briefing (parallel)
  const collectiveId = collectiveIds[0] || "";
  const [financialPulse, briefing] = await Promise.all([
    getFinancialPulse(),
    collectiveId ? generateMorningBriefing(collectiveId).catch(() => []) : Promise.resolve([]),
  ]);

  // Attendee count
  let totalAttendees = 0;
  if (collectiveIds.length > 0) {
    const { data: events } = await admin
      .from("events")
      .select("id")
      .in("collective_id", collectiveIds);

    const eventIds = events?.map((e) => e.id) ?? [];
    if (eventIds.length > 0) {
      const { count } = await admin
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .in("event_id", eventIds)
        .in("status", ["paid", "checked_in"]);

      totalAttendees = count ?? 0;
    }
  }

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
      briefing={briefing}
    />
  );
}
