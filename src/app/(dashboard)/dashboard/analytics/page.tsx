import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Ticket,
  DollarSign,
  CalendarCheck,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Music,
  MapPin,
  Eye,
} from "lucide-react";
import { redirect } from "next/navigation";

function fmt(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

export default async function AnalyticsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Founder-level: pull ALL platform data
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalCollectives },
    { count: totalEvents },
    { count: publishedEvents },
    { count: completedEvents },
    { count: totalTickets },
    { count: paidTickets },
    { count: freeTickets },
    { count: checkedInTickets },
    { count: totalUsers },
    { count: totalArtists },
    { count: totalVenues },
    { data: recentTickets },
    { data: previousTickets },
    { data: settlements },
    { count: newCollectives30d },
    { count: newUsers30d },
    { data: topCollectives },
    { data: recentEvents },
    { count: waitlistEntries },
  ] = await Promise.all([
    admin.from("collectives").select("*", { count: "exact", head: true }),
    admin.from("events").select("*", { count: "exact", head: true }),
    admin.from("events").select("*", { count: "exact", head: true }).eq("status", "published"),
    admin.from("events").select("*", { count: "exact", head: true }).eq("status", "completed"),
    admin.from("tickets").select("*", { count: "exact", head: true }),
    admin.from("tickets").select("*", { count: "exact", head: true }).in("status", ["paid", "checked_in"]),
    admin.from("tickets").select("*", { count: "exact", head: true }).eq("status", "free"),
    admin.from("tickets").select("*", { count: "exact", head: true }).eq("status", "checked_in"),
    admin.from("users").select("*", { count: "exact", head: true }),
    admin.from("artists").select("*", { count: "exact", head: true }),
    admin.from("venues").select("*", { count: "exact", head: true }),
    // Last 30 days tickets
    admin.from("tickets").select("created_at, price_paid").in("status", ["paid", "checked_in"]).gte("created_at", thirtyDaysAgo),
    // Previous 30 days tickets (for comparison)
    admin.from("tickets").select("created_at, price_paid").in("status", ["paid", "checked_in"]).gte("created_at", sixtyDaysAgo).lt("created_at", thirtyDaysAgo),
    // All settlements
    admin.from("settlements").select("gross_revenue, net_revenue, platform_fee, profit, status"),
    // New collectives last 30d
    admin.from("collectives").select("*", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
    // New users last 30d
    admin.from("users").select("*", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
    // Top collectives by event count
    admin.from("collectives").select("id, name, slug").limit(10),
    // Recent events
    admin.from("events").select("id, title, starts_at, status, collective_id, collectives(name)").order("created_at", { ascending: false }).limit(10),
    // Waitlist
    admin.from("ticket_waitlist").select("*", { count: "exact", head: true }),
  ]);

  // Revenue calculations
  const recentTicketRows = (recentTickets ?? []) as { created_at: string; price_paid: number }[];
  const previousTicketRows = (previousTickets ?? []) as { created_at: string; price_paid: number }[];
  const totalGMV = recentTicketRows.reduce((s, t) => s + Number(t.price_paid || 0), 0);
  const prevGMV = previousTicketRows.reduce((s, t) => s + Number(t.price_paid || 0), 0);
  const gmvGrowth = prevGMV > 0 ? ((totalGMV - prevGMV) / prevGMV) * 100 : totalGMV > 0 ? 100 : 0;

  const settlementRows = (settlements ?? []) as { gross_revenue: number; net_revenue: number; platform_fee: number; profit: number; status: string }[];
  const totalPlatformFees = settlementRows.reduce((s, r) => s + Number(r.platform_fee || 0), 0);
  const totalGrossRevenue = settlementRows.reduce((s, r) => s + Number(r.gross_revenue || 0), 0);

  const recentTicketCount = recentTicketRows.length;
  const prevTicketCount = previousTicketRows.length;
  const ticketGrowth = prevTicketCount > 0 ? ((recentTicketCount - prevTicketCount) / prevTicketCount) * 100 : recentTicketCount > 0 ? 100 : 0;

  const checkInRate = (paidTickets ?? 0) > 0 ? Math.round(((checkedInTickets ?? 0) / ((paidTickets ?? 0) + (freeTickets ?? 0))) * 100) : 0;

  // Daily ticket volume (last 7 days)
  const dailyVolume: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dailyVolume[d.toISOString().slice(0, 10)] = 0;
  }
  for (const t of recentTicketRows) {
    const day = t.created_at.slice(0, 10);
    if (dailyVolume[day] !== undefined) dailyVolume[day]++;
  }
  const maxDaily = Math.max(...Object.values(dailyVolume), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide metrics — updated in real-time
        </p>
      </div>

      {/* Hero KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPICard
          label="Total GMV"
          value={fmtCurrency(totalGrossRevenue)}
          sub={`${fmtCurrency(totalGMV)} last 30d`}
          growth={gmvGrowth}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KPICard
          label="Platform Revenue"
          value={fmtCurrency(totalPlatformFees)}
          sub="from service fees"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KPICard
          label="Tickets Sold"
          value={fmt((paidTickets ?? 0) + (freeTickets ?? 0))}
          sub={`${fmt(recentTicketCount)} last 30d`}
          growth={ticketGrowth}
          icon={<Ticket className="h-4 w-4" />}
        />
        <KPICard
          label="Collectives"
          value={fmt(totalCollectives ?? 0)}
          sub={`+${newCollectives30d ?? 0} last 30d`}
          icon={<Music className="h-4 w-4" />}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MiniKPI label="Total Users" value={fmt(totalUsers ?? 0)} sub={`+${newUsers30d ?? 0} this month`} />
        <MiniKPI label="Events Created" value={fmt(totalEvents ?? 0)} sub={`${publishedEvents ?? 0} live`} />
        <MiniKPI label="Completed Events" value={fmt(completedEvents ?? 0)} />
        <MiniKPI label="Check-in Rate" value={`${checkInRate}%`} sub={`${fmt(checkedInTickets ?? 0)} scanned`} />
        <MiniKPI label="Waitlist" value={fmt(waitlistEntries ?? 0)} sub="entries" />
      </div>

      {/* 7-Day Ticket Volume Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Ticket Sales — Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1.5 h-32">
            {Object.entries(dailyVolume).map(([day, count]) => (
              <div key={day} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-muted-foreground font-medium">{count}</span>
                <div
                  className="w-full rounded-t bg-nocturn/80 transition-all"
                  style={{ height: `${Math.max((count / maxDaily) * 100, 4)}%` }}
                />
                <span className="text-[10px] text-muted-foreground">
                  {new Date(day).toLocaleDateString("en-US", { weekday: "short" })}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Platform Health */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Venues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalVenues ?? 0}</p>
            <p className="text-xs text-muted-foreground">in database</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Artists
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalArtists ?? 0}</p>
            <p className="text-xs text-muted-foreground">on platform</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Eye className="h-4 w-4" /> Avg Tickets/Event
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {(completedEvents ?? 0) > 0 ? Math.round(((paidTickets ?? 0) + (freeTickets ?? 0)) / (completedEvents ?? 1)) : 0}
            </p>
            <p className="text-xs text-muted-foreground">across completed events</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Events */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Recent Events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(recentEvents ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No events yet</p>
          )}
          {((recentEvents ?? []) as unknown as { id: string; title: string; starts_at: string; status: string; collective_id: string; collectives: { name: string } | null }[]).map((e) => {
            const col = e.collectives;
            return (
              <div key={e.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {col?.name} &middot; {new Date(e.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  e.status === "published" ? "bg-green-500/10 text-green-500" :
                  e.status === "completed" ? "bg-blue-500/10 text-blue-500" :
                  e.status === "draft" ? "bg-yellow-500/10 text-yellow-500" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {e.status}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function KPICard({ label, value, sub, growth, icon }: {
  label: string;
  value: string;
  sub?: string;
  growth?: number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <p className="text-xl font-bold">{value}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {growth !== undefined && growth !== 0 && (
            <span className={`text-xs flex items-center gap-0.5 ${growth > 0 ? "text-green-500" : "text-red-400"}`}>
              {growth > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(Math.round(growth))}%
            </span>
          )}
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniKPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-3 pb-2 px-3">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className="text-lg font-bold mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
