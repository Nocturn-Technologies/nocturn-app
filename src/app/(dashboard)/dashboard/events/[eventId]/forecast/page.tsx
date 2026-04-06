"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Ticket,
  Sparkles,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { generateEventForecast, type ForecastData } from "@/app/actions/ai-finance";

export default function ForecastPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generateEventForecast(eventId).then((result) => {
      if (result.error) setError(result.error);
      setForecast(result.forecast);
      setLoading(false);
    });
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10 animate-pulse-glow">
          <BarChart3 className="h-6 w-6 text-nocturn" />
        </div>
        <p className="text-sm text-muted-foreground">Crunching the numbers...</p>
      </div>
    );
  }

  if (error || !forecast) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/events/${eventId}`}>
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-2xl font-bold font-heading">Financial Forecast</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{error || "Could not generate forecast"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const f = forecast;
  const profitColor = f.projectedProfit >= 0 ? "text-green-500" : "text-red-500";


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold font-heading">Financial Forecast</h1>
          <p className="text-sm text-muted-foreground">
            {f.daysUntilEvent > 0 ? `${f.daysUntilEvent} days until event` : "Event has passed"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-nocturn/10 px-3 py-1">
          <Sparkles className="h-3 w-3 text-nocturn" />
          <span className="text-xs font-medium text-nocturn">AI Forecast</span>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid gap-4 sm:grid-cols-4 animate-fade-in-up">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Projected Revenue</p>
            <p className="text-2xl font-bold text-nocturn">${f.projectedRevenue.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Best: ${f.bestCase.toFixed(0)} · Worst: ${f.worstCase.toFixed(0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Projected Profit</p>
            <p className={`text-2xl font-bold ${profitColor}`}>
              ${f.projectedProfit.toFixed(0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Tickets Sold</p>
            <p className="text-2xl font-bold font-heading">{f.ticketsSoldSoFar}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              of {f.totalCapacity} ({Math.round(f.sellThroughRate * 100)}%)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Break Even</p>
            <p className="text-2xl font-bold font-heading">{f.breakEvenTickets}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {f.ticketsSoldSoFar >= f.breakEvenTickets ? "✅ Passed!" : `${f.breakEvenTickets - f.ticketsSoldSoFar} more needed`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sell-through progress bar */}
      <Card className="animate-fade-in-up delay-100">
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="flex items-center gap-1.5">
              <Ticket className="h-4 w-4 text-nocturn" /> Sell-through
            </span>
            <span className="font-bold">{Math.round(f.sellThroughRate * 100)}%</span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-nocturn to-nocturn-light transition-all duration-1000"
              style={{ width: `${Math.round(f.sellThroughRate * 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>0</span>
            <span className="text-nocturn-amber">Break even: {f.breakEvenTickets}</span>
            <span>{f.totalCapacity}</span>
          </div>
        </CardContent>
      </Card>

      {/* Tier breakdown */}
      <Card className="animate-fade-in-up delay-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ticket Tier Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {f.tiers.map((tier) => {
            const tierPct = tier.capacity > 0 ? (tier.sold / tier.capacity) * 100 : 0;
            return (
              <div key={tier.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{tier.name}</span>
                  <span className="text-muted-foreground">
                    {tier.sold}/{tier.capacity} · ${tier.revenue.toFixed(0)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-nocturn"
                    style={{ width: `${tierPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Revenue breakdown */}
      {f.estimatedBarRevenue > 0 && (
        <Card className="animate-fade-in-up delay-250">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ticket revenue (projected)</span>
              <span className="text-green-500">${f.projectedRevenue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bar revenue (estimated)</span>
              <span className="text-green-500">${f.estimatedBarRevenue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-bold">
              <span>Total projected revenue</span>
              <span className="text-green-500">${(f.projectedRevenue + f.estimatedBarRevenue).toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bar minimum warning */}
      {f.barMinimum > 0 && (
        <Card className={`animate-fade-in-up delay-275 border-l-4 ${f.depositAtRisk ? "border-l-red-500" : "border-l-green-500"}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Bar Minimum</span>
              <span className={f.barMinimumMet ? "text-green-500" : "text-red-400"}>
                ${f.estimatedBarRevenue.toFixed(0)} / ${f.barMinimum.toFixed(0)} {f.barMinimumMet ? "✅" : "⚠️"}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden mt-2">
              <div
                className={`h-full rounded-full transition-all ${f.barMinimumMet ? "bg-green-500" : "bg-red-400"}`}
                style={{ width: `${Math.min((f.estimatedBarRevenue / f.barMinimum) * 100, 100)}%` }}
              />
            </div>
            {f.depositAtRisk && (
              <p className="text-xs text-red-400 mt-2">
                Deposit of ${f.venueDeposit.toFixed(0)} at risk — estimated bar revenue is below minimum
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cost breakdown */}
      <Card className="animate-fade-in-up delay-300">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {f.venueCost > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Venue cost</span>
              <span className="text-red-400">-${f.venueCost.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Artist fees</span>
            <span className="text-red-400">-${f.artistFees.toFixed(2)}</span>
          </div>
          {f.talentTravelCosts > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Talent travel (flights, hotel, transport)</span>
              <span className="text-red-400">-${f.talentTravelCosts.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Other expenses</span>
            <span className="text-red-400">-${f.estimatedExpenses.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Stripe fees (est.)</span>
            <span className="text-red-400">-${f.stripeFees.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform fee (paid by buyer)</span>
            <span className="text-red-400">-${f.platformFee.toFixed(2)}</span>
          </div>
          {f.depositAtRisk && (
            <div className="flex justify-between text-red-400">
              <span>Deposit at risk</span>
              <span>-${f.venueDeposit.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 font-bold">
            <span>Projected profit</span>
            <span className={profitColor}>${f.projectedProfit.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card className="border-l-4 border-l-nocturn animate-fade-in-up delay-400">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-nocturn animate-text-glow" />
            Nocturn Finance Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {f.insights.map((insight, i) => (
            <p key={i} className="text-sm text-muted-foreground">{insight}</p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
