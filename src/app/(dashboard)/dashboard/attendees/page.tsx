"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, UserCheck, DollarSign, Download, Search } from "lucide-react";
import Link from "next/link";
import {
  getAttendees,
  exportAttendeesCSV,
  type AttendeeRow,
  type AttendeeStats,
} from "@/app/actions/attendees";

export default function AttendeesPage() {
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [stats, setStats] = useState<AttendeeStats>({
    totalAttendees: 0,
    repeatAttendees: 0,
    totalRevenue: 0,
  });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getAttendees().then((result) => {
      if (!result.error) {
        setAttendees(result.attendees);
        setStats(result.stats);
      } else {
        setError(true);
      }
      setLoading(false);
    }).catch(() => {
      setError(true);
      setLoading(false);
    });
  }, []);

  const filtered = attendees.filter((a) =>
    a.email.toLowerCase().includes(search.toLowerCase())
  );

  async function handleExport() {
    setExporting(true);
    const result = await exportAttendeesCSV();
    if (!result.error && result.csv) {
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nocturn-attendees-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-muted-foreground">Failed to load attendees.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Attendees</h1>
          <p className="text-sm text-muted-foreground">
            Your audience CRM from ticket purchases
          </p>
        </div>
        {attendees.length > 0 && (
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-nocturn/10">
              <Users className="h-5 w-5 text-nocturn" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Attendees</p>
              <p className="text-xl font-bold">{stats.totalAttendees}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <UserCheck className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Repeat (2+ events)
              </p>
              <p className="text-xl font-bold">{stats.repeatAttendees}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
              <DollarSign className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="text-xl font-bold">
                ${stats.totalRevenue.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      {attendees.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Attendee list */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 text-xs font-medium text-muted-foreground">
            <span className="col-span-4">Email</span>
            <span className="col-span-2 text-center">Events</span>
            <span className="col-span-2 text-center">Tickets</span>
            <span className="col-span-2 text-right">Total Spent</span>
            <span className="col-span-2 text-right">Last Event</span>
          </div>

          {filtered.map((attendee) => (
            <Card key={attendee.email}>
              <CardContent className="p-4">
                {/* Desktop row */}
                <div className="hidden sm:grid grid-cols-12 items-center gap-2">
                  <div className="col-span-4 min-w-0">
                    <p className="truncate font-medium text-sm">
                      {attendee.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {attendee.eventTitles.slice(0, 2).join(", ")}
                      {attendee.eventTitles.length > 2 &&
                        ` +${attendee.eventTitles.length - 2} more`}
                    </p>
                  </div>
                  <p className="col-span-2 text-center text-sm">
                    {attendee.totalEvents}
                  </p>
                  <p className="col-span-2 text-center text-sm">
                    {attendee.ticketCount}
                  </p>
                  <p className="col-span-2 text-right font-medium text-nocturn">
                    ${attendee.totalSpent.toFixed(2)}
                  </p>
                  <p className="col-span-2 text-right text-xs text-muted-foreground">
                    {attendee.lastEventDate
                      ? new Date(attendee.lastEventDate).toLocaleDateString(
                          "en",
                          { month: "short", day: "numeric", year: "numeric" }
                        )
                      : "N/A"}
                  </p>
                </div>

                {/* Mobile layout */}
                <div className="sm:hidden space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="truncate font-medium text-sm flex-1 min-w-0 mr-2">
                      {attendee.email}
                    </p>
                    <p className="font-medium text-nocturn shrink-0">
                      ${attendee.totalSpent.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      {attendee.totalEvents} event
                      {attendee.totalEvents !== 1 ? "s" : ""}
                    </span>
                    <span>
                      {attendee.ticketCount} ticket
                      {attendee.ticketCount !== 1 ? "s" : ""}
                    </span>
                    <span className="ml-auto">
                      {attendee.lastEventDate
                        ? new Date(attendee.lastEventDate).toLocaleDateString(
                            "en",
                            { month: "short", day: "numeric" }
                          )
                        : ""}
                    </span>
                  </div>
                  {attendee.eventTitles.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {attendee.eventTitles.slice(0, 3).map((title) => (
                        <span
                          key={title}
                          className="rounded-full bg-nocturn/10 px-2 py-0.5 text-[10px] font-medium text-nocturn"
                        >
                          {title}
                        </span>
                      ))}
                      {attendee.eventTitles.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{attendee.eventTitles.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : attendees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
              <Users className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-semibold text-lg">No attendees yet</p>
              <p className="text-sm text-muted-foreground max-w-[260px]">
                When people buy tickets to your events, they&apos;ll appear
                here automatically.
              </p>
            </div>
            <Link href="/dashboard/events">
              <Button className="bg-nocturn hover:bg-nocturn-light rounded-xl mt-2">
                View Your Events
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-8">
          No attendees match &quot;{search}&quot;
        </p>
      )}
    </div>
  );
}
