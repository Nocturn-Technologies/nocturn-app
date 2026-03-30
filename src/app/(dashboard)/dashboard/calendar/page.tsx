"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Flame, Calendar, Info } from "lucide-react";

interface EventDay {
  date: string; // YYYY-MM-DD
  count: number;
  events: { title: string; collective: string }[];
}

// Day quality scoring
function getDayScore(
  date: Date,
  eventCount: number,
  isYourEvent: boolean
): { score: number; label: string; color: string; tip: string } {
  const day = date.getDay(); // 0=Sun, 6=Sat
  const month = date.getMonth();

  // Base score from day of week (higher = better night to throw)
  let score = 50;
  if (day === 5) score = 90; // Friday
  if (day === 6) score = 95; // Saturday
  if (day === 4) score = 70; // Thursday
  if (day === 0) score = 40; // Sunday
  if (day >= 1 && day <= 3) score = 20; // Mon-Wed

  // Long weekend boost (check if Monday/Friday is near)
  // Summer months are prime (Jun-Sep)
  if (month >= 5 && month <= 8) score = Math.min(score + 10, 100);

  // Competition penalty
  if (eventCount >= 3) {
    score = Math.max(score - 30, 10);
  } else if (eventCount === 2) {
    score = Math.max(score - 15, 15);
  } else if (eventCount === 1 && !isYourEvent) {
    score = Math.max(score - 5, 20);
  }

  // Your own event — mark differently
  if (isYourEvent) {
    return { score, label: "Your event", color: "bg-nocturn", tip: "You already have an event this night" };
  }

  if (score >= 80) return { score, label: "Great night", color: "bg-green-500", tip: "Low competition, prime day. Book it." };
  if (score >= 60) return { score, label: "Good night", color: "bg-green-400/70", tip: "Solid option with moderate activity." };
  if (score >= 40) return { score, label: "Okay", color: "bg-yellow-500/70", tip: "Some competition or weaker day." };
  if (score >= 25) return { score, label: "Risky", color: "bg-orange-500/70", tip: "High competition or slow night." };
  return { score, label: "Avoid", color: "bg-red-500/50", tip: "Saturated or off-day. Pick another night." };
}

export default function CalendarHeatMap() {
  const supabase = createClient();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [events, setEvents] = useState<EventDay[]>([]);
  const [yourCollectiveIds, setYourCollectiveIds] = useState<string[]>([]);
  const [allEvents, setAllEvents] = useState<Array<{ starts_at: string; title: string; collective_id: string; collectives: { name: string } | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [currentMonth]);

  async function loadData() {
    setLoading(true);

    // Get user's collectives
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberships } = await supabase
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null);

    const collIds = memberships?.map((m) => m.collective_id) ?? [];
    setYourCollectiveIds(collIds);

    // Get all events in this month's range (± 1 week buffer)
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    start.setDate(start.getDate() - 7);
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    end.setDate(end.getDate() + 7);

    const { data: eventData } = await supabase
      .from("events")
      .select("starts_at, title, collective_id, collectives(name)")
      .in("status", ["published", "completed"])
      .is("deleted_at", null)
      .gte("starts_at", start.toISOString())
      .lte("starts_at", end.toISOString())
      .order("starts_at");

    setAllEvents((eventData ?? []) as unknown as typeof allEvents);

    // Group by date
    const byDate: Record<string, EventDay> = {};
    for (const ev of eventData ?? []) {
      const eventDate = new Date(ev.starts_at);
      const dateKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, "0")}-${String(eventDate.getDate()).padStart(2, "0")}`;
      if (!byDate[dateKey]) {
        byDate[dateKey] = { date: dateKey, count: 0, events: [] };
      }
      byDate[dateKey].count++;
      const col = ev.collectives as unknown as { name: string } | null;
      byDate[dateKey].events.push({
        title: ev.title,
        collective: col?.name ?? "Unknown",
      });
    }

    setEvents(Object.values(byDate));
    setLoading(false);
  }

  // Calendar grid
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: Array<{ date: Date; inMonth: boolean }> = [];

    // Previous month padding
    for (let i = 0; i < firstDay; i++) {
      const d = new Date(year, month, -firstDay + i + 1);
      days.push({ date: d, inMonth: false });
    }

    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), inMonth: true });
    }

    // Next month padding (fill to 42 = 6 rows)
    while (days.length < 42) {
      const d = new Date(year, month + 1, days.length - firstDay - daysInMonth + 1);
      days.push({ date: d, inMonth: false });
    }

    return days;
  }, [currentMonth]);

  const eventMap = useMemo(() => {
    const map: Record<string, EventDay> = {};
    for (const e of events) {
      map[e.date] = e;
    }
    return map;
  }, [events]);

  const selectedDayData = selectedDay ? eventMap[selectedDay] : null;
  const selectedDate = selectedDay ? new Date(selectedDay + "T12:00:00") : null;
  const selectedScore = selectedDate
    ? getDayScore(
        selectedDate,
        selectedDayData?.count ?? 0,
        selectedDayData?.events.some(() =>
          allEvents.some(
            (e) =>
              e.starts_at.slice(0, 10) === selectedDay &&
              yourCollectiveIds.includes(e.collective_id)
          )
        ) ?? false
      )
    : null;

  const monthName = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Find the best nights to throw — powered by city-wide event data
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <span className="text-muted-foreground">Great</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-yellow-500/70" />
          <span className="text-muted-foreground">Okay</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-orange-500/70" />
          <span className="text-muted-foreground">Risky</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-500/50" />
          <span className="text-muted-foreground">Avoid</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-nocturn" />
          <span className="text-muted-foreground">Your event</span>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between px-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">{monthName}</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar grid */}
      <Card>
        <CardContent className="p-2 sm:p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map(({ date, inMonth }, i) => {
                const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                const dayData = eventMap[dateKey];
                const isPast = date < new Date(new Date().toDateString());
                const now = new Date();
                const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                const isToday = dateKey === todayKey;
                const isYourEvent = allEvents.some(
                  (e) => e.starts_at.slice(0, 10) === dateKey && yourCollectiveIds.includes(e.collective_id)
                );

                const { color, score } = getDayScore(date, dayData?.count ?? 0, isYourEvent);
                const isSelected = selectedDay === dateKey;

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(isSelected ? null : dateKey)}
                    disabled={!inMonth}
                    className={`
                      relative aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all
                      ${!inMonth ? "opacity-20 cursor-default" : "cursor-pointer hover:ring-1 hover:ring-white/20"}
                      ${isSelected ? "ring-2 ring-nocturn" : ""}
                      ${isToday ? "ring-1 ring-white/30" : ""}
                      ${isPast && inMonth ? "opacity-40" : ""}
                    `}
                  >
                    {/* Heat background */}
                    {inMonth && !isPast && (
                      <div className={`absolute inset-0 rounded-lg ${color} opacity-30`} />
                    )}
                    <span className={`relative z-10 font-medium ${isToday ? "text-nocturn" : ""}`}>
                      {date.getDate()}
                    </span>
                    {dayData && dayData.count > 0 && inMonth && (
                      <span className="relative z-10 text-[8px] text-muted-foreground mt-0.5">
                        {dayData.count} evt{dayData.count > 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected day detail */}
      {selectedDay && selectedDate && selectedScore && (
        <Card className="animate-fade-in-up">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-nocturn" />
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                selectedScore.score >= 80 ? "bg-green-500/10 text-green-500" :
                selectedScore.score >= 60 ? "bg-green-400/10 text-green-400" :
                selectedScore.score >= 40 ? "bg-yellow-500/10 text-yellow-500" :
                selectedScore.score >= 25 ? "bg-orange-500/10 text-orange-500" :
                "bg-red-500/10 text-red-500"
              }`}>
                {selectedScore.label}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">{selectedScore.tip}</p>
            </div>

            {selectedDayData && selectedDayData.events.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Events this night</p>
                {selectedDayData.events.map((ev, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <span className="text-sm font-medium truncate">{ev.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{ev.collective}</span>
                  </div>
                ))}
              </div>
            )}

            {(!selectedDayData || selectedDayData.events.length === 0) && selectedScore.score >= 60 && (
              <div className="flex items-center gap-2 text-sm">
                <Flame className="h-4 w-4 text-green-500" />
                <span className="text-green-500 font-medium">No competing events — great night to throw!</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monthly summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Monthly Summary</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1 text-muted-foreground">
          <p>{events.reduce((s, e) => s + e.count, 0)} events across {events.length} nights this month</p>
          <p>{calendarDays.filter(({ date, inMonth }) => {
            if (!inMonth) return false;
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            const isPast = date < new Date(new Date().toDateString());
            if (isPast) return false;
            const dayData = eventMap[dateKey];
            const score = getDayScore(date, dayData?.count ?? 0, false);
            return score.score >= 80;
          }).length} great nights available</p>
        </CardContent>
      </Card>
    </div>
  );
}
