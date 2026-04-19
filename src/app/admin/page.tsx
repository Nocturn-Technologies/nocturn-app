import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/config";
import { generateApprovalUrls } from "@/app/api/approve-user/route";
import AdminGate from "./admin-gate";
import { isAdminAuthenticated } from "./actions";
import { sanitizePostgRESTInput } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin — Nocturn",
  robots: "noindex, nofollow",
};

// Force dynamic rendering (env var check + DB queries)
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ tab?: string; q?: string; page?: string; type?: string }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmt(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function pctChange(current: number, previous: number): { value: number; positive: boolean } {
  if (previous === 0) return { value: current > 0 ? 100 : 0, positive: current >= 0 };
  const change = ((current - previous) / previous) * 100;
  return { value: Math.abs(change), positive: change >= 0 };
}

function getDayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ── Tabs Config ──────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "events", label: "Events" },
  { key: "revenue", label: "Revenue" },
  { key: "errors", label: "Errors" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ── Main Component ──────────────────────────────────────────────────────────

export default async function AdminPage({ searchParams }: Props) {
  const params = await searchParams;

  // Gate: verify admin session cookie (timing-safe, no secret in URL)
  const isAuthed = await isAdminAuthenticated();
  if (!isAuthed) {
    return <AdminGate />;
  }

  const activeTab = (params.tab as TabKey) || "overview";
  const searchQuery = params.q ?? "";
  const pageNum = Math.max(1, parseInt(params.page ?? "1", 10));

  const supabase = createAdminClient();

  // ── Date boundaries ────────────────────────────────────────────────────
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 6 months ago for revenue tab
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();

  // ── Core queries (always needed for tab badges / overview) ─────────────
  const [
    totalUsersRes,
    ,  // collectivesRes (unused)
    marketplaceRes,
    eventsCountRes,
    // Tickets for GMV
    allPaidTicketsRes,
    // Growth: users last 30d vs previous 30d
    usersLast30Res,
    usersPrev30Res,
    // Growth: tickets last 30d vs previous 30d
    ticketsLast30Res,
    ticketsPrev30Res,
    // Growth: events last 30d vs previous 30d
    eventsLast30Res,
    eventsPrev30Res,
    // 7-day activity: signups
    recentSignupsRaw,
    // 7-day activity: tickets
    recentTicketSalesRaw,
    // 7-day activity: events created
    recentEventsCreatedRaw,
    // Pending approvals
    pendingRes,
    // Recent signups (expanded to 30)
    recentUsersRes,
    // Marketplace breakdown
    marketplaceBreakdownRes,
    // All events with collective (for events tab)
    allEventsRes,
    // Settlements grouped
    settlementsRes,
    // Revenue by month (last 6 months tickets)
    revenueTicketsRes,
    // Top events by revenue
    topEventsTicketsRes,
    // Stripe Connect: collectives with stripe_account_id
    stripeConnectedRes,
    // Refunded tickets
    refundedTicketsRes,
  ] = await Promise.all([
    // Total users
    supabase.from("users").select("id", { count: "exact", head: true }),
    // Collectives
    supabase.from("collectives").select("id", { count: "exact", head: true }),
    // Parties (replaces marketplace_profiles)
    supabase.from("parties").select("id", { count: "exact", head: true }),
    // Events count
    supabase.from("events").select("id", { count: "exact", head: true }),
    // All paid orders with total for GMV
    supabase.from("orders").select("total, created_at, event_id").eq("status", "paid"),
    // Users last 30 days
    supabase.from("users").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
    // Users prev 30 days
    supabase.from("users").select("id", { count: "exact", head: true }).gte("created_at", sixtyDaysAgo).lt("created_at", thirtyDaysAgo),
    // Orders last 30 days
    supabase.from("orders").select("total").eq("status", "paid").gte("created_at", thirtyDaysAgo),
    // Orders prev 30 days
    supabase.from("orders").select("total").eq("status", "paid").gte("created_at", sixtyDaysAgo).lt("created_at", thirtyDaysAgo),
    // Events last 30 days
    supabase.from("events").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
    // Events prev 30 days
    supabase.from("events").select("id", { count: "exact", head: true }).gte("created_at", sixtyDaysAgo).lt("created_at", thirtyDaysAgo),
    // 7-day signups raw
    supabase.from("users").select("created_at").gte("created_at", sevenDaysAgo),
    // 7-day ticket sales raw (using orders)
    supabase.from("orders").select("created_at").eq("status", "paid").gte("created_at", sevenDaysAgo),
    // 7-day events created raw
    supabase.from("events").select("created_at").gte("created_at", sevenDaysAgo),
    // Pending approvals
    supabase
      .from("users")
      .select("id, email, full_name, created_at")
      .eq("is_approved", false)
      .order("created_at", { ascending: false }),
    // Recent signups (30)
    supabase
      .from("users")
      .select("id, email, full_name, created_at, is_approved")
      .order("created_at", { ascending: false })
      .limit(30),
    // Party type breakdown
    supabase.from("parties").select("type"),
    // All events with collective name (50 most recent)
    supabase
      .from("events")
      .select("id, title, slug, starts_at, status, collective_id, collectives(name)")
      .order("created_at", { ascending: false })
      .limit(50),
    // All settlements
    supabase.from("settlements").select("id, event_id, collective_id, status, total_revenue, platform_fee, stripe_fee, net_payout, created_at"),
    // Revenue orders (last 6 months)
    supabase.from("orders").select("total, created_at").eq("status", "paid").gte("created_at", sixMonthsAgo),
    // Top events by revenue — get all paid orders with event info
    supabase.from("orders").select("event_id, total, events(title)").eq("status", "paid"),
    // All collectives (for Stripe Connect status)
    supabase.from("collectives").select("id"),
    // Refunded orders
    supabase.from("orders").select("total").eq("status", "refunded"),
  ]);

  // ── Derived data ───────────────────────────────────────────────────────
  const totalUsers = totalUsersRes.count ?? 0;

  const totalMarketplace = marketplaceRes.count ?? 0;
  const totalEventsCount = eventsCountRes.count ?? 0;
  const pendingUsers = pendingRes.data ?? [];
  const recentUsers = recentUsersRes.data ?? [];

  // Orders & GMV
  const allPaidOrders = allPaidTicketsRes.data ?? [];
  const totalTicketsSold = allPaidOrders.length;
  const totalGMV = allPaidOrders.reduce((s, t) => s + Number(t.total || 0), 0);
  const platformRevenue = totalGMV * 0.07;

  // Growth calculations
  const usersLast30 = usersLast30Res.count ?? 0;
  const usersPrev30 = usersPrev30Res.count ?? 0;
  const ticketsLast30 = ticketsLast30Res.data ?? [];
  const ticketsPrev30 = ticketsPrev30Res.data ?? [];
  const ticketsLast30Count = ticketsLast30.length;
  const ticketsPrev30Count = ticketsPrev30.length;
  const gmvLast30 = ticketsLast30.reduce((s, t) => s + Number(t.total || 0), 0);
  const gmvPrev30 = ticketsPrev30.reduce((s, t) => s + Number(t.total || 0), 0);
  const eventsLast30 = eventsLast30Res.count ?? 0;
  const eventsPrev30 = eventsPrev30Res.count ?? 0;

  const userGrowth = pctChange(usersLast30, usersPrev30);
  const ticketGrowth = pctChange(ticketsLast30Count, ticketsPrev30Count);
  const gmvGrowth = pctChange(gmvLast30, gmvPrev30);
  const eventGrowth = pctChange(eventsLast30, eventsPrev30);

  // 7-day activity buckets
  const signupsByDay: Record<string, number> = {};
  const ticketsByDay: Record<string, number> = {};
  const eventsByDay: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    signupsByDay[key] = 0;
    ticketsByDay[key] = 0;
    eventsByDay[key] = 0;
  }
  for (const row of recentSignupsRaw.data ?? []) {
    const key = new Date(row.created_at).toISOString().split("T")[0];
    if (key in signupsByDay) signupsByDay[key]++;
  }
  for (const row of recentTicketSalesRaw.data ?? []) {
    const key = new Date(row.created_at).toISOString().split("T")[0];
    if (key in ticketsByDay) ticketsByDay[key]++;
  }
  for (const row of recentEventsCreatedRaw.data ?? []) {
    const key = new Date(row.created_at).toISOString().split("T")[0];
    if (key in eventsByDay) eventsByDay[key]++;
  }

  // Party type breakdown
  const mpBreakdown: Record<string, number> = {};
  if (marketplaceBreakdownRes.data) {
    for (const row of marketplaceBreakdownRes.data) {
      const t = row.type ?? "unknown";
      mpBreakdown[t] = (mpBreakdown[t] ?? 0) + 1;
    }
  }

  // Events data
  const allEvents = allEventsRes.data ?? [];

  // Settlements
  const settlements = settlementsRes.data ?? [];
  const settlementsByStatus: Record<string, number> = {};
  for (const s of settlements) {
    const st = s.status ?? "unknown";
    settlementsByStatus[st] = (settlementsByStatus[st] ?? 0) + 1;
  }

  // Revenue by month (last 6 months)
  const revenueTickets = revenueTicketsRes.data ?? [];
  const revenueByMonth: Record<string, { tickets: number; gmv: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    revenueByMonth[key] = { tickets: 0, gmv: 0 };
  }
  for (const t of revenueTickets) {
    const d = new Date(t.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key in revenueByMonth) {
      revenueByMonth[key].tickets++;
      revenueByMonth[key].gmv += Number(t.total || 0);
    }
  }

  // Top 5 events by revenue
  const eventRevMap: Record<string, { title: string; revenue: number; tickets: number }> = {};
  for (const t of topEventsTicketsRes.data ?? []) {
    const eid = t.event_id;
    if (!eventRevMap[eid]) {
      eventRevMap[eid] = { title: (t.events as { title: string } | null)?.title ?? "Unknown", revenue: 0, tickets: 0 };
    }
    eventRevMap[eid].revenue += Number(t.total || 0);
    eventRevMap[eid].tickets++;
  }
  const topEventsByRevenue = Object.entries(eventRevMap)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);

  // Stripe Connect (stripe_account_id removed from schema — show collective count)
  const allCollectivesForStripe = stripeConnectedRes.data ?? [];
  const stripeConnected = 0;
  const stripeNotConnected = allCollectivesForStripe.length - stripeConnected;

  // Refunded
  const refundedTickets = refundedTicketsRes.data ?? [];
  const totalRefunds = refundedTickets.reduce((s, t) => s + Number(t.total || 0), 0);

  // ── Users tab: fetch auth metadata + apply filters ─────────────────────
  // Fetch auth users for metadata (last_sign_in)
  const authMetaMap: Record<string, any> = {};
  const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (authList?.users) {
    for (const u of authList.users) {
      authMetaMap[u.id] = {
        full_name: u.user_metadata?.full_name,
        last_sign_in_at: u.last_sign_in_at,
      };
    }
  }

  // Users tab: full user list with filters and pagination
  let usersTabQuery = supabase
    .from("users")
    .select("id, email, full_name, created_at, is_approved", { count: "exact" })
    .order("created_at", { ascending: false });
  if (searchQuery) {
    const safeQuery = sanitizePostgRESTInput(searchQuery);
    if (safeQuery) {
      usersTabQuery = usersTabQuery.or(`full_name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%`);
    }
  }

  const perPage = 50;
  const offset = (pageNum - 1) * perPage;
  usersTabQuery = usersTabQuery.range(offset, offset + perPage - 1);

  const usersTabRes = await usersTabQuery;
  const usersTabData = usersTabRes.data ?? [];
  const usersTabTotal = usersTabRes.count ?? 0;
  const totalPages = Math.ceil(usersTabTotal / perPage);

  // ── Order counts per event (for events tab) ───────────────────────────
  const ticketCountsByEvent: Record<string, { sold: number; revenue: number }> = {};
  for (const t of allPaidOrders) {
    const eid = t.event_id;
    if (!ticketCountsByEvent[eid]) ticketCountsByEvent[eid] = { sold: 0, revenue: 0 };
    ticketCountsByEvent[eid].sold++;
    ticketCountsByEvent[eid].revenue += Number(t.total || 0);
  }

  // ── Sentry (for errors tab) ───────────────────────────────────────────
  let sentryIssues: any[] = [];
  let sentryError = "";
  const sentryToken = process.env.SENTRY_AUTH_TOKEN;
  const sentryOrg = process.env.SENTRY_ORG;
  const sentryProject = process.env.SENTRY_PROJECT;
  const hasSentryEnv = !!(sentryToken && sentryOrg && sentryProject);

  if (activeTab === "errors" && hasSentryEnv) {
    try {
      const res = await fetch(
        `https://sentry.io/api/0/projects/${sentryOrg}/${sentryProject}/issues/?query=is:unresolved&sort=date&limit=20`,
        {
          headers: { Authorization: `Bearer ${sentryToken}` },
          next: { revalidate: 0 },
        }
      );
      if (res.ok) {
        sentryIssues = await res.json();
      } else {
        sentryError = `Sentry API returned ${res.status}`;
      }
    } catch (e: any) {
      sentryError = e.message ?? "Failed to fetch Sentry issues";
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────

  function tabHref(tab: string) {
    return `/admin?tab=${tab}`;
  }

  function GrowthArrow({ growth }: { growth: { value: number; positive: boolean } }) {
    if (growth.value === 0) return <span className="text-xs text-zinc-500">—</span>;
    return (
      <span className={`text-xs font-medium ${growth.positive ? "text-green-400" : "text-red-400"}`}>
        {growth.positive ? "\u2191" : "\u2193"} {growth.value.toFixed(1)}%
      </span>
    );
  }

  function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
      draft: "bg-zinc-700 text-zinc-300",
      published: "bg-blue-900/40 text-blue-400",
      completed: "bg-green-900/40 text-green-400",
      cancelled: "bg-red-900/40 text-red-400",
      approved: "bg-green-900/40 text-green-400",
      pending: "bg-yellow-900/40 text-yellow-400",
      denied: "bg-red-900/40 text-red-400",
      paid: "bg-emerald-900/40 text-emerald-400",
      pending_approval: "bg-yellow-900/40 text-yellow-400",
    };
    return (
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colors[status] ?? "bg-zinc-800 text-zinc-300"}`}>
        {status.replace(/_/g, " ")}
      </span>
    );
  }

  // ── Bar chart helper ───────────────────────────────────────────────────
  function BarChart({
    data,
    color,
  }: {
    data: Record<string, number>;
    color: string;
  }) {
    const entries = Object.entries(data);
    const maxVal = Math.max(...entries.map(([, v]) => v), 1);
    return (
      <div className="space-y-1.5">
        {entries.map(([date, count]) => {
          const pct = Math.max((count / maxVal) * 100, 2);
          const label = getDayLabel(new Date(date + "T12:00:00"));
          return (
            <div key={date} className="flex items-center gap-3 text-xs">
              <span className="w-24 text-zinc-400 text-right shrink-0">{label}</span>
              <div className="flex-1 h-5 bg-zinc-800/50 rounded overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
              <span className="w-8 text-zinc-300 text-right">{count}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#09090B] text-zinc-100 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-[var(--font-heading)]">
              Nocturn Admin
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Internal dashboard &mdash;{" "}
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <a
            href="/admin"
            className="inline-flex items-center min-h-[44px] px-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Lock
          </a>
        </div>

        {/* ── Tab Navigation ──────────────────────────────────────────── */}
        <nav className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            let badge = "";
            if (tab.key === "users") badge = ` (${totalUsers})`;
            if (tab.key === "events") badge = ` (${totalEventsCount})`;
            return (
              <a
                key={tab.key}
                href={tabHref(tab.key)}
                className={`inline-flex items-center min-h-[44px] px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "text-[#7B2FF7] border-b-2 border-[#7B2FF7]"
                    : "text-zinc-400 hover:text-zinc-200 border-b-2 border-transparent"
                }`}
              >
                {tab.label}{badge}
              </a>
            );
          })}
        </nav>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* OVERVIEW TAB                                                  */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-10">
            {/* ── Platform KPIs ──────────────────────────────────────── */}
            <section>
              <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
                Platform KPIs
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: "Total Users", value: fmt(totalUsers), growth: userGrowth },
                  { label: "Total Events", value: fmt(totalEventsCount), growth: eventGrowth },
                  { label: "Tickets Sold", value: fmt(totalTicketsSold), growth: ticketGrowth },
                  { label: "Total GMV", value: fmtCurrency(totalGMV), growth: gmvGrowth },
                  { label: "Platform Revenue", value: fmtCurrency(platformRevenue), growth: gmvGrowth },
                  { label: "Marketplace Profiles", value: fmt(totalMarketplace), growth: null },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
                  >
                    <p className="text-xs text-zinc-400 uppercase tracking-wide">{stat.label}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    {stat.growth !== null && (
                      <div className="mt-1">
                        <GrowthArrow growth={stat.growth} />
                        <span className="text-xs text-zinc-500 ml-1">vs prev 30d</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* ── 7-Day Activity ─────────────────────────────────────── */}
            <section>
              <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
                7-Day Activity
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <h3 className="text-sm font-medium text-zinc-300 mb-3">New Signups</h3>
                  <BarChart data={signupsByDay} color="#7B2FF7" />
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <h3 className="text-sm font-medium text-zinc-300 mb-3">Tickets Sold</h3>
                  <BarChart data={ticketsByDay} color="#22c55e" />
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <h3 className="text-sm font-medium text-zinc-300 mb-3">Events Created</h3>
                  <BarChart data={eventsByDay} color="#3b82f6" />
                </div>
              </div>
            </section>

            {/* ── Pending Approvals ──────────────────────────────────── */}
            <section>
              <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
                Pending Approvals ({pendingUsers.length})
              </h2>
              {pendingUsers.length === 0 ? (
                <p className="text-zinc-500 text-sm">No pending approvals.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-900 text-zinc-400">
                      <tr>
                        <th className="text-left px-4 py-3">Name</th>
                        <th className="text-left px-4 py-3">Email</th>
                        <th className="text-left px-4 py-3">Signed Up</th>
                        <th className="text-left px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {pendingUsers.map((user: any) => {
                        const meta = authMetaMap[user.id];
                        const name = user.full_name ?? meta?.full_name ?? "\u2014";
                        return (
                          <tr key={user.id} className="hover:bg-zinc-900/60">
                            <td className="px-4 py-3 font-medium">{name}</td>
                            <td className="px-4 py-3 text-zinc-400">{user.email}</td>
                            <td className="px-4 py-3 text-zinc-400">{formatDate(user.created_at)}</td>
                            <td className="px-4 py-3 space-x-3">
                              <a
                                href={generateApprovalUrls(user.id).approveUrl}
                                className="inline-flex items-center min-h-[44px] text-green-400 hover:text-green-300 font-medium transition-colors"
                              >
                                Approve
                              </a>
                              <a
                                href={generateApprovalUrls(user.id).denyUrl}
                                className="inline-flex items-center min-h-[44px] text-red-400 hover:text-red-300 font-medium transition-colors"
                              >
                                Deny
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── Recent Signups ──────────────────────────────────────── */}
            <section>
              <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
                Recent Signups (Last 30)
              </h2>
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-900 text-zinc-400">
                    <tr>
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">Email</th>
                      <th className="text-left px-4 py-3">Signed Up</th>
                      <th className="text-left px-4 py-3">Last Sign In</th>
                      <th className="text-left px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {recentUsers.map((user: any) => {
                      const meta = authMetaMap[user.id];
                      const name = user.full_name ?? meta?.full_name ?? "\u2014";
                      const approved = user.is_approved;
                      return (
                        <tr key={user.id} className="hover:bg-zinc-900/60">
                          <td className="px-4 py-3 font-medium">{name}</td>
                          <td className="px-4 py-3 text-zinc-400">{user.email}</td>
                          <td className="px-4 py-3 text-zinc-400">{formatDate(user.created_at)}</td>
                          <td className="px-4 py-3 text-zinc-400">{formatDate(meta?.last_sign_in_at ?? null)}</td>
                          <td className="px-4 py-3">
                            {approved ? (
                              <span className="inline-block rounded-full bg-green-900/30 text-green-400 px-2.5 py-0.5 text-xs font-medium">
                                Approved
                              </span>
                            ) : (
                              <span className="inline-block rounded-full bg-yellow-900/30 text-yellow-400 px-2.5 py-0.5 text-xs font-medium">
                                Pending
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {recentUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                          No users yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Marketplace Breakdown ───────────────────────────────── */}
            <section>
              <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
                Marketplace Breakdown
              </h2>
              {Object.keys(mpBreakdown).length === 0 ? (
                <p className="text-zinc-500 text-sm">No marketplace profiles yet.</p>
              ) : (
                <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                  {Object.entries(mpBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between px-4 py-3">
                        <span className="capitalize text-sm">{type.replace(/_/g, " ")}</span>
                        <span className="text-sm font-semibold text-[#7B2FF7]">{count}</span>
                      </div>
                    ))}
                </div>
              )}
            </section>

            {/* ── Quick Links ────────────────────────────────────────── */}
            <section>
              <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
                Quick Links
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: "Vercel", href: "https://vercel.com/nocturn-technologies" },
                  { label: "PostHog", href: "https://us.posthog.com" },
                  { label: "Supabase", href: "https://supabase.com/dashboard/project/zvmslijvdkcnkrjjgaie" },
                  { label: "Stripe", href: "https://dashboard.stripe.com" },
                  { label: "GitHub", href: "https://github.com/Nocturn-Technologies/nocturn-app" },
                ].map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center min-h-[44px] rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-center hover:border-[#7B2FF7] hover:text-[#7B2FF7] transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* USERS TAB                                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "users" && (
          <div className="space-y-6">
            {/* Search */}
            <form method="GET" action="/admin">
              <input type="hidden" name="tab" value="users" />
              <div className="flex gap-2">
                <input
                  type="text"
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="Search by name or email..."
                  className="flex-1 min-h-[44px] rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-base md:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#7B2FF7]"
                />
                <button
                  type="submit"
                  className="min-h-[44px] rounded-lg bg-[#7B2FF7] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6b24e0] transition-colors"
                >
                  Search
                </button>
              </div>
            </form>

            {/* Results count */}
            <p className="text-sm text-zinc-400">
              Showing {offset + 1}–{Math.min(offset + perPage, usersTabTotal)} of {usersTabTotal} users
              {searchQuery && <span> matching &ldquo;{searchQuery}&rdquo;</span>}
            </p>

            {/* Users table */}
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-left px-4 py-3">Signed Up</th>
                    <th className="text-left px-4 py-3">Last Sign In</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {usersTabData.map((user: any) => {
                    const meta = authMetaMap[user.id];
                    const name = user.full_name ?? meta?.full_name ?? "\u2014";
                    const approved = user.is_approved;
                    return (
                      <tr key={user.id} className="hover:bg-zinc-900/60">
                        <td className="px-4 py-3 font-medium">{name}</td>
                        <td className="px-4 py-3 text-zinc-400">{user.email}</td>
                        <td className="px-4 py-3 text-zinc-400">{formatDate(user.created_at)}</td>
                        <td className="px-4 py-3 text-zinc-400">{formatDate(meta?.last_sign_in_at ?? null)}</td>
                        <td className="px-4 py-3">
                          {approved ? (
                            <span className="inline-block rounded-full bg-green-900/30 text-green-400 px-2.5 py-0.5 text-xs font-medium">
                              Approved
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-yellow-900/30 text-yellow-400 px-2.5 py-0.5 text-xs font-medium">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 space-x-3">
                          {!approved && (
                            <>
                              <a
                                href={generateApprovalUrls(user.id).approveUrl}
                                className="inline-flex items-center min-h-[44px] text-green-400 hover:text-green-300 font-medium transition-colors"
                              >
                                Approve
                              </a>
                              <a
                                href={generateApprovalUrls(user.id).denyUrl}
                                className="inline-flex items-center min-h-[44px] text-red-400 hover:text-red-300 font-medium transition-colors"
                              >
                                Deny
                              </a>
                            </>
                          )}
                          {approved && <span className="text-zinc-600 text-xs">\u2014</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {usersTabData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                {pageNum > 1 && (
                  <a
                    href={`/admin?tab=users&page=${pageNum - 1}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                    className="inline-flex items-center min-h-[44px] rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Prev
                  </a>
                )}
                {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <a
                      key={p}
                      href={`/admin?tab=users&page=${p}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                      className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg border px-3 py-2 text-sm transition-colors ${
                        p === pageNum ? "border-[#7B2FF7] text-[#7B2FF7] bg-[#7B2FF7]/10" : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {p}
                    </a>
                  );
                })}
                {pageNum < totalPages && (
                  <a
                    href={`/admin?tab=users&page=${pageNum + 1}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                    className="inline-flex items-center min-h-[44px] rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Next
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* EVENTS TAB                                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "events" && (
          <div className="space-y-6">
            <p className="text-sm text-zinc-400">
              Showing {allEvents.length} most recent events across all collectives
            </p>
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="text-left px-4 py-3">Event Name</th>
                    <th className="text-left px-4 py-3">Collective</th>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Tickets Sold</th>
                    <th className="text-right px-4 py-3">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {allEvents.map((event) => {
                    const stats = ticketCountsByEvent[event.id] ?? { sold: 0, revenue: 0 };
                    const collectiveName = (event.collectives as { name: string } | null)?.name ?? "\u2014";
                    return (
                      <tr key={event.id} className="hover:bg-zinc-900/60">
                        <td className="px-4 py-3 font-medium">
                          <a
                            href={`/dashboard/events/${event.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-100 hover:text-[#7B2FF7] transition-colors"
                          >
                            {event.title}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{collectiveName}</td>
                        <td className="px-4 py-3 text-zinc-400">{formatShortDate(event.starts_at)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={event.status ?? "draft"} />
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-300">{stats.sold}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">{fmtCurrency(stats.revenue)}</td>
                      </tr>
                    );
                  })}
                  {allEvents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                        No events yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* REVENUE TAB                                                   */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "revenue" && (
          <div className="space-y-10">
            {/* Revenue KPIs */}
            <section>
              <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
                Revenue Overview
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <p className="text-xs text-zinc-400 uppercase tracking-wide">Total GMV</p>
                  <p className="text-3xl font-bold mt-1">{fmtCurrency(totalGMV)}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <p className="text-xs text-zinc-400 uppercase tracking-wide">Platform Revenue (7%)</p>
                  <p className="text-3xl font-bold mt-1 text-[#7B2FF7]">{fmtCurrency(platformRevenue)}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <p className="text-xs text-zinc-400 uppercase tracking-wide">Total Refunds</p>
                  <p className="text-3xl font-bold mt-1 text-red-400">{fmtCurrency(totalRefunds)}</p>
                </div>
              </div>
            </section>

            {/* Revenue by Month */}
            <section>
              <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
                Revenue by Month (Last 6 Months)
              </h2>
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-900 text-zinc-400">
                    <tr>
                      <th className="text-left px-4 py-3">Month</th>
                      <th className="text-right px-4 py-3">Tickets Sold</th>
                      <th className="text-right px-4 py-3">GMV</th>
                      <th className="text-right px-4 py-3">Platform Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {Object.entries(revenueByMonth).map(([month, data]) => {
                      const d = new Date(month + "-01");
                      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                      return (
                        <tr key={month} className="hover:bg-zinc-900/60">
                          <td className="px-4 py-3 font-medium">{label}</td>
                          <td className="px-4 py-3 text-right text-zinc-300">{data.tickets}</td>
                          <td className="px-4 py-3 text-right text-zinc-300">{fmtCurrency(data.gmv)}</td>
                          <td className="px-4 py-3 text-right text-[#7B2FF7] font-medium">{fmtCurrency(data.gmv * 0.07)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Top 5 Events by Revenue */}
            <section>
              <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
                Top 5 Events by Revenue
              </h2>
              {topEventsByRevenue.length === 0 ? (
                <p className="text-zinc-500 text-sm">No ticket revenue yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-900 text-zinc-400">
                      <tr>
                        <th className="text-left px-4 py-3">#</th>
                        <th className="text-left px-4 py-3">Event</th>
                        <th className="text-right px-4 py-3">Tickets</th>
                        <th className="text-right px-4 py-3">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {topEventsByRevenue.map(([id, data], i) => (
                        <tr key={id} className="hover:bg-zinc-900/60">
                          <td className="px-4 py-3 text-zinc-500">{i + 1}</td>
                          <td className="px-4 py-3 font-medium">{data.title}</td>
                          <td className="px-4 py-3 text-right text-zinc-300">{data.tickets}</td>
                          <td className="px-4 py-3 text-right text-[#7B2FF7] font-medium">{fmtCurrency(data.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Settlement Status Breakdown */}
            <section>
              <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
                Settlement Status
              </h2>
              {Object.keys(settlementsByStatus).length === 0 ? (
                <p className="text-zinc-500 text-sm">No settlements yet.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(settlementsByStatus).map(([status, count]) => (
                    <div key={status} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                      <p className="text-xs text-zinc-400 uppercase tracking-wide">{status.replace(/_/g, " ")}</p>
                      <p className="text-2xl font-bold mt-1">{count}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Stripe Connect Status */}
            <section>
              <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
                Stripe Connect
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <p className="text-xs text-zinc-400 uppercase tracking-wide">Connected</p>
                  <p className="text-2xl font-bold mt-1 text-green-400">{stripeConnected}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <p className="text-xs text-zinc-400 uppercase tracking-wide">Not Connected</p>
                  <p className="text-2xl font-bold mt-1 text-zinc-400">{stripeNotConnected}</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* ERRORS TAB                                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "errors" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <h2 className="text-lg font-semibold mb-2">Sentry Error Monitoring</h2>
              <p className="text-sm text-zinc-400 mb-4">
                View the full error dashboard on Sentry for detailed stack traces, breadcrumbs, and user context.
              </p>
              <a
                href="https://sentry.io"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-[44px] rounded-lg bg-[#7B2FF7] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6b24e0] transition-colors"
              >
                Open Sentry Dashboard
              </a>
            </div>

            {hasSentryEnv && (
              <section>
                <h2 className="text-xl font-semibold mb-4 text-[#7B2FF7]">
                  Unresolved Issues (Last 20)
                </h2>
                {sentryError && (
                  <p className="text-sm text-red-400 mb-4">Error fetching issues: {sentryError}</p>
                )}
                {sentryIssues.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-zinc-800">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-900 text-zinc-400">
                        <tr>
                          <th className="text-left px-4 py-3">Title</th>
                          <th className="text-left px-4 py-3">Level</th>
                          <th className="text-right px-4 py-3">Count</th>
                          <th className="text-left px-4 py-3">First Seen</th>
                          <th className="text-left px-4 py-3">Last Seen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {sentryIssues.map((issue: any) => (
                          <tr key={issue.id} className="hover:bg-zinc-900/60">
                            <td className="px-4 py-3 font-medium max-w-md truncate">
                              <a
                                href={issue.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-zinc-100 hover:text-[#7B2FF7] transition-colors"
                              >
                                {issue.title}
                              </a>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                                issue.level === "error"
                                  ? "bg-red-900/40 text-red-400"
                                  : issue.level === "warning"
                                    ? "bg-yellow-900/40 text-yellow-400"
                                    : "bg-zinc-800 text-zinc-300"
                              }`}>
                                {issue.level}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-zinc-300">{fmt(issue.count ?? 0)}</td>
                            <td className="px-4 py-3 text-zinc-400">{formatShortDate(issue.firstSeen)}</td>
                            <td className="px-4 py-3 text-zinc-400">{formatShortDate(issue.lastSeen)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  !sentryError && <p className="text-zinc-500 text-sm">No unresolved issues found.</p>
                )}
              </section>
            )}

            {!hasSentryEnv && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <p className="text-sm text-zinc-400">
                  Set <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">SENTRY_AUTH_TOKEN</code>,{" "}
                  <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">SENTRY_ORG</code>, and{" "}
                  <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">SENTRY_PROJECT</code>{" "}
                  environment variables to see unresolved issues here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <p className="text-center text-xs text-zinc-600 pt-4">
          Nocturn Admin &mdash; Internal Use Only
        </p>
      </div>
    </div>
  );
}
