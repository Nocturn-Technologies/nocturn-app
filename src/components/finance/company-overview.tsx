import { Card, CardContent } from "@/components/ui/card";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  Ticket,
  BarChart3,
} from "lucide-react";
import type { CompanyFinancials } from "@/app/actions/company-financials";
import { formatMoney } from "@/lib/utils";

interface CompanyOverviewProps {
  financials: CompanyFinancials;
}

export function CompanyOverview({ financials }: CompanyOverviewProps) {
  const {
    totalRevenue,
    totalExpenses,
    netProfit,
    totalTicketsSold,
    avgRevenuePerEvent,
    totalEvents,
    profitMargin,
  } = financials;

  const isProfitable = netProfit >= 0;

  const stats = [
    {
      label: "Revenue",
      value: formatMoney(totalRevenue),
      icon: DollarSign,
      color: "text-nocturn-light",
      bgColor: "bg-nocturn/10",
    },
    {
      // B18: drop "Total " prefix so "Total Expens…" doesn't truncate in the
      // narrow 2-col mobile / 5-col desktop grid. "Expenses" reads fine.
      label: "Expenses",
      value: formatMoney(totalExpenses),
      icon: Receipt,
      color: "text-orange-400",
      bgColor: "bg-orange-500/10",
    },
    {
      label: "Net Profit",
      value: `${isProfitable ? "+" : ""}${formatMoney(netProfit)}`,
      icon: isProfitable ? TrendingUp : TrendingDown,
      color: isProfitable ? "text-nocturn-teal" : "text-red-400",
      bgColor: isProfitable ? "bg-nocturn-teal/10" : "bg-red-400/10",
    },
    {
      label: "Tickets Sold",
      value: totalTicketsSold.toLocaleString(),
      icon: Ticket,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Avg / Event",
      value: formatMoney(avgRevenuePerEvent),
      icon: BarChart3,
      color: "text-violet-400",
      bgColor: "bg-violet-500/10",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Headline */}
      <Card className="rounded-2xl border-nocturn/30 bg-gradient-to-br from-nocturn/5 to-transparent">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Across {totalEvents} event{totalEvents !== 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-2xl font-bold md:text-3xl">
                <span className={isProfitable ? "text-nocturn-teal" : "text-red-400"}>
                  {isProfitable ? "+" : ""}{formatMoney(netProfit)}
                </span>
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  net profit
                </span>
              </p>
            </div>
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                isProfitable ? "bg-nocturn-teal/10" : "bg-red-400/10"
              }`}
            >
              {isProfitable ? (
                <TrendingUp className="h-6 w-6 text-nocturn-teal" />
              ) : (
                <TrendingDown className="h-6 w-6 text-red-400" />
              )}
            </div>
          </div>

          {/* Profit margin bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Revenue vs Expenses</span>
              <span
                className={isProfitable ? "text-nocturn-teal" : "text-red-400"}
              >
                {Math.round(profitMargin)}% margin
              </span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/20">
              <div
                className="h-full rounded-l-full bg-nocturn-teal/70 transition-all"
                style={{
                  width: `${totalRevenue > 0 ? Math.min(100, Math.max(5, (totalRevenue / (totalRevenue + totalExpenses)) * 100)) : 50}%`,
                }}
              />
              <div
                className="h-full rounded-r-full bg-red-400/50 transition-all"
                style={{
                  width: `${totalRevenue > 0 ? Math.min(100, Math.max(5, (totalExpenses / (totalRevenue + totalExpenses)) * 100)) : 50}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-nocturn-teal">
                Revenue {formatMoney(totalRevenue)}
              </span>
              <span className="text-red-400">
                Costs {formatMoney(totalExpenses)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="rounded-2xl border-white/[0.06] transition-colors duration-200 hover:border-nocturn/20">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${stat.bgColor}`}
                  >
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className={`text-lg font-bold ${stat.color}`}>
                      {stat.value}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
