"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  DollarSign,
  Users,
  Ticket,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { generatePostEventRecap, type PostEventRecap } from "@/app/actions/ai-finance";

const priorityColors: Record<string, string> = {
  high: "border-l-red-500 bg-red-500/5",
  medium: "border-l-nocturn-amber bg-nocturn-amber/5",
  low: "border-l-nocturn-teal bg-nocturn-teal/5",
};

const categoryIcons: Record<string, React.ReactNode> = {
  finance: <DollarSign className="h-4 w-4" />,
  marketing: <Sparkles className="h-4 w-4" />,
  operations: <AlertCircle className="h-4 w-4" />,
  growth: <TrendingUp className="h-4 w-4" />,
};

export default function RecapPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [recap, setRecap] = useState<PostEventRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generatePostEventRecap(eventId).then((result) => {
      if (result.error) setError(result.error);
      setRecap(result.recap);
      setLoading(false);
    });
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10 animate-pulse-glow">
          <BarChart3 className="h-6 w-6 text-nocturn" />
        </div>
        <p className="text-sm text-muted-foreground">Analyzing your event...</p>
      </div>
    );
  }

  if (error || !recap) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/events/${eventId}`}>
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-2xl font-bold font-heading">Post-Event Recap</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {error || "Could not generate recap"}
          </CardContent>
        </Card>
      </div>
    );
  }

  const r = recap;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold font-heading truncate">{r.event.title}</h1>
          <p className="text-sm text-muted-foreground">{r.event.date} · {r.event.venue}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-nocturn/10 px-3 py-1">
          <Sparkles className="h-3 w-3 text-nocturn" />
          <span className="text-xs font-medium text-nocturn">AI Recap</span>
        </div>
      </div>

      {/* Highlights */}
      {r.highlights.length > 0 && (
        <div className="flex flex-wrap gap-2 animate-fade-in-up">
          {r.highlights.map((h, i) => (
            <span key={i} className="rounded-full bg-card border px-3 py-1.5 text-sm">
              {h}
            </span>
          ))}
        </div>
      )}

      {/* Key stats grid */}
      <div className="grid gap-4 sm:grid-cols-4 animate-fade-in-up delay-100">
        <Card>
          <CardContent className="p-4 text-center">
            <Ticket className="h-5 w-5 mx-auto mb-1 text-nocturn" />
            <p className="text-2xl font-bold font-heading">{r.financial.ticketsSold}</p>
            <p className="text-xs text-muted-foreground">Tickets Sold</p>
            <p className="text-[10px] text-muted-foreground">
              {Math.round(r.financial.sellThrough * 100)}% of {r.financial.capacity}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <p className="text-2xl font-bold font-heading">${r.financial.grossRevenue.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">Gross Revenue</p>
            <p className="text-[10px] text-muted-foreground">
              Avg ${r.financial.avgTicketPrice.toFixed(0)}/ticket
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold font-heading">{r.attendance.checkedIn}</p>
            <p className="text-xs text-muted-foreground">Checked In</p>
            <p className="text-[10px] text-muted-foreground">
              {Math.round(r.attendance.checkInRate * 100)}% show rate · {r.attendance.noShows} no-shows
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className={`h-5 w-5 mx-auto mb-1 ${r.financial.netProfit >= 0 ? "text-green-500" : "text-red-500"}`} />
            <p className={`text-2xl font-bold ${r.financial.netProfit >= 0 ? "text-green-500" : "text-red-500"}`}>
              ${r.financial.netProfit.toFixed(0)}
            </p>
            <p className="text-xs text-muted-foreground">Net Profit</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Items */}
      <Card className="animate-fade-in-up delay-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-nocturn animate-text-glow" />
            Post-Event Action Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {r.actionItems.map((item, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-lg border-l-4 p-3 ${priorityColors[item.priority] ?? ""}`}
            >
              <div className="mt-0.5 text-muted-foreground shrink-0">
                {categoryIcons[item.category] ?? <CheckCircle className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize shrink-0 ${
                item.priority === "high" ? "bg-red-500/10 text-red-500" :
                item.priority === "medium" ? "bg-nocturn-amber/10 text-nocturn-amber" :
                "bg-nocturn-teal/10 text-nocturn-teal"
              }`}>
                {item.priority}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2 animate-fade-in-up delay-300">
        <Link href={`/dashboard/events/${eventId}/financials`}>
          <Card className="transition-colors hover:border-nocturn/30">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-nocturn-teal" />
                <div>
                  <p className="text-sm font-medium">View Settlement</p>
                  <p className="text-xs text-muted-foreground">Full P&L breakdown</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/marketing/email">
          <Card className="transition-colors hover:border-nocturn/30">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-nocturn" />
                <div>
                  <p className="text-sm font-medium">Draft Recap Email</p>
                  <p className="text-xs text-muted-foreground">AI-generated thank you email</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
