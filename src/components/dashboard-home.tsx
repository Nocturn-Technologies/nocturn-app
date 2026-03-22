"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  DollarSign,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Megaphone,
  Plus,
  Send,
  Users,
  Mic,
  MapPin,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";

interface FinancialPulseData {
  revenue: number;
  expenses: number;
  netPL: number;
  outstandingSettlements: number;
  recentEvents: Array<{ title: string; profit: number }>;
}

interface DashboardHomeProps {
  firstName: string;
  collectiveName: string;
  collectiveAge: number; // days since created
  upcomingCount: number;
  nextEvent: { title: string; daysUntil: number } | null;
  hasDraftEvent: boolean;
  draftEventTitle?: string;
  totalRevenue: number;
  totalAttendees: number;
  financialPulse: FinancialPulseData;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getContextualMessage(props: DashboardHomeProps): string {
  if (props.collectiveAge === 0) {
    return `Welcome to Nocturn! Let's get ${props.collectiveName} off the ground.`;
  }
  if (props.upcomingCount === 0 && props.collectiveAge <= 7) {
    return `${props.collectiveName} is ready — let's create your first event.`;
  }
  if (props.nextEvent && props.nextEvent.daysUntil <= 7) {
    return `${props.nextEvent.title} is in ${props.nextEvent.daysUntil} day${props.nextEvent.daysUntil !== 1 ? "s" : ""} — here's what to do.`;
  }
  return `Here's what's happening with ${props.collectiveName}.`;
}

function getSmartActions(props: DashboardHomeProps) {
  const actions: Array<{
    title: string;
    description: string;
    href: string;
    icon: React.ReactNode;
    color: string;
    priority: "primary" | "secondary";
  }> = [];

  if (props.upcomingCount === 0 && !props.hasDraftEvent) {
    actions.push({
      title: "Create Your First Event",
      description: "Nocturn can help you set up an event in minutes",
      href: "/dashboard/events/new",
      icon: <Plus className="h-5 w-5" />,
      color: "bg-nocturn/10 text-nocturn",
      priority: "primary",
    });
  } else if (props.hasDraftEvent) {
    actions.push({
      title: `Publish ${props.draftEventTitle || "Your Event"}`,
      description: "Your event is ready to go live",
      href: "/dashboard/events",
      icon: <Send className="h-5 w-5" />,
      color: "bg-green-500/10 text-green-500",
      priority: "primary",
    });
  } else if (props.nextEvent && props.nextEvent.daysUntil <= 7) {
    actions.push({
      title: `Promote ${props.nextEvent.title}`,
      description: "Generate marketing content to fill the room",
      href: "/dashboard/marketing",
      icon: <Megaphone className="h-5 w-5" />,
      color: "bg-nocturn/10 text-nocturn",
      priority: "primary",
    });
  } else {
    actions.push({
      title: "Create New Event",
      description: "Set up your next night out",
      href: "/dashboard/events/new",
      icon: <Plus className="h-5 w-5" />,
      color: "bg-nocturn/10 text-nocturn",
      priority: "primary",
    });
  }

  actions.push({
    title: "AI Marketing",
    description: "Generate posts, emails, and promos",
    href: "/dashboard/marketing",
    icon: <Sparkles className="h-5 w-5" />,
    color: "bg-nocturn-light/10 text-nocturn-light",
    priority: "secondary",
  });

  actions.push({
    title: "Finance",
    description: "View settlements and P&L",
    href: "/dashboard/finance",
    icon: <DollarSign className="h-5 w-5" />,
    color: "bg-nocturn-teal/10 text-nocturn-teal",
    priority: "secondary",
  });

  return actions;
}

function getInsights(props: DashboardHomeProps): Array<{ text: string; href: string }> {
  const insights: Array<{ text: string; href: string }> = [];

  if (props.upcomingCount === 0) {
    insights.push({
      text: "Create your first event to unlock marketing, ticketing, and finance tools.",
      href: "/dashboard/events/new",
    });
  }
  if (props.totalRevenue === 0 && props.upcomingCount > 0) {
    insights.push({
      text: "Publish your event and share the ticket link to start selling.",
      href: "/dashboard/events",
    });
  }
  if (props.nextEvent && props.nextEvent.daysUntil <= 14) {
    insights.push({
      text: "Events with social media promotion sell 3x more tickets on average.",
      href: "/dashboard/marketing",
    });
  }
  if (props.totalAttendees > 0) {
    insights.push({
      text: `You have ${props.totalAttendees} attendee${props.totalAttendees !== 1 ? "s" : ""} in your CRM. Use email campaigns to bring them back.`,
      href: "/dashboard/attendees",
    });
  }

  // Always have at least one insight
  if (insights.length === 0) {
    insights.push({
      text: "Nocturn handles ticketing, settlements, and marketing — all powered by AI.",
      href: "/dashboard/marketing",
    });
  }

  return insights.slice(0, 3);
}

export function DashboardHome(props: DashboardHomeProps) {
  const greeting = getGreeting();
  const message = getContextualMessage(props);
  const actions = getSmartActions(props);
  const insights = getInsights(props);

  const quickActions = [
    { href: "/dashboard/record", label: "Record Call", icon: Mic, emoji: "" },
    { href: "/dashboard/venues", label: "Find Venue", icon: MapPin, emoji: "" },
    { href: "/dashboard/events/new", label: "New Event", icon: Sparkles, emoji: "" },
    { href: "/dashboard/chat", label: "Team Chat", icon: MessageSquare, emoji: "" },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="animate-fade-in-up">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">
            {greeting}, {props.firstName}
          </h1>
          <Sparkles className="h-5 w-5 text-nocturn animate-text-glow" />
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{message}</p>
      </div>

      {/* Quick Actions — horizontal scroll on mobile */}
      <div className="animate-fade-in-up delay-50">
        <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-2 shrink-0 rounded-full border border-[#7B2FF7]/20 bg-[#7B2FF7]/5 px-4 py-2.5 min-h-[44px] hover:bg-[#7B2FF7]/10 hover:border-[#7B2FF7]/40 active:scale-95 transition-all"
              >
                <Icon className="h-4 w-4 text-[#7B2FF7]" />
                <span className="text-sm font-medium text-white whitespace-nowrap">
                  {action.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Financial Pulse */}
      <Link href="/dashboard/finance" className="block animate-fade-in-up delay-75">
        <Card className="border-nocturn/20 transition-all hover:border-nocturn/40 hover:shadow-lg hover:shadow-nocturn/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-nocturn/10">
                  <TrendingUp className="h-4 w-4 text-nocturn" />
                </div>
                <span className="text-sm font-semibold">Financial Pulse</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* P&L headline */}
            <p className={`text-lg font-bold ${props.financialPulse.netPL >= 0 ? "text-green-500" : "text-red-500"}`}>
              {props.financialPulse.netPL >= 0
                ? `You're up $${Math.abs(props.financialPulse.netPL).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} this month`
                : `Down $${Math.abs(props.financialPulse.netPL).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} this month`}
            </p>

            {/* Sparkline — CSS dots for last 5 events */}
            {props.financialPulse.recentEvents.length > 0 && (
              <div className="my-3 flex items-end gap-1 h-8">
                {(() => {
                  const events = props.financialPulse.recentEvents.slice(0, 5);
                  const maxAbs = Math.max(...events.map((e) => Math.abs(e.profit)), 1);
                  return events.map((e, i) => {
                    const normalized = (e.profit / maxAbs) * 100;
                    const height = Math.max(Math.abs(normalized) * 0.28 + 4, 4);
                    const isPositive = e.profit >= 0;
                    return (
                      <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                        <div
                          className={`w-2 rounded-full transition-all ${isPositive ? "bg-green-500" : "bg-red-500"}`}
                          style={{ height: `${height}px` }}
                        />
                        {i < events.length - 1 && (
                          <div className="w-full h-px bg-border" />
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* Outstanding settlements */}
            <p className="text-xs text-muted-foreground">
              {props.financialPulse.outstandingSettlements > 0
                ? `${props.financialPulse.outstandingSettlements} outstanding settlement${props.financialPulse.outstandingSettlements !== 1 ? "s" : ""}`
                : "All settled \u2713"}
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="animate-fade-in-up delay-100">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-nocturn/10">
              <Calendar className="h-5 w-5 text-nocturn" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Upcoming</p>
              <p className="text-xl font-bold text-nocturn">{props.upcomingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up delay-200">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-nocturn-teal/10">
              <DollarSign className="h-5 w-5 text-nocturn-teal" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-xl font-bold">${props.totalRevenue.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up delay-300">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-nocturn-coral/10">
              <Users className="h-5 w-5 text-nocturn-coral" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Attendees</p>
              <p className="text-xl font-bold">{props.totalAttendees}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Smart Actions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in-up delay-300">
        {actions.map((action, i) => (
          <Link key={action.href + i} href={action.href}>
            <Card className={`h-full transition-all hover:border-nocturn/30 hover:shadow-lg hover:shadow-nocturn/5 ${action.priority === "primary" ? "border-nocturn/20" : ""}`}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${action.color}`}>
                  {action.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{action.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {action.description}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* AI Insights */}
      <Card className="border-l-4 border-l-nocturn animate-fade-in-up delay-400">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-nocturn animate-text-glow" />
            Nocturn Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {insights.map((insight, i) => (
            <Link
              key={i}
              href={insight.href}
              className="flex items-start gap-2 group"
            >
              <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5 text-nocturn opacity-50 group-hover:opacity-100 transition-opacity" />
              <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                {insight.text}
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
