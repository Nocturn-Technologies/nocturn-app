"use client";

import { useState, useEffect, useMemo } from "react";
import { getArtistPerformanceAnalytics, type ArtistPerformance } from "@/app/actions/artist-analytics";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowUpDown,
  Music,
  TrendingUp,
  Ticket,
  CalendarDays,
  Sparkles,
  BarChart3,
} from "lucide-react";
import Link from "next/link";

type SortKey = "artistName" | "totalEvents" | "totalTicketsSold" | "avgTicketsPerEvent" | "daysSinceLastBooking";
type SortDir = "asc" | "desc";

export default function ArtistAnalyticsPage() {
  const [artists, setArtists] = useState<ArtistPerformance[]>([]);
  const [avgTickets, setAvgTickets] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("totalTicketsSold");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    getArtistPerformanceAnalytics()
      .then((result) => {
        if (result.error) {
          setError(result.error);
        } else {
          setArtists(result.artists);
          setAvgTickets(result.avgTicketsAcrossAll);
        }
      })
      .catch(() => setError("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    return [...artists].sort((a, b) => {
      let aVal: string | number = a[sortKey] ?? 0;
      let bVal: string | number = b[sortKey] ?? 0;
      if (sortKey === "artistName") {
        aVal = (aVal as string).toLowerCase();
        bVal = (bVal as string).toLowerCase();
        return sortDir === "asc"
          ? (aVal as string).localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal as string);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [artists, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "artistName" ? "asc" : "desc");
    }
  }

  // Summary stats
  const totalArtists = artists.length;
  const totalTickets = artists.reduce((sum, a) => sum + a.totalTicketsSold, 0);
  const suggestCount = artists.filter((a) => a.suggestForNext).length;

  function SortButton({ label, sortKeyVal, className = "" }: { label: string; sortKeyVal: SortKey; className?: string }) {
    const active = sortKey === sortKeyVal;
    return (
      <button
        onClick={() => handleSort(sortKeyVal)}
        className={`flex items-center gap-1 text-xs font-medium min-h-[44px] ${active ? "text-nocturn" : "text-muted-foreground hover:text-foreground"} transition-colors ${className}`}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
        {active && <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-lg bg-muted animate-pulse" />
          <div className="h-7 w-36 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><div className="h-20 w-full rounded-lg bg-muted animate-pulse" /></CardContent></Card>
          <Card><CardContent className="p-4"><div className="h-20 w-full rounded-lg bg-muted animate-pulse" /></CardContent></Card>
          <Card><CardContent className="p-4"><div className="h-20 w-full rounded-lg bg-muted animate-pulse" /></CardContent></Card>
        </div>
        <Card><CardContent className="p-4"><div className="h-48 w-full rounded-lg bg-muted animate-pulse" /></CardContent></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-sm text-destructive">{error}</p>
        <Link href="/dashboard/artists">
          <Button variant="outline">Back to Artists</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/artists"
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-heading">Artist Performance</h1>
          <p className="text-sm text-muted-foreground">
            Track which DJs drive ticket sales across your events
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Music className="h-5 w-5 text-nocturn mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalArtists}</p>
            <p className="text-[11px] text-muted-foreground">Artists Booked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Ticket className="h-5 w-5 text-nocturn mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalTickets}</p>
            <p className="text-[11px] text-muted-foreground">Total Tickets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Sparkles className="h-5 w-5 text-nocturn mx-auto mb-1" />
            <p className="text-2xl font-bold">{suggestCount}</p>
            <p className="text-[11px] text-muted-foreground">Rebook Picks</p>
          </CardContent>
        </Card>
      </div>

      {/* Empty State */}
      {artists.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
              <BarChart3 className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center">
              <p className="font-medium">No performance data yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Book artists to events and sell tickets to see analytics here.
              </p>
            </div>
            <Link href="/dashboard/artists">
              <Button variant="outline">Browse Artists</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Sort Controls (visible on mobile) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:hidden">
            <SortButton label="Name" sortKeyVal="artistName" />
            <SortButton label="Events" sortKeyVal="totalEvents" />
            <SortButton label="Tickets" sortKeyVal="totalTicketsSold" />
            <SortButton label="Avg/Event" sortKeyVal="avgTicketsPerEvent" />
            <SortButton label="Last Booked" sortKeyVal="daysSinceLastBooking" />
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-4">
                        <SortButton label="Artist" sortKeyVal="artistName" />
                      </th>
                      <th className="text-right p-4">
                        <SortButton label="Events" sortKeyVal="totalEvents" className="justify-end" />
                      </th>
                      <th className="text-right p-4">
                        <SortButton label="Tickets Sold" sortKeyVal="totalTicketsSold" className="justify-end" />
                      </th>
                      <th className="text-right p-4">
                        <SortButton label="Avg / Event" sortKeyVal="avgTicketsPerEvent" className="justify-end" />
                      </th>
                      <th className="text-right p-4">
                        <SortButton label="Last Booked" sortKeyVal="daysSinceLastBooking" className="justify-end" />
                      </th>
                      <th className="p-4 w-[100px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((artist) => (
                      <tr key={artist.artistId} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                        <td className="p-4">
                          <Link href={`/dashboard/artists/${artist.artistId}`} className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nocturn/10 shrink-0">
                              <Music className="h-4 w-4 text-nocturn" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{artist.artistName}</p>
                              {artist.genre.length > 0 && (
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {artist.genre.slice(0, 2).join(", ")}
                                </p>
                              )}
                            </div>
                          </Link>
                        </td>
                        <td className="p-4 text-right tabular-nums">{artist.totalEvents}</td>
                        <td className="p-4 text-right tabular-nums font-medium">{artist.totalTicketsSold}</td>
                        <td className="p-4 text-right tabular-nums">{artist.avgTicketsPerEvent}</td>
                        <td className="p-4 text-right">
                          {artist.lastBookedDate ? (
                            <div>
                              <p className="text-sm tabular-nums">
                                {new Date(artist.lastBookedDate).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {artist.daysSinceLastBooking}d ago
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </td>
                        <td className="p-4">
                          {artist.suggestForNext && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-nocturn/10 border border-nocturn/20 px-2.5 py-1 text-[11px] font-medium text-nocturn whitespace-nowrap">
                              <TrendingUp className="h-3 w-3" />
                              Rebook
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Mobile Card List */}
          <div className="space-y-2 md:hidden">
            {sorted.map((artist) => (
              <Link key={artist.artistId} href={`/dashboard/artists/${artist.artistId}`}>
                <Card className="transition-colors hover:border-nocturn/30">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-nocturn/10 shrink-0">
                        <Music className="h-5 w-5 text-nocturn" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{artist.artistName}</p>
                          {artist.suggestForNext && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-nocturn/10 border border-nocturn/20 px-2 py-0.5 text-[10px] font-medium text-nocturn shrink-0">
                              <TrendingUp className="h-2.5 w-2.5" />
                              Rebook
                            </span>
                          )}
                        </div>
                        {artist.genre.length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {artist.genre.slice(0, 3).join(", ")}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {artist.totalEvents} event{artist.totalEvents !== 1 ? "s" : ""}
                          </span>
                          <span className="flex items-center gap-1">
                            <Ticket className="h-3 w-3" />
                            {artist.totalTicketsSold} sold
                          </span>
                          <span>
                            ~{artist.avgTicketsPerEvent}/event
                          </span>
                        </div>
                        {artist.lastBookedDate && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Last booked {new Date(artist.lastBookedDate).toLocaleDateString("en", { month: "short", day: "numeric" })}
                            {" "}({artist.daysSinceLastBooking}d ago)
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3 text-nocturn" />
            <span>
              <strong className="text-nocturn">Rebook</strong> — sold above average ({avgTickets} tickets) but hasn&apos;t been booked in 90+ days
            </span>
          </div>
        </>
      )}
    </div>
  );
}
