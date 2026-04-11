"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Sparkles, Target, Calendar, AlertTriangle } from "lucide-react";
import type { EventFinancials } from "@/app/actions/event-financials";
import type { ForecastData } from "@/app/actions/ai-finance";

// ── Helpers ──────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

interface Props {
  financials: EventFinancials;
  forecast: ForecastData | null;
}

/**
 * Top-of-page dashboard view: P&L glance on the left, scenario forecast on
 * the right, then AI insights underneath. The full editable spreadsheet is
 * rendered separately below this on the page so promoters can still manage
 * line items in one place.
 *
 * Layout note: this component is the "at-a-glance" summary the user
 * requested. The numbers here are derived purely from the props — no
 * client-side data fetching, so it renders instantly with the page.
 */
export function EventFinancialsDashboard({ financials, forecast }: Props) {
  // ── P&L glance numbers ────────────────────────────────────────────
  // Total costs are out-of-pocket only. Stripe + Nocturn fees are buyer
  // paid (Nocturn is the merchant of record), so they don't belong here.
  const venueCost = financials.venueCost ?? 0;
  const venueDeposit = financials.venueDeposit ?? 0;
  const totalCosts =
    financials.totalExpenses + financials.totalArtistFees + venueCost + venueDeposit;
  const isProfitable = financials.profitLoss >= 0;
  const sellThrough = forecast
    ? Math.round(forecast.sellThroughRate * 100)
    : 0;

  // ── Forecast scenarios ────────────────────────────────────────────
  // Built from the same tier data the forecast action computes. Each row
  // assumes a uniform sell-through across tiers — good enough for a "what
  // if" view, and matches the mental model promoters use when planning.
  const scenarios = forecast
    ? [
        { label: "Current", pct: forecast.sellThroughRate, isCurrent: true },
        { label: "50% sold", pct: 0.5, isCurrent: false },
        { label: "75% sold", pct: 0.75, isCurrent: false },
        { label: "Sell-out", pct: 1.0, isCurrent: false },
      ].map((s) => {
        // Project revenue at this sell-through. For "Current" we use the
        // actual revenue from tickets already sold. For the hypotheticals
        // we apply the percentage to each tier's full capacity.
        const projectedRevenue = s.isCurrent
          ? forecast.tiers.reduce((sum, t) => sum + t.revenue, 0)
          : forecast.tiers.reduce(
              (sum, t) => sum + Math.round(t.capacity * s.pct) * t.price,
              0
            );
        const projectedTickets = s.isCurrent
          ? forecast.ticketsSoldSoFar
          : Math.round(forecast.totalCapacity * s.pct);
        // Costs are fixed regardless of sell-through (artists, venue, etc.)
        const projectedProfit = projectedRevenue + (forecast.estimatedBarRevenue ?? 0) - totalCosts;
        return {
          label: s.label,
          tickets: projectedTickets,
          revenue: projectedRevenue,
          profit: projectedProfit,
          isCurrent: s.isCurrent,
        };
      })
    : [];

  return (
    <div className="space-y-6">
      {/* ── Two-column dashboard ───────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT: P&L glance */}
        <Card className="border-border bg-card">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Profit &amp; Loss
              </h2>
              <span className="text-[10px] text-muted-foreground">at a glance</span>
            </div>

            {/* Big number: profit/loss */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {isProfitable ? "Net profit" : "Net loss"}
              </p>
              <p
                className={`text-4xl font-bold font-mono tabular-nums ${
                  isProfitable ? "text-green-400" : "text-red-400"
                }`}
              >
                {isProfitable ? "" : "-"}
                {formatCurrency(Math.abs(financials.profitLoss))}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {financials.totalTicketsSold} tickets sold
              </p>
            </div>

            {/* Revenue / costs breakdown */}
            <div className="space-y-2 pt-3 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                  Gross revenue
                </span>
                <span className="font-mono tabular-nums text-green-400">
                  {formatCurrency(financials.grossRevenue)}
                </span>
              </div>
              {financials.estimatedBarRevenue != null &&
                financials.estimatedBarRevenue > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground pl-5">
                      + Bar revenue
                    </span>
                    <span className="font-mono tabular-nums text-green-400/70">
                      {formatCurrency(financials.estimatedBarRevenue)}
                    </span>
                  </div>
                )}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                  Total costs
                </span>
                <span className="font-mono tabular-nums text-red-400">
                  -{formatCurrency(totalCosts)}
                </span>
              </div>
            </div>

            {/* Break-even */}
            {forecast && forecast.breakEvenTickets > 0 && (
              <div className="rounded-lg bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  <Target className="h-3 w-3" />
                  Break-even
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm">
                    Need{" "}
                    <span className="font-bold text-foreground">
                      {forecast.breakEvenTickets}
                    </span>{" "}
                    tickets
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {forecast.ticketsSoldSoFar >= forecast.breakEvenTickets
                      ? "passed"
                      : `${forecast.breakEvenTickets - forecast.ticketsSoldSoFar} to go`}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      forecast.ticketsSoldSoFar >= forecast.breakEvenTickets
                        ? "bg-green-500"
                        : "bg-nocturn"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        forecast.breakEvenTickets > 0
                          ? (forecast.ticketsSoldSoFar / forecast.breakEvenTickets) * 100
                          : 0
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: Forecast scenarios */}
        <Card className="border-border bg-card">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Forecast
              </h2>
              {forecast && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {forecast.daysUntilEvent > 0
                    ? `${forecast.daysUntilEvent} days out`
                    : "Past"}
                </span>
              )}
            </div>

            {!forecast ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No forecast data available
              </div>
            ) : (
              <>
                {/* Sell-through trend bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Sell-through</span>
                    <span className="font-bold">{sellThrough}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden relative">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-nocturn to-nocturn-light transition-all duration-1000"
                      style={{ width: `${sellThrough}%` }}
                    />
                    {/* Break-even marker */}
                    {forecast.breakEvenTickets > 0 && forecast.totalCapacity > 0 && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-amber-400"
                        style={{
                          left: `${
                            (forecast.breakEvenTickets / forecast.totalCapacity) * 100
                          }%`,
                        }}
                        title={`Break-even at ${forecast.breakEvenTickets} tickets`}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>0</span>
                    {forecast.breakEvenTickets > 0 && (
                      <span className="text-amber-400">
                        BE: {forecast.breakEvenTickets}
                      </span>
                    )}
                    <span>{forecast.totalCapacity}</span>
                  </div>
                </div>

                {/* Scenario table */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    What if you sell…
                  </p>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        {scenarios.map((s) => (
                          <tr
                            key={s.label}
                            className={`border-b border-border/50 last:border-0 ${
                              s.isCurrent ? "bg-nocturn/5" : ""
                            }`}
                          >
                            <td className="px-3 py-2 text-xs">
                              <span
                                className={
                                  s.isCurrent ? "text-nocturn font-semibold" : "text-muted-foreground"
                                }
                              >
                                {s.label}
                              </span>
                              <span className="text-[10px] text-muted-foreground ml-1">
                                ({s.tickets})
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-mono tabular-nums text-muted-foreground">
                              {formatCurrency(s.revenue)}
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-mono tabular-nums">
                              <span
                                className={
                                  s.profit >= 0 ? "text-green-400" : "text-red-400"
                                }
                              >
                                {s.profit >= 0 ? "" : "-"}
                                {formatCurrency(Math.abs(s.profit))}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bar minimum warning */}
                {forecast.barMinimum > 0 && (
                  <div
                    className={`rounded-lg p-2.5 text-xs flex items-start gap-2 ${
                      forecast.depositAtRisk
                        ? "bg-red-500/10 text-red-300"
                        : "bg-green-500/10 text-green-300"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">
                        Bar min: ${forecast.estimatedBarRevenue.toFixed(0)} / $
                        {forecast.barMinimum.toFixed(0)}
                      </p>
                      {forecast.depositAtRisk && (
                        <p className="opacity-80 mt-0.5">
                          ${forecast.venueDeposit.toFixed(0)} deposit at risk
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── AI Insights (full-width below) ─────────────────────── */}
      {forecast && forecast.insights.length > 0 && (
        <Card className="border-l-4 border-l-nocturn bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-nocturn" />
              <h2 className="text-sm font-bold">Nocturn Finance Insights</h2>
            </div>
            <div className="space-y-1.5">
              {forecast.insights.map((insight, i) => (
                <p key={i} className="text-sm text-muted-foreground">
                  {insight}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
