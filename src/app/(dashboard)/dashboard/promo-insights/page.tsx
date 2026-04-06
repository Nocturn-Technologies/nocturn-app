import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Clock,
  Users,
  CalendarDays,
  TrendingUp,
  Megaphone,
  BarChart3,
  Repeat,
  DollarSign,
  MapPin,
} from "lucide-react";
import { redirect } from "next/navigation";
import {
  analyzeTicketSalesPatterns,
  generatePromoSchedule,
  getAudienceInsights,
} from "@/app/actions/promo-intelligence";

function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default async function PromoInsightsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Get user's collective
  const { data: membership } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  const collectiveId = (membership as { collective_id: string } | null)?.collective_id;

  if (!collectiveId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-heading">Promo Insights</h1>
          <p className="text-sm text-muted-foreground">
            Join a collective to see your promo intelligence
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Megaphone className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No collective found. Create or join one to unlock promo insights.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get next upcoming event for promo schedule
  const { data: nextEventRaw } = await admin
    .from("events")
    .select("id, title, starts_at")
    .eq("collective_id", collectiveId)
    .gte("starts_at", new Date().toISOString())
    .is("deleted_at", null)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const nextEvent = nextEventRaw as { id: string; title: string; starts_at: string } | null;

  // Fetch all data in parallel
  const [patternsResult, audienceResult, scheduleResult] = await Promise.all([
    analyzeTicketSalesPatterns(collectiveId),
    getAudienceInsights(collectiveId),
    nextEvent
      ? generatePromoSchedule(nextEvent.id)
      : Promise.resolve({ error: null, data: null }),
  ]);

  const patterns = patternsResult.data;
  const audience = audienceResult.data;
  const schedule = scheduleResult.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading">Promo Insights</h1>
        <p className="text-sm text-muted-foreground">
          Data-driven timing for your posts and promotions
        </p>
      </div>

      {/* Best Time to Post */}
      <Card className="border-nocturn/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-nocturn" />
            Best Time to Post
          </CardTitle>
        </CardHeader>
        <CardContent>
          {patterns ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-nocturn/10 p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Best Day
                  </p>
                  <p className="text-2xl font-bold text-nocturn">
                    {patterns.bestDayToPost}
                  </p>
                </div>
                <div className="rounded-lg bg-nocturn/10 p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Best Hour
                  </p>
                  <p className="text-2xl font-bold text-nocturn">
                    {formatHour(patterns.bestHourToPost)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-card border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Avg. Purchase Lead Time
                </p>
                <p className="text-lg font-semibold">
                  {patterns.avgDaysBeforeEvent} days before the event
                </p>
              </div>

              {/* Day-of-week chart */}
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">
                  Sales by Day of Week
                </p>
                <div className="flex items-end gap-1 h-20">
                  {Object.entries(patterns.salesByDay).map(([day, count]) => {
                    const max = Math.max(
                      ...Object.values(patterns.salesByDay),
                      1
                    );
                    return (
                      <div
                        key={day}
                        className="flex-1 flex flex-col items-center gap-0.5"
                      >
                        <span className="text-[9px] text-muted-foreground">
                          {count}
                        </span>
                        <div
                          className={`w-full rounded-t transition-all ${
                            day === patterns.bestDayToPost
                              ? "bg-nocturn"
                              : "bg-nocturn/30"
                          }`}
                          style={{
                            height: `${Math.max((count / max) * 100, 4)}%`,
                          }}
                        />
                        <span className="text-[9px] text-muted-foreground">
                          {day.slice(0, 3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hour-of-day chart */}
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">
                  Sales by Hour of Day
                </p>
                <div className="flex items-end gap-px h-16 overflow-x-auto">
                  {Array.from({ length: 24 }, (_, h) => {
                    const count = patterns.salesByHour[String(h)] ?? 0;
                    const max = Math.max(
                      ...Object.values(patterns.salesByHour),
                      1
                    );
                    return (
                      <div
                        key={h}
                        className="flex-1 flex flex-col items-center gap-0.5 min-w-[10px]"
                      >
                        <div
                          className={`w-full rounded-t transition-all ${
                            h === patterns.bestHourToPost
                              ? "bg-nocturn"
                              : "bg-nocturn/20"
                          }`}
                          style={{
                            height: `${Math.max((count / max) * 100, 2)}%`,
                          }}
                        />
                        {h % 6 === 0 && (
                          <span className="text-[8px] text-muted-foreground">
                            {formatHour(h).replace(":00 ", "")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {patternsResult.error ?? "No sales data yet. Sell some tickets to unlock timing insights."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Your Audience */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-nocturn" />
            Your Audience
          </CardTitle>
        </CardHeader>
        <CardContent>
          {audience && audience.totalUniqueAttendees > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-xl font-bold">
                    {audience.totalUniqueAttendees}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Unique Attendees
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <Repeat className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-xl font-bold">{audience.repeatRate}%</p>
                  <p className="text-[10px] text-muted-foreground">
                    Repeat Rate
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <DollarSign className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-xl font-bold">
                    {fmtCurrency(audience.avgTicketPrice)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Avg Ticket
                  </p>
                </div>
              </div>

              {/* Top Cities */}
              {audience.topCities.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Top Cities
                  </p>
                  <div className="space-y-1.5">
                    {audience.topCities.map((c, i) => (
                      <div
                        key={c.city}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted-foreground">
                          {i + 1}. {c.city}
                        </span>
                        <span className="font-medium">{c.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Growth Trend */}
              {audience.growthTrend.length > 1 && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Attendees per Event
                  </p>
                  <div className="flex items-end gap-1 h-16">
                    {audience.growthTrend.map((point) => {
                      const max = Math.max(
                        ...audience.growthTrend.map((p) => p.attendees),
                        1
                      );
                      return (
                        <div
                          key={point.date}
                          className="flex-1 flex flex-col items-center gap-0.5"
                        >
                          <span className="text-[9px] text-muted-foreground">
                            {point.attendees}
                          </span>
                          <div
                            className="w-full rounded-t bg-nocturn/60 transition-all"
                            style={{
                              height: `${Math.max(
                                (point.attendees / max) * 100,
                                4
                              )}%`,
                            }}
                          />
                          <span
                            className="text-[8px] text-muted-foreground truncate max-w-full"
                            title={point.eventTitle}
                          >
                            {new Date(point.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {audienceResult.error ?? "No audience data yet. Your insights will appear after your first ticket sales."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Promo Schedule */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-nocturn" />
            Promo Schedule
            {nextEvent && (
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                for {nextEvent.title}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {schedule && schedule.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Optimal posting time:{" "}
                <span className="text-foreground font-medium">
                  {schedule[0].optimalPostingTime}
                </span>
              </p>
              {schedule.map((item, i) => {
                const isToday =
                  item.date === new Date().toISOString().slice(0, 10);
                return (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 space-y-1.5 ${
                      isToday
                        ? "border-nocturn/50 bg-nocturn/5"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-nocturn">
                        {item.label}
                      </p>
                      {isToday && (
                        <span className="text-[10px] bg-nocturn/20 text-nocturn px-1.5 py-0.5 rounded-full font-medium">
                          TODAY
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.date + "T12:00:00").toLocaleDateString(
                        "en-US",
                        {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        }
                      )}
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">
                      {item.suggestedContent}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center">
              <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {nextEvent
                  ? "No upcoming milestones for this event."
                  : "No upcoming events. Create one to get a promo schedule."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
