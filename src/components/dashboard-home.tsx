"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  ChevronRight,
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
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";

interface FinancialPulseData {
  revenue: number;
  expenses: number;
  netPL: number;
  outstandingSettlements: number;
  recentEvents: Array<{ title: string; profit: number }>;
}

interface BriefingItem {
  emoji: string;
  text: string;
  priority: "urgent" | "high" | "normal";
  link: string;
}

interface ActionItemData {
  id: string;
  type: "unsettled" | "draft" | "upcoming" | "low-sales" | "pending-settlement";
  message: string;
  link: string;
  priority: "urgent" | "high" | "normal";
  emoji: string;
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
  financialPulse: FinancialPulseData | null;
  briefing?: BriefingItem[];
  collectiveId?: string;
  actionItems?: ActionItemData[];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Still up?";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  if (hour < 24) return "The night is young";
  return "Good evening";
}

function getAmbienceColor(): { glow: string; bg: string } {
  const hour = new Date().getHours();
  if (hour < 6) return { glow: "rgba(123,47,247,0.12)", bg: "from-purple-950/20" };    // Late night — deep purple
  if (hour < 12) return { glow: "rgba(251,191,36,0.06)", bg: "from-amber-950/10" };     // Morning — warm amber
  if (hour < 17) return { glow: "rgba(251,146,60,0.05)", bg: "from-orange-950/10" };    // Afternoon — subtle orange
  if (hour < 21) return { glow: "rgba(123,47,247,0.08)", bg: "from-purple-950/15" };    // Evening — purple rising
  return { glow: "rgba(123,47,247,0.15)", bg: "from-purple-950/25" };                    // Night — full purple energy
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
    iconBg: string;
    priority: "primary" | "secondary";
  }> = [];

  if (props.upcomingCount === 0 && !props.hasDraftEvent) {
    actions.push({
      title: "Create Your First Event",
      description: "Nocturn can help you set up an event in minutes",
      href: "/dashboard/events/new",
      icon: <Plus className="h-5 w-5" />,
      color: "text-nocturn",
      iconBg: "bg-nocturn/15",
      priority: "primary",
    });
  } else if (props.hasDraftEvent) {
    actions.push({
      title: `Publish ${props.draftEventTitle || "Your Event"}`,
      description: "Your event is ready to go live",
      href: "/dashboard/events",
      icon: <Send className="h-5 w-5" />,
      color: "text-green-400",
      iconBg: "bg-green-500/15",
      priority: "primary",
    });
  } else if (props.nextEvent && props.nextEvent.daysUntil <= 7) {
    actions.push({
      title: `Promote ${props.nextEvent.title}`,
      description: "Generate marketing content to fill the room",
      href: "/dashboard/marketing",
      icon: <Megaphone className="h-5 w-5" />,
      color: "text-nocturn",
      iconBg: "bg-nocturn/15",
      priority: "primary",
    });
  } else {
    actions.push({
      title: "Create New Event",
      description: "Set up your next night out",
      href: "/dashboard/events/new",
      icon: <Plus className="h-5 w-5" />,
      color: "text-nocturn",
      iconBg: "bg-nocturn/15",
      priority: "primary",
    });
  }

  // Only show Promo + Money when user has at least 1 event
  if (props.upcomingCount > 0 || props.totalRevenue > 0 || props.hasDraftEvent) {
    actions.push({
      title: "Promo",
      description: "Flyers, social posts, and email blasts",
      href: "/dashboard/marketing",
      icon: <Sparkles className="h-5 w-5" />,
      color: "text-nocturn-light",
      iconBg: "bg-nocturn-light/15",
      priority: "secondary",
    });

    actions.push({
      title: "Money",
      description: "Splits, settlements, and P&L",
      href: "/dashboard/finance",
      icon: <DollarSign className="h-5 w-5" />,
      color: "text-nocturn-teal",
      iconBg: "bg-nocturn-teal/15",
      priority: "secondary",
    });
  } else {
    // Zero-event state: show venue discovery instead
    actions.push({
      title: "Find a Venue",
      description: "Browse Toronto venues for your first event",
      href: "/dashboard/venues",
      icon: <MapPin className="h-5 w-5" />,
      color: "text-nocturn-teal",
      iconBg: "bg-nocturn-teal/15",
      priority: "secondary",
    });
  }

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
    { href: "/dashboard/record", label: "Record Call", icon: Mic },
    { href: "/dashboard/venues", label: "Find Venue", icon: MapPin },
    { href: "/dashboard/events/new", label: "New Event", icon: Sparkles },
    { href: "/dashboard/chat", label: "Team Chat", icon: MessageSquare },
  ];

  const ambience = getAmbienceColor();

  return (
    <div className="space-y-6 gradient-mesh relative">
      {/* Time-of-day ambient glow */}
      <div className="absolute -top-20 -left-20 w-[400px] h-[400px] rounded-full blur-[120px] pointer-events-none" style={{ background: ambience.glow }} />

      {/* ── Greeting — large, editorial ── */}
      <div className="animate-fade-in-up relative z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight truncate">
            {greeting}, {props.firstName}
          </h1>
          <Sparkles className="h-6 w-6 shrink-0 text-nocturn-glow animate-text-glow" />
        </div>
        <p className="text-sm text-muted-foreground mt-2 line-clamp-2 max-w-lg">{message}</p>
      </div>

      {/* ── AI Briefing — lazy loaded so it doesn't block page render ── */}
      <LazyBriefing collectiveId={props.collectiveId} initialBriefing={props.briefing} />

      {/* ── Needs Attention — action items / alerts ── */}
      {props.actionItems && props.actionItems.length > 0 && (
        <div className="animate-fade-in-up delay-50 relative z-10">
          <Card className="rounded-2xl overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Needs Attention
                </h2>
                <span className="ml-auto text-xs text-muted-foreground">
                  {props.actionItems.length}
                </span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {props.actionItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.link}
                    className={`flex items-center gap-3 px-4 py-3 min-h-[48px] transition-all duration-200 hover:bg-white/[0.04] active:bg-white/[0.06] ${
                      item.priority === "urgent"
                        ? "bg-red-500/[0.04]"
                        : item.priority === "high"
                          ? "bg-amber-500/[0.02]"
                          : ""
                    }`}
                  >
                    <span className="text-base shrink-0">{item.emoji}</span>
                    <span
                      className={`text-sm leading-snug flex-1 min-w-0 line-clamp-2 ${
                        item.priority === "urgent"
                          ? "text-red-400"
                          : item.priority === "high"
                            ? "text-amber-300"
                            : "text-muted-foreground"
                      }`}
                    >
                      {item.message}
                    </span>
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 ${
                        item.priority === "urgent"
                          ? "text-red-400/60"
                          : item.priority === "high"
                            ? "text-amber-400/60"
                            : "text-muted-foreground/40"
                      }`}
                    />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Quick Actions — pill buttons with glow hover ── */}
      <div className="animate-fade-in-up delay-75 relative z-10">
        <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-2 shrink-0 rounded-full border border-nocturn/20 bg-nocturn/[0.06] px-4 py-2.5 min-h-[44px] hover:bg-nocturn/15 hover:border-nocturn/40 hover:shadow-[0_0_16px_rgba(123,47,247,0.12)] active:scale-95 transition-all duration-300"
              >
                <Icon className="h-4 w-4 text-nocturn-light" />
                <span className="text-sm font-medium text-white whitespace-nowrap">
                  {action.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Bento Grid: Financial Pulse (wide) + Stats (narrow) ── */}
      <div className={`grid grid-cols-1 ${props.financialPulse ? "md:grid-cols-3" : "md:grid-cols-3"} gap-4 animate-fade-in-up delay-100 relative z-10`}>
        {/* Financial Pulse — spans 2 cols on desktop */}
        {props.financialPulse ? (
          <Link href="/dashboard/finance" className="block md:col-span-2">
            <Card className="h-full rounded-2xl transition-all duration-300 hover:ring-nocturn/30 hover:shadow-lg hover:shadow-nocturn/10 active:scale-[0.98]">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-nocturn/20 to-nocturn-teal/10">
                      <TrendingUp className="h-5 w-5 text-nocturn-light" />
                    </div>
                    <h2 className="text-sm font-bold tracking-wide uppercase text-muted-foreground">Financial Pulse</h2>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* P&L headline */}
                <p className={`text-2xl font-bold ${props.financialPulse.netPL >= 0 ? "text-nocturn-teal" : "text-nocturn-coral"}`}>
                  {props.financialPulse.netPL >= 0
                    ? `+$${Math.abs(props.financialPulse.netPL).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                    : `-$${Math.abs(props.financialPulse.netPL).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                  <span className="text-sm font-medium text-muted-foreground ml-2">this month</span>
                </p>

                {/* Mini bar chart with gradient */}
                {props.financialPulse.recentEvents.length > 0 && (
                  <div className="mt-4 flex items-end gap-1.5 h-12">
                    {(() => {
                      const events = props.financialPulse.recentEvents.slice(0, 5);
                      const maxAbs = Math.max(...events.map((e) => Math.abs(e.profit)), 1);
                      return events.map((e, i) => {
                        const normalized = (e.profit / maxAbs) * 100;
                        const height = Math.max(Math.abs(normalized) * 0.4 + 8, 8);
                        const isPositive = e.profit >= 0;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center justify-end" title={e.title}>
                            <div
                              className={`w-full rounded-md transition-all ${
                                isPositive
                                  ? "bg-gradient-to-t from-nocturn-teal/40 to-nocturn-teal"
                                  : "bg-gradient-to-t from-nocturn-coral/40 to-nocturn-coral"
                              }`}
                              style={{ height: `${height}px` }}
                            />
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* Outstanding settlements */}
                <p className="text-xs text-muted-foreground mt-3">
                  {props.financialPulse.outstandingSettlements > 0
                    ? `${props.financialPulse.outstandingSettlements} outstanding settlement${props.financialPulse.outstandingSettlements !== 1 ? "s" : ""}`
                    : "All settled \u2713"}
                </p>
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Link href="/dashboard/events/new" className="block md:col-span-2">
            <Card className="h-full rounded-2xl border-dashed ring-white/[0.04] transition-all duration-300 hover:ring-nocturn/20 hover:shadow-lg hover:shadow-nocturn/5 active:scale-[0.98]">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center min-h-[160px]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-nocturn/10 mb-3">
                  <TrendingUp className="h-6 w-6 text-nocturn-light/60" />
                </div>
                <p className="text-sm font-semibold text-foreground/80">No financial data yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                  Create and publish an event to start tracking revenue and expenses.
                </p>
                <Button variant="outline" size="sm" className="mt-4 rounded-full border-nocturn/20 text-nocturn-light hover:bg-nocturn/10 hover:border-nocturn/30 transition-all duration-200">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create Event
                </Button>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Stats column — stacked */}
        <div className="grid grid-cols-3 md:grid-cols-1 gap-4">
          <Card className="rounded-2xl transition-all duration-300 hover:ring-nocturn/20 hover:shadow-md hover:shadow-nocturn/5 active:scale-[0.98]">
            <CardContent className="flex flex-col items-center gap-2 p-4 md:flex-row md:gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-nocturn/20 to-nocturn/5">
                <Calendar className="h-5 w-5 text-nocturn-light" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-xs text-muted-foreground">Upcoming</p>
                <p className="text-xl font-bold text-nocturn-light">{props.upcomingCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl transition-all duration-300 hover:ring-nocturn-teal/20 hover:shadow-md hover:shadow-nocturn-teal/5 active:scale-[0.98]">
            <CardContent className="flex flex-col items-center gap-2 p-4 md:flex-row md:gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-nocturn-teal/20 to-nocturn-teal/5">
                <DollarSign className="h-5 w-5 text-nocturn-teal" />
              </div>
              <div className="text-center md:text-left min-w-0">
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-xl font-bold truncate">
                  ${props.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl transition-all duration-300 hover:ring-nocturn-coral/20 hover:shadow-md hover:shadow-nocturn-coral/5 active:scale-[0.98]">
            <CardContent className="flex flex-col items-center gap-2 p-4 md:flex-row md:gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-nocturn-coral/20 to-nocturn-coral/5">
                <Users className="h-5 w-5 text-nocturn-coral" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-xs text-muted-foreground">Attendees</p>
                <p className="text-xl font-bold">{props.totalAttendees}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Smart Actions — enhanced cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in-up delay-200 relative z-10">
        {actions.map((action, i) => (
          <Link key={action.href + i} href={action.href}>
            <Card className={`h-full rounded-2xl transition-all duration-300 hover:shadow-lg hover:shadow-nocturn/10 active:scale-[0.98] ${
              action.priority === "primary" ? "ring-nocturn/20 hover:ring-nocturn/40" : "hover:ring-white/[0.12]"
            }`}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${action.iconBg} ${action.color}`}>
                  {action.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{action.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {action.description}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── AI Insights — accent border ── */}
      <Card className="rounded-2xl border-l-4 border-l-nocturn animate-fade-in-up delay-300 relative z-10">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <Sparkles className="h-4 w-4 text-nocturn-glow animate-text-glow" />
            Nocturn Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {insights.map((insight, i) => (
            <Link
              key={i}
              href={insight.href}
              className="flex items-start gap-2 group rounded-lg px-2 py-1.5 -mx-2 transition-all duration-200 hover:bg-white/[0.04] active:bg-white/[0.06]"
            >
              <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5 text-nocturn opacity-50 group-hover:opacity-100 transition-opacity duration-200" />
              <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors duration-200 line-clamp-2">
                {insight.text}
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Lazy-loaded AI Briefing (doesn't block page render) ──

function LazyBriefing({ collectiveId, initialBriefing }: { collectiveId?: string; initialBriefing?: BriefingItem[] }) {
  const [briefing, setBriefing] = React.useState<BriefingItem[]>(initialBriefing ?? []);
  const [loading, setLoading] = React.useState(!initialBriefing?.length && !!collectiveId);

  React.useEffect(() => {
    if (initialBriefing?.length || !collectiveId) return;

    let cancelled = false;
    async function load() {
      try {
        const { generateMorningBriefing } = await import("@/app/actions/ai-briefing");
        const result = await generateMorningBriefing(collectiveId!);
        if (!cancelled && Array.isArray(result)) {
          setBriefing(result);
        }
      } catch {
        // Briefing failed — non-critical, just hide it
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [collectiveId, initialBriefing]);

  if (loading) {
    return (
      <div className="animate-fade-in-up delay-50 relative z-10">
        <Card className="rounded-2xl ring-nocturn/20 bg-nocturn/[0.06] backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-nocturn/20">
                <Sparkles className="h-3.5 w-3.5 text-nocturn-glow animate-pulse" />
              </div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-nocturn-light">AI Briefing</h2>
            </div>
            <div className="space-y-2">
              <div className="h-4 w-3/4 rounded bg-nocturn/10 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-nocturn/10 animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-nocturn/10 animate-pulse" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!briefing.length) return null;

  return (
    <div className="animate-fade-in-up delay-50 relative z-10">
      <Card className="rounded-2xl ring-nocturn/20 bg-nocturn/[0.06] backdrop-blur-sm glow-purple">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-nocturn/20">
              <Sparkles className="h-3.5 w-3.5 text-nocturn-glow" />
            </div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-nocturn-light">AI Briefing</h2>
          </div>
          <div className="space-y-1.5">
            {briefing.map((item, i) => (
              <Link
                key={i}
                href={item.link}
                className={`flex items-start gap-2.5 rounded-lg p-2 -mx-2 transition-all duration-200 hover:bg-white/[0.04] active:bg-white/[0.06] ${
                  item.priority === "urgent"
                    ? "text-nocturn-coral"
                    : item.priority === "high"
                      ? "text-nocturn-amber"
                      : "text-muted-foreground"
                }`}
              >
                <span className="text-base shrink-0 mt-0.5">{item.emoji}</span>
                <span className="text-sm leading-snug">{item.text}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
