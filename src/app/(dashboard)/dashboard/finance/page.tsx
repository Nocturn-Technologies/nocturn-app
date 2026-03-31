import { createClient as createServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Flame,
  Target,
  CircleDollarSign,
} from "lucide-react";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/config";
import {
  getCompanyFinancials,
  getEventFinancialSummaries,
  getRevenueForecast,
} from "@/app/actions/company-financials";
import { CompanyOverview } from "@/components/finance/company-overview";
import { EventFinancialsTable } from "@/components/finance/event-financials-table";
import { RevenueForecast } from "@/components/finance/revenue-forecast";


export default async function FinancePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
    return;
  }
  const admin = createAdminClient();

  // Get user's collectives
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const collectiveIds =
    (memberships as { collective_id: string }[] | null)?.map(
      (m) => m.collective_id
    ) ?? [];

  // --- Parallel data fetching (with error resilience) ---
  const [
    financialsResult,
    eventSummariesResult,
    forecastResult,
    settlementsResult,
    unsettledResult,
  ] = await Promise.all([
    getCompanyFinancials().catch((err: unknown) => {
      console.error("[finance] getCompanyFinancials failed:", err);
      return { error: String(err), data: null } as { error: string; data: null };
    }),
    getEventFinancialSummaries().catch((err: unknown) => {
      console.error("[finance] getEventFinancialSummaries failed:", err);
      return { error: String(err), data: [] as import("@/app/actions/company-financials").EventFinancialSummary[] };
    }),
    getRevenueForecast().catch((err: unknown) => {
      console.error("[finance] getRevenueForecast failed:", err);
      return { error: String(err), data: [] as import("@/app/actions/company-financials").RevenueForecastItem[] };
    }),
    // Settlements for payout status + alerts
    collectiveIds.length > 0
      ? admin
          .from("settlements")
          .select("*, events(title, starts_at, venue_id)")
          .in("collective_id", collectiveIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    // Completed events without settlements
    collectiveIds.length > 0
      ? admin
          .from("events")
          .select("id, title, starts_at")
          .in("collective_id", collectiveIds)
          .eq("status", "completed")
          .is("deleted_at", null)
          .order("starts_at", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  const financials = financialsResult.data;
  const eventSummaries = eventSummariesResult.data ?? [];
  const forecasts = forecastResult.data ?? [];

  type Settlement = {
    id: string;
    event_id: string;
    status: string;
    gross_revenue: number;
    net_revenue: number;
    profit: number;
    platform_fee: number;
    stripe_fees: number;
    total_artist_fees: number;
    total_costs: number;
    created_at: string;
    events: {
      title: string;
      starts_at: string;
      venue_id: string | null;
    } | null;
  };

  type UnsettledEvent = { id: string; title: string; starts_at: string };

  const settlements = (
    (settlementsResult.data ?? []) as unknown as Settlement[]
  );
  const settledEventIds = settlements.map((s) => s.event_id);
  const unsettledEvents = (
    (unsettledResult.data ?? []) as UnsettledEvent[]
  ).filter((e) => !settledEventIds.includes(e.id));

  const hasEvents =
    (financials && financials.totalEvents > 0) ||
    eventSummaries.length > 0 ||
    unsettledEvents.length > 0 ||
    settlements.length > 0;
  const hasRevenue =
    (financials && financials.totalRevenue > 0) ||
    eventSummaries.some((e) => e.grossRevenue > 0);

  // Payout status pipeline
  const payoutStatuses = [
    { key: "draft", label: "Settlement Generated", icon: CheckCircle2 },
    { key: "approved", label: "Approved", icon: CheckCircle2 },
    { key: "paid", label: "Paid Out", icon: CircleDollarSign },
  ];

  return (
    <div className="space-y-6 pb-24 overflow-x-hidden">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading">Money</h1>
        <p className="text-sm text-muted-foreground">
          Company-wide financials, P&L by event, and revenue forecasts
        </p>
      </div>

      {/* ===== Empty State (no events at all) ===== */}
      {!hasEvents && (
        <Card className="border-nocturn/30 bg-gradient-to-br from-nocturn/5 to-transparent">
          <CardContent className="p-5 md:p-6">
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
                <DollarSign className="h-8 w-8 text-nocturn" />
              </div>
              <div>
                <p className="text-lg font-semibold">
                  Create your first event to start tracking your money.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Once you sell tickets and complete an event, your financial
                  breakdown shows up here.
                </p>
              </div>
              <Link href="/dashboard/events">
                <Button className="bg-nocturn hover:bg-nocturn-light min-h-[44px]">
                  Create an Event
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Getting Started (events exist but no revenue yet) ===== */}
      {hasEvents && !hasRevenue && (
        <Card className="border-nocturn/30 bg-gradient-to-br from-nocturn/5 to-transparent">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-nocturn/10">
                <Target className="h-6 w-6 text-nocturn" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  Your events are set up — now let&apos;s get tickets moving
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Publish your events, share your ticket links, and revenue will
                  start flowing in here automatically.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/dashboard/events">
                    <Button
                      size="sm"
                      className="bg-nocturn hover:bg-nocturn-light text-xs min-h-[44px]"
                    >
                      View Events
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== SECTION 1: Company-Wide Overview ===== */}
      {financials && hasEvents && (
        <CompanyOverview financials={financials} />
      )}

      {/* ===== SECTION 2: Smart Alerts ===== */}
      {(() => {
        const alerts: {
          icon: typeof AlertTriangle;
          color: string;
          message: string;
          cta?: { label: string; href: string };
        }[] = [];

        // Unsettled event reminders
        unsettledEvents.forEach((event) => {
          alerts.push({
            icon: Clock,
            color: "text-yellow-500",
            message: `${event.title} settlement hasn\u2019t been completed yet.`,
            cta: {
              label: "Settle Now",
              href: `/dashboard/finance/${event.id}`,
            },
          });
        });

        // Draft settlement reminders
        settlements
          .filter((s) => s.status === "draft")
          .forEach((s) => {
            const event = s.events as unknown as {
              title: string;
            } | null;
            alerts.push({
              icon: AlertTriangle,
              color: "text-orange-500",
              message: `${event?.title ?? "An event"} settlement is in draft \u2014 review and approve it.`,
              cta: {
                label: "Review",
                href: `/dashboard/finance/${s.event_id}`,
              },
            });
          });

        if (alerts.length === 0) return null;

        return (
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Flame className="h-5 w-5 text-orange-500" />
              Needs Your Attention
            </h2>
            <div className="space-y-2">
              {alerts.map((alert, i) => {
                const Icon = alert.icon;
                return (
                  <Card key={i} className="border-yellow-500/20">
                    <CardContent className="flex items-center gap-3 p-4">
                      <Icon
                        className={`h-5 w-5 shrink-0 ${alert.color}`}
                      />
                      <p className="min-w-0 flex-1 text-sm font-medium">
                        {alert.message}
                      </p>
                      {alert.cta && (
                        <Link href={alert.cta.href} className="shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs min-h-[44px]"
                          >
                            {alert.cta.label}
                          </Button>
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ===== SECTION 3: Per-Event P&L Table ===== */}
      {eventSummaries.length > 0 && (
        <EventFinancialsTable events={eventSummaries} />
      )}

      {/* ===== SECTION 4: Revenue Forecast ===== */}
      {forecasts.length > 0 && <RevenueForecast forecasts={forecasts} />}

      {/* ===== SECTION 5: Payout Status ===== */}
      {settlements.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Payout Status</h2>
          <div className="space-y-2">
            {settlements.map((s) => {
              const event = s.events as unknown as {
                title: string;
                starts_at: string;
              } | null;
              const statusIndex = payoutStatuses.findIndex(
                (ps) => ps.key === s.status
              );
              const currentStep = statusIndex >= 0 ? statusIndex : 0;

              return (
                <Link
                  key={s.id}
                  href={`/dashboard/finance/${s.event_id}`}
                >
                  <Card className="transition-colors hover:border-nocturn/30">
                    <CardContent className="p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium line-clamp-1">
                            {event?.title ?? "Unknown Event"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {event?.starts_at
                              ? new Date(
                                  event.starts_at
                                ).toLocaleDateString("en", {
                                  month: "short",
                                  day: "numeric",
                                })
                              : ""}
                          </p>
                        </div>
                        <Badge
                          className={`capitalize text-[10px] ${
                            s.status === "paid"
                              ? "bg-nocturn-teal/10 text-nocturn-teal border-nocturn-teal/20"
                              : s.status === "approved"
                                ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                          }`}
                        >
                          {s.status}
                        </Badge>
                      </div>

                      {/* Timeline */}
                      <div className="flex items-center gap-1">
                        {payoutStatuses.map((ps, i) => {
                          const isComplete = i <= currentStep;
                          const isCurrent = i === currentStep;
                          return (
                            <div
                              key={ps.key}
                              className="flex flex-1 items-center"
                            >
                              <div className="flex flex-1 flex-col items-center gap-1">
                                <div
                                  className={`flex h-6 w-6 items-center justify-center rounded-full ${
                                    isComplete
                                      ? isCurrent &&
                                        s.status !== "paid"
                                        ? "bg-yellow-500/20"
                                        : "bg-nocturn-teal/20"
                                      : "bg-muted/30"
                                  }`}
                                >
                                  {isComplete ? (
                                    <CheckCircle2
                                      className={`h-3.5 w-3.5 ${
                                        isCurrent &&
                                        s.status !== "paid"
                                          ? "text-yellow-500"
                                          : "text-nocturn-teal"
                                      }`}
                                    />
                                  ) : (
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
                                  )}
                                </div>
                                <span
                                  className={`text-[9px] text-center leading-tight ${
                                    isComplete
                                      ? "text-foreground"
                                      : "text-muted-foreground/50"
                                  }`}
                                >
                                  {ps.label}
                                </span>
                              </div>
                              {i < payoutStatuses.length - 1 && (
                                <div
                                  className={`mx-0.5 mt-[-14px] h-0.5 flex-1 rounded ${
                                    i < currentStep
                                      ? "bg-nocturn-teal/40"
                                      : "bg-muted/20"
                                  }`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Action nudge */}
                      {s.status === "draft" && (
                        <div className="mt-3 flex items-center gap-2 rounded-lg bg-yellow-500/5 px-3 py-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                          <p className="text-xs text-yellow-500">
                            Review and approve this settlement
                          </p>
                          <ArrowRight className="ml-auto h-3.5 w-3.5 text-yellow-500" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state for unsettled events with no settlements */}
      {unsettledEvents.length > 0 && settlements.length === 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Events Ready for Settlement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unsettledEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium line-clamp-1">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.starts_at).toLocaleDateString("en", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <Link
                  href={`/dashboard/finance/${event.id}`}
                  className="shrink-0"
                >
                  <Button
                    size="default"
                    className="bg-nocturn hover:bg-nocturn-light text-sm min-h-[44px]"
                  >
                    Settle
                  </Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
