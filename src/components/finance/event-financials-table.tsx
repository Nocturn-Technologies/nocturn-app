"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { EventFinancialSummary } from "@/app/actions/company-financials";
import { formatMoney } from "@/lib/utils";

function formatDate(dateStr: string): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

type SortField =
  | "date"
  | "ticketsSold"
  | "grossRevenue"
  | "totalExpenses"
  | "profit";
type SortDir = "asc" | "desc";

function getStatusBadge(status: string, eventStatus: string) {
  // Settlement status takes priority
  if (status === "paid") {
    return (
      <Badge className="border-nocturn-teal/20 bg-nocturn-teal/10 text-nocturn-teal text-[10px]">
        Paid
      </Badge>
    );
  }
  if (status === "approved") {
    return (
      <Badge className="border-blue-500/20 bg-blue-500/10 text-blue-500 text-[10px]">
        Approved
      </Badge>
    );
  }
  if (status === "draft" && eventStatus === "completed") {
    return (
      <Badge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500 text-[10px]">
        Settled
      </Badge>
    );
  }
  if (status === "unsettled" && eventStatus === "completed") {
    return (
      <Badge className="border-orange-500/20 bg-orange-500/10 text-orange-500 text-[10px]">
        Unsettled
      </Badge>
    );
  }

  // Fall back to event status
  const eventStatusMap: Record<
    string,
    { label: string; className: string }
  > = {
    draft: {
      label: "Draft",
      className: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
    },
    published: {
      label: "Live",
      className: "border-nocturn/20 bg-nocturn/10 text-nocturn-light",
    },
    completed: {
      label: "Completed",
      className:
        "border-nocturn-teal/20 bg-nocturn-teal/10 text-nocturn-teal",
    },
  };

  const s = eventStatusMap[eventStatus] ?? {
    label: eventStatus,
    className: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
  };

  return <Badge className={`${s.className} text-[10px]`}>{s.label}</Badge>;
}

interface EventFinancialsTableProps {
  events: EventFinancialSummary[];
}

export function EventFinancialsTable({ events }: EventFinancialsTableProps) {
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...events].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case "ticketsSold":
          cmp = a.ticketsSold - b.ticketsSold;
          break;
        case "grossRevenue":
          cmp = a.grossRevenue - b.grossRevenue;
          break;
        case "totalExpenses":
          cmp = a.totalExpenses - b.totalExpenses;
          break;
        case "profit":
          cmp = a.profit - b.profit;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [events, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field)
      return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-nocturn-light" />
    ) : (
      <ArrowDown className="h-3 w-3 text-nocturn-light" />
    );
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-heading">Event P&L</h2>
        <p className="text-xs text-muted-foreground">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Card className="rounded-2xl border-white/[0.06] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Event
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => toggleSort("date")}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Date <SortIcon field="date" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleSort("ticketsSold")}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto"
                    >
                      Tickets <SortIcon field="ticketsSold" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleSort("grossRevenue")}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto"
                    >
                      Revenue <SortIcon field="grossRevenue" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleSort("totalExpenses")}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto"
                    >
                      Expenses <SortIcon field="totalExpenses" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleSort("profit")}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto"
                    >
                      Net <SortIcon field="profit" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {sorted.map((event) => {
                  const isProfitable = event.profit >= 0;
                  const hasFinancials = event.grossRevenue > 0;
                  return (
                    <tr
                      key={event.id}
                      className="group transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-sm line-clamp-1 max-w-[200px]">
                          {event.title}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDateShort(event.date)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">
                        {event.ticketsSold}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums font-medium">
                        {hasFinancials ? formatMoney(event.grossRevenue) : "--"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
                        {hasFinancials
                          ? formatMoney(event.totalExpenses)
                          : "--"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right text-sm tabular-nums font-bold ${
                          !hasFinancials
                            ? "text-muted-foreground"
                            : isProfitable
                              ? "text-nocturn-teal"
                              : "text-red-400"
                        }`}
                      >
                        {hasFinancials
                          ? `${isProfitable ? "+" : ""}${formatMoney(event.profit)}`
                          : "--"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getStatusBadge(event.status, event.eventStatus)}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/finance/${event.eventId}`}>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-nocturn-light transition-colors" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Mobile sort pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 md:hidden">
        {(
          [
            ["date", "Date"],
            ["grossRevenue", "Revenue"],
            ["profit", "Profit"],
            ["ticketsSold", "Tickets"],
          ] as [SortField, string][]
        ).map(([field, label]) => (
          <button
            key={field}
            onClick={() => toggleSort(field)}
            className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95 min-h-[36px] ${
              sortField === field
                ? "bg-nocturn/15 text-nocturn-light"
                : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]"
            }`}
          >
            {label} <SortIcon field={field} />
          </button>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {sorted.map((event) => {
          const isProfitable = event.profit >= 0;
          const hasFinancials = event.grossRevenue > 0;
          const isExpanded = expandedId === event.id;

          return (
            <Card
              key={event.id}
              className="rounded-2xl border-white/[0.06] transition-all duration-200 hover:border-nocturn/20"
            >
              <CardContent className="p-0">
                <button
                  onClick={() =>
                    setExpandedId(isExpanded ? null : event.id)
                  }
                  className="flex w-full items-center gap-3 p-4 text-left min-h-[44px] active:bg-white/[0.02] transition-colors duration-200"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm line-clamp-1">
                        {event.title}
                      </p>
                      {getStatusBadge(event.status, event.eventStatus)}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(event.date)} &middot; {event.ticketsSold}{" "}
                      tickets
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {hasFinancials ? (
                      <div className="flex items-center gap-1.5">
                        {isProfitable ? (
                          <TrendingUp className="h-3.5 w-3.5 text-nocturn-teal" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                        )}
                        <p
                          className={`text-base font-bold tabular-nums ${
                            isProfitable
                              ? "text-nocturn-teal"
                              : "text-red-400"
                          }`}
                        >
                          {isProfitable ? "+" : ""}
                          {formatMoney(event.profit)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">--</p>
                    )}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && hasFinancials && (
                  <div className="border-t border-white/[0.06] px-4 py-3 space-y-2">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Revenue
                        </p>
                        <p className="text-sm font-semibold tabular-nums">
                          {formatMoney(event.grossRevenue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Expenses
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-muted-foreground">
                          {formatMoney(event.totalExpenses)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Margin
                        </p>
                        <p
                          className={`text-sm font-semibold tabular-nums ${
                            isProfitable
                              ? "text-nocturn-teal"
                              : "text-red-400"
                          }`}
                        >
                          {Math.round(event.margin)}%
                        </p>
                      </div>
                    </div>
                    <Link href={`/dashboard/finance/${event.eventId}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-1 text-xs min-h-[44px] hover:border-nocturn/30 active:scale-95 transition-all duration-200"
                      >
                        View Full P&L
                      </Button>
                    </Link>
                  </div>
                )}

                {isExpanded && !hasFinancials && (
                  <div className="border-t border-white/[0.06] px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      Financial data available after event is settled.
                    </p>
                    {event.eventStatus === "completed" && (
                      <Link
                        href={`/dashboard/finance/${event.eventId}`}
                      >
                        <Button
                          size="sm"
                          className="mt-2 w-full bg-nocturn hover:bg-nocturn-light active:scale-95 text-xs min-h-[44px] transition-all duration-200"
                        >
                          Settle Now
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
