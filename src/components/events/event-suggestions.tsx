"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, MapPin, Calendar, ArrowRight } from "lucide-react";
import type { Suggestion } from "@/app/actions/event-suggestions";

const confidenceColors: Record<string, string> = {
  high: "bg-green-500/10 text-green-400 border-green-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

function formatSuggestedDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function EventSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-nocturn" />
        <h2 className="text-lg font-bold">What should you throw next?</h2>
      </div>
      <div className="grid gap-3">
        {suggestions.map((suggestion, i) => (
          <Card
            key={i}
            className="rounded-2xl border-border/50 transition-all duration-200 hover:border-nocturn/30"
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-bold text-base truncate">
                    {suggestion.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 truncate min-w-0">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{suggestion.suggestedVenue}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {formatSuggestedDate(suggestion.suggestedDate)}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-nocturn/10 px-2 py-0.5 text-xs font-medium text-nocturn">
                    {suggestion.vibe}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                      confidenceColors[suggestion.confidence] ?? ""
                    }`}
                  >
                    {suggestion.confidence}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {suggestion.reason}
              </p>
              <Link href="/dashboard/calendar">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs text-nocturn hover:text-nocturn-light hover:bg-nocturn/10 active:scale-95 transition-all duration-200"
                >
                  Plan this event
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
