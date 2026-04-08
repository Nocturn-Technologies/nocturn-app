import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Calendar,
  Zap,
  Target,
} from "lucide-react";
import Link from "next/link";
import type { RevenueForecastItem } from "@/app/actions/company-financials";
import { formatMoney } from "@/lib/utils";

function formatDateShort(dateStr: string): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

interface RevenueForecastProps {
  forecasts: RevenueForecastItem[];
}

export function RevenueForecast({ forecasts }: RevenueForecastProps) {
  if (forecasts.length === 0) return null;

  const totalProjectedRevenue = forecasts.reduce(
    (s, f) => s + f.projectedRevenue,
    0
  );
  const totalCurrentRevenue = forecasts.reduce(
    (s, f) => s + f.currentRevenue,
    0
  );
  const totalProjectedProfit = forecasts.reduce(
    (s, f) => s + f.projectedProfit,
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold font-heading">
          <TrendingUp className="h-5 w-5 text-nocturn-light" />
          Revenue Forecast
        </h2>
        <p className="text-xs text-muted-foreground">
          {forecasts.length} upcoming event{forecasts.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Forecast summary */}
      <Card className="rounded-2xl border-nocturn/20 bg-gradient-to-r from-nocturn/5 to-transparent">
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Current Revenue
              </p>
              <p className="text-lg font-bold tabular-nums">
                {formatMoney(totalCurrentRevenue)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Projected Revenue
              </p>
              <p className="text-lg font-bold tabular-nums text-nocturn-light">
                {formatMoney(totalProjectedRevenue)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Projected Profit
              </p>
              <p
                className={`text-lg font-bold tabular-nums ${
                  totalProjectedProfit >= 0
                    ? "text-nocturn-teal"
                    : "text-red-400"
                }`}
              >
                {totalProjectedProfit >= 0 ? "+" : "-"}
                {formatMoney(totalProjectedProfit)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-event forecasts */}
      <div className="space-y-2">
        {forecasts.map((forecast) => {
          const utilizationPercent = Math.min(100, forecast.capacityUtilization);
          const projectedPercent = Math.min(100, forecast.projectedUtilization);
          const isProfitable = forecast.projectedProfit >= 0;

          return (
            <Link
              key={forecast.id}
              href={`/dashboard/events/${forecast.id}`}
            >
              <Card className="rounded-2xl border-white/[0.06] transition-all duration-200 hover:border-nocturn/20 active:scale-[0.98]">
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm line-clamp-1">
                        {forecast.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDateShort(forecast.startsAt)}
                        </span>
                        <span>&middot;</span>
                        <span>{forecast.daysUntilEvent}d away</span>
                      </div>
                    </div>
                    <Badge
                      className={`text-[10px] ${
                        isProfitable
                          ? "border-nocturn-teal/20 bg-nocturn-teal/10 text-nocturn-teal"
                          : "border-red-400/20 bg-red-400/10 text-red-400"
                      }`}
                    >
                      {isProfitable ? "+" : "-"}
                      {formatMoney(forecast.projectedProfit)} proj.
                    </Badge>
                  </div>

                  {/* Capacity bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        {forecast.ticketsSold} / {forecast.totalCapacity}{" "}
                        tickets
                      </span>
                      <span className="text-muted-foreground">
                        {Math.round(forecast.capacityUtilization)}% sold
                      </span>
                    </div>
                    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/20">
                      {/* Projected fill (lighter) */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-nocturn/20 transition-all"
                        style={{ width: `${projectedPercent}%` }}
                      />
                      {/* Current fill (solid) */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-nocturn transition-all"
                        style={{ width: `${utilizationPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground/70">
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-nocturn" />
                        Current
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-nocturn/30" />
                        Projected ({Math.round(forecast.projectedUtilization)}
                        %)
                      </span>
                    </div>
                  </div>

                  {/* Velocity + projection stats */}
                  <div className="grid grid-cols-3 gap-3 rounded-lg bg-white/[0.02] p-2.5">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Zap className="h-3 w-3 text-yellow-500" />
                        <p className="text-xs font-semibold tabular-nums">
                          {forecast.dailySalesVelocity.toFixed(1)}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        tickets/day
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Target className="h-3 w-3 text-nocturn-light" />
                        <p className="text-xs font-semibold tabular-nums">
                          {forecast.projectedTickets}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        proj. tickets
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-semibold tabular-nums text-nocturn-light">
                        {formatMoney(forecast.projectedRevenue)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        proj. revenue
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
