import { createClient as createServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
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

function formatMoney(amount: number): string {
  if (amount >= 10000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${Math.round(amount).toLocaleString()}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export default async function FinancePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();

  // Get user's collectives
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user!.id)
    .is("deleted_at", null);

  const collectiveIds = (memberships as { collective_id: string }[] | null)?.map((m) => m.collective_id) ?? [];

  // --- Data Fetching ---

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
    total_expenses: number;
    created_at: string;
    events: { title: string; starts_at: string; venue_id: string | null } | null;
  };

  type UnsettledEvent = { id: string; title: string; starts_at: string };

  type UpcomingEvent = {
    id: string;
    title: string;
    starts_at: string;
    status: string;
  };

  type TicketTier = {
    id: string;
    event_id: string;
    name: string;
    price: number;
    capacity: number;
  };

  type Ticket = {
    event_id: string;
    ticket_tier_id: string;
    status: string;
    price_paid: number;
  };

  type EventArtist = {
    event_id: string;
    fee: number;
    artists: { name: string } | null;
  };

  let settlements: Settlement[] = [];
  let unsettledEvents: UnsettledEvent[] = [];
  let upcomingEvents: UpcomingEvent[] = [];
  let ticketTiers: TicketTier[] = [];
  let tickets: Ticket[] = [];
  let eventArtists: EventArtist[] = [];

  if (collectiveIds.length > 0) {
    const now = new Date().toISOString();

    const [
      { data: settlementsData },
      { data: completedData },
      { data: upcomingData },
      { data: tiersData },
      { data: ticketsData },
      { data: artistsData },
    ] = await Promise.all([
      // All settlements with event info
      admin
        .from("settlements")
        .select("*, events(title, starts_at, venue_id)")
        .in("collective_id", collectiveIds)
        .order("created_at", { ascending: false }),
      // Completed events without settlements
      admin
        .from("events")
        .select("id, title, starts_at")
        .in("collective_id", collectiveIds)
        .eq("status", "completed")
        .order("starts_at", { ascending: false }),
      // Upcoming published events
      admin
        .from("events")
        .select("id, title, starts_at, status")
        .in("collective_id", collectiveIds)
        .in("status", ["published", "draft"])
        .gte("starts_at", now)
        .order("starts_at", { ascending: true })
        .limit(5),
      // All ticket tiers for upcoming events (we'll filter in JS)
      admin
        .from("ticket_tiers")
        .select("id, event_id, name, price, capacity")
        .in(
          "event_id",
          // Can't nest — we'll fetch all and filter
          collectiveIds
        ),
      // All paid tickets
      admin
        .from("tickets")
        .select("event_id, ticket_tier_id, status, price_paid")
        .in("status", ["paid", "checked_in"]),
      // Event artists with fees
      admin
        .from("event_artists")
        .select("event_id, fee, artists(name)")
        .gt("fee", 0),
    ]);

    settlements = (settlementsData ?? []) as unknown as Settlement[];
    const settledEventIds = settlements.map((s) => s.event_id);
    unsettledEvents = ((completedData ?? []) as UnsettledEvent[]).filter(
      (e) => !settledEventIds.includes(e.id)
    );
    upcomingEvents = (upcomingData ?? []) as UpcomingEvent[];

    // For upcoming events, fetch their tiers and tickets specifically
    const upcomingEventIds = upcomingEvents.map((e) => e.id);
    if (upcomingEventIds.length > 0) {
      const [{ data: upTiers }, { data: upTickets }, { data: upArtists }] =
        await Promise.all([
          admin
            .from("ticket_tiers")
            .select("id, event_id, name, price, capacity")
            .in("event_id", upcomingEventIds),
          admin
            .from("tickets")
            .select("event_id, ticket_tier_id, status, price_paid")
            .in("event_id", upcomingEventIds)
            .in("status", ["paid", "checked_in"]),
          admin
            .from("event_artists")
            .select("event_id, fee, artists(name)")
            .in("event_id", upcomingEventIds),
        ]);
      ticketTiers = (upTiers ?? []) as TicketTier[];
      tickets = (upTickets ?? []) as Ticket[];
      eventArtists = (upArtists ?? []) as unknown as EventArtist[];
    }
  }

  // --- Computed Values ---

  const totalRevenue = settlements.reduce(
    (s, r) => s + Number(r.gross_revenue),
    0
  );
  const totalProfit = settlements.reduce((s, r) => s + Number(r.profit), 0);
  const avgMargin =
    totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const settledEventCount = settlements.length;

  // Per-event breakdowns for settled events
  const eventBreakdowns = settlements.map((s) => {
    const event = s.events as unknown as {
      title: string;
      starts_at: string;
      venue_id: string | null;
    } | null;
    const gross = Number(s.gross_revenue);
    const artistFees = Number(s.total_artist_fees);
    const stripe = Number(s.stripe_fees);
    const platform = Number(s.platform_fee);
    const expenses = Number(s.total_expenses);
    const profit = Number(s.profit);
    const totalCosts = artistFees + stripe + platform + expenses;
    const margin = gross > 0 ? (profit / gross) * 100 : 0;
    const revenuePercent = gross > 0 ? (gross / (gross + totalCosts)) * 100 : 50;

    // Build expense breakdown
    const expenseItems: { label: string; amount: number }[] = [];
    if (artistFees > 0)
      expenseItems.push({ label: "Artists", amount: artistFees });
    if (stripe > 0)
      expenseItems.push({ label: "Stripe fees", amount: stripe });
    if (platform > 0)
      expenseItems.push({ label: "Platform fee", amount: platform });
    if (expenses > 0)
      expenseItems.push({ label: "Other expenses", amount: expenses });

    return {
      id: s.id,
      eventId: s.event_id,
      title: event?.title ?? "Unknown Event",
      date: event?.starts_at ?? s.created_at,
      status: s.status,
      gross,
      profit,
      totalCosts,
      margin,
      revenuePercent,
      expenseItems,
    };
  });

  // Upcoming event projections
  const upcomingProjections = upcomingEvents.map((event) => {
    const tiers = ticketTiers.filter((t) => t.event_id === event.id);
    const eventTickets = tickets.filter((t) => t.event_id === event.id);
    const artists = eventArtists.filter(
      (a) => a.event_id === event.id
    ) as EventArtist[];

    const ticketsSold = eventTickets.length;
    const totalCapacity = tiers.reduce((s, t) => s + t.capacity, 0);
    const currentRevenue = eventTickets.reduce(
      (s, t) => s + Number(t.price_paid),
      0
    );
    const artistCosts = artists.reduce((s, a) => s + Number(a.fee), 0);
    // Project sell-out revenue
    const sellOutRevenue = tiers.reduce(
      (s, t) => s + t.price * t.capacity,
      0
    );
    const projectedStripe =
      sellOutRevenue > 0
        ? sellOutRevenue * 0.029 + totalCapacity * 0.3
        : 0;
    const projectedProfit = sellOutRevenue - projectedStripe - artistCosts;
    const breakEvenTickets =
      artistCosts > 0 && tiers.length > 0
        ? Math.ceil(
            artistCosts /
              (tiers.reduce((s, t) => s + t.price, 0) / tiers.length -
                0.3 -
                (tiers.reduce((s, t) => s + t.price, 0) / tiers.length) *
                  0.029)
          )
        : 0;
    const ticketsNeededForBreakeven = Math.max(
      0,
      breakEvenTickets - ticketsSold
    );

    return {
      id: event.id,
      title: event.title,
      startsAt: event.starts_at,
      ticketsSold,
      totalCapacity,
      currentRevenue,
      artistCosts,
      sellOutRevenue,
      projectedProfit,
      ticketsNeededForBreakeven,
      breakEvenTickets,
      artistNames: artists
        .map((a) => (a.artists as { name: string } | null)?.name)
        .filter(Boolean),
    };
  });

  // Determine headline for money summary
  const hasSettlements = settlements.length > 0;
  const hasUpcoming = upcomingProjections.length > 0;
  const nextEvent =
    upcomingProjections.length > 0 ? upcomingProjections[0] : null;

  // Payout status pipeline
  const payoutStatuses = [
    { key: "draft", label: "Settlement Generated", icon: CheckCircle2 },
    { key: "approved", label: "Approved", icon: CheckCircle2 },
    { key: "paid", label: "Paid Out", icon: CircleDollarSign },
  ];

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Money</h1>
        <p className="text-sm text-muted-foreground">
          Your financial advisor for every event
        </p>
      </div>

      {/* ===== SECTION 1: Money Summary ===== */}
      <Card className="border-nocturn/30 bg-gradient-to-br from-nocturn/5 to-transparent">
        <CardContent className="p-5 md:p-6">
          {!hasSettlements && !hasUpcoming ? (
            // No events at all
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
                <Button className="bg-nocturn hover:bg-nocturn-light">
                  Create an Event
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Main headline */}
              {hasSettlements && (
                <div>
                  <p className="text-lg font-semibold leading-relaxed md:text-xl">
                    {totalProfit >= 0 ? (
                      <>
                        <span className="text-nocturn-teal">
                          You&apos;ve made {formatMoney(totalProfit)}
                        </span>{" "}
                        across {settledEventCount} event
                        {settledEventCount !== 1 ? "s" : ""}.
                      </>
                    ) : (
                      <>
                        <span className="text-red-400">
                          You&apos;re down {formatMoney(Math.abs(totalProfit))}
                        </span>{" "}
                        across {settledEventCount} event
                        {settledEventCount !== 1 ? "s" : ""}.
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Total revenue: {formatMoney(totalRevenue)} — Average margin:{" "}
                    <span
                      className={
                        avgMargin >= 0 ? "text-nocturn-teal" : "text-red-400"
                      }
                    >
                      {formatPercent(avgMargin)}
                    </span>
                  </p>
                </div>
              )}

              {/* Upcoming event forecast */}
              {nextEvent && nextEvent.ticketsSold > 0 && (
                <div className="rounded-lg border border-nocturn/20 bg-nocturn/5 p-4">
                  <div className="flex items-start gap-3">
                    <Target className="mt-0.5 h-5 w-5 shrink-0 text-nocturn" />
                    <div>
                      <p className="font-medium">
                        {nextEvent.title} has{" "}
                        <span className="text-nocturn-teal">
                          {nextEvent.ticketsSold} tickets sold
                        </span>
                        .
                      </p>
                      {nextEvent.projectedProfit > 0 ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          If you sell out, you keep{" "}
                          <span className="font-medium text-nocturn-teal">
                            {formatMoney(nextEvent.projectedProfit)}
                          </span>{" "}
                          after expenses.
                        </p>
                      ) : (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {nextEvent.totalCapacity - nextEvent.ticketsSold}{" "}
                          tickets remaining out of {nextEvent.totalCapacity}.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick stats row */}
              {hasSettlements && (
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="rounded-lg bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="text-lg font-bold">
                      {formatMoney(totalRevenue)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Profit</p>
                    <p
                      className={`text-lg font-bold ${totalProfit >= 0 ? "text-nocturn-teal" : "text-red-400"}`}
                    >
                      {formatMoney(totalProfit)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p
                      className={`text-lg font-bold ${avgMargin >= 0 ? "text-nocturn-teal" : "text-red-400"}`}
                    >
                      {formatPercent(avgMargin)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== SECTION 3: Smart Alerts ===== */}
      {(() => {
        const alerts: {
          icon: typeof AlertTriangle;
          color: string;
          message: string;
          cta?: { label: string; href: string };
        }[] = [];

        // Break-even alerts for upcoming events
        upcomingProjections.forEach((proj) => {
          if (
            proj.ticketsNeededForBreakeven > 0 &&
            proj.ticketsSold > 0 &&
            proj.breakEvenTickets > 0
          ) {
            alerts.push({
              icon: Target,
              color: "text-yellow-500",
              message: `You need ${proj.ticketsNeededForBreakeven} more ticket${proj.ticketsNeededForBreakeven !== 1 ? "s" : ""} to cover costs for ${proj.title}.`,
              cta: {
                label: "View Event",
                href: `/dashboard/events/${proj.id}`,
              },
            });
          }
        });

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
              message: `${event?.title ?? "An event"} settlement is in draft — review and approve it.`,
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
                            className="text-xs"
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

      {/* ===== SECTION 2: Per-Event Breakdown ===== */}
      {eventBreakdowns.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Event Breakdown</h2>
          <div className="space-y-3">
            {eventBreakdowns.map((eb) => {
              const isProfitable = eb.profit >= 0;
              return (
                <Link
                  key={eb.id}
                  href={`/dashboard/finance/${eb.eventId}`}
                >
                  <Card className="transition-colors hover:border-nocturn/30">
                    <CardContent className="space-y-3 p-4 md:p-5">
                      {/* Event header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold line-clamp-1">
                            {eb.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(eb.date).toLocaleDateString("en", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-xl font-bold ${isProfitable ? "text-nocturn-teal" : "text-red-400"}`}
                          >
                            {isProfitable ? "+" : "-"}
                            {formatMoney(Math.abs(eb.profit))}
                          </p>
                          <Badge
                            className={`text-[10px] ${
                              isProfitable
                                ? "bg-nocturn-teal/10 text-nocturn-teal border-nocturn-teal/20"
                                : "bg-red-400/10 text-red-400 border-red-400/20"
                            }`}
                          >
                            {formatPercent(eb.margin)} margin
                          </Badge>
                        </div>
                      </div>

                      {/* Revenue vs Expenses bar */}
                      <div className="space-y-1.5">
                        <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted/30">
                          <div
                            className="h-full rounded-l-full bg-nocturn-teal/80 transition-all"
                            style={{
                              width: `${Math.min(100, Math.max(5, eb.revenuePercent))}%`,
                            }}
                          />
                          <div
                            className="h-full rounded-r-full bg-red-400/60 transition-all"
                            style={{
                              width: `${Math.min(100, Math.max(5, 100 - eb.revenuePercent))}%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span className="text-nocturn-teal">
                            Revenue {formatMoney(eb.gross)}
                          </span>
                          <span className="text-red-400">
                            Costs {formatMoney(eb.totalCosts)}
                          </span>
                        </div>
                      </div>

                      {/* Plain English expense breakdown */}
                      {eb.expenseItems.length > 0 && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          You kept{" "}
                          <span
                            className={
                              isProfitable
                                ? "font-medium text-nocturn-teal"
                                : "font-medium text-red-400"
                            }
                          >
                            {formatMoney(Math.abs(eb.profit))}
                          </span>{" "}
                          after paying{" "}
                          {eb.expenseItems
                            .map(
                              (item) =>
                                `${item.label} (${formatMoney(item.amount)})`
                            )
                            .join(", ")}
                          .
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== SECTION 4: Payout Status ===== */}
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
                <Link key={s.id} href={`/dashboard/finance/${s.event_id}`}>
                  <Card className="transition-colors hover:border-nocturn/30">
                    <CardContent className="p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium line-clamp-1">
                            {event?.title ?? "Unknown Event"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {event?.starts_at
                              ? new Date(event.starts_at).toLocaleDateString(
                                  "en",
                                  {
                                    month: "short",
                                    day: "numeric",
                                  }
                                )
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
                            <div key={ps.key} className="flex flex-1 items-center">
                              <div className="flex flex-col items-center gap-1 flex-1">
                                <div
                                  className={`flex h-6 w-6 items-center justify-center rounded-full ${
                                    isComplete
                                      ? isCurrent && s.status !== "paid"
                                        ? "bg-yellow-500/20"
                                        : "bg-nocturn-teal/20"
                                      : "bg-muted/30"
                                  }`}
                                >
                                  {isComplete ? (
                                    <CheckCircle2
                                      className={`h-3.5 w-3.5 ${
                                        isCurrent && s.status !== "paid"
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
                    className="bg-nocturn hover:bg-nocturn-light text-sm"
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
