"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  getAudienceSegments,
  type AudienceMember,
  type AudienceSegments,
  type AudienceOverview,
} from "@/app/actions/audience";
import {
  generateDMTemplates,
  type DMTemplate,
} from "@/app/actions/ambassador-config";
import {
  analyzeTicketSalesPatterns,
  getAudienceInsights,
  type SalesPatterns,
  type AudienceInsights,
} from "@/app/actions/promo-intelligence";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Users,
  Crown,
  Star,
  UserPlus,
  Trophy,
  DollarSign,
  TrendingUp,
  Share2,
  Copy,
  Check,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Mail,
  Sparkles,
  UsersRound,
  MapPin,
  Music,
  CalendarRange,
  Clock,
  BarChart3,
  Repeat,
  ExternalLink,
  CalendarDays,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ── Section Tab Config ──

type SectionKey = "audience" | "insights" | "venues" | "artists" | "calendar" | "crm";

const sectionConfig: {
  key: SectionKey;
  label: string;
  icon: typeof UsersRound;
}[] = [
  { key: "audience", label: "Audience", icon: UsersRound },
  { key: "crm", label: "CRM", icon: Users },
  { key: "insights", label: "Insights", icon: TrendingUp },
  { key: "venues", label: "Venues", icon: MapPin },
  { key: "artists", label: "Artists", icon: Music },
  { key: "calendar", label: "Calendar", icon: CalendarRange },
];

// ── Segment Tab Config ──

type SegmentKey = "core50" | "ambassadors" | "repeatFans" | "firstTimers";

const segmentConfig: Record<
  SegmentKey,
  {
    label: string;
    shortLabel: string;
    icon: typeof Crown;
    color: string;
    badgeColor: string;
    description: string;
  }
> = {
  core50: {
    label: "Your Core 50",
    shortLabel: "Core 50",
    icon: Crown,
    color: "text-amber-400",
    badgeColor: "bg-amber-400/10 text-amber-400 border-amber-400/20",
    description: "Top repeat attendees — your most loyal fans",
  },
  ambassadors: {
    label: "Ambassadors",
    shortLabel: "Ambassadors",
    icon: Trophy,
    color: "text-nocturn",
    badgeColor: "bg-nocturn/10 text-nocturn border-nocturn/20",
    description: "Referred 3+ people — your growth engine",
  },
  repeatFans: {
    label: "Repeat Fans",
    shortLabel: "Repeat",
    icon: Star,
    color: "text-green-400",
    badgeColor: "bg-green-400/10 text-green-400 border-green-400/20",
    description: "Attended 2+ events — building loyalty",
  },
  firstTimers: {
    label: "First-Timers",
    shortLabel: "New",
    icon: UserPlus,
    color: "text-blue-400",
    badgeColor: "bg-blue-400/10 text-blue-400 border-blue-400/20",
    description: "Attended 1 event — potential to convert",
  },
};

// ── Calendar helpers ──

function getDayScore(
  date: Date,
  eventCount: number,
  isYourEvent: boolean
): { score: number; color: string } {
  const day = date.getDay();
  const month = date.getMonth();
  let score = 50;
  if (day === 5) score = 90;
  if (day === 6) score = 95;
  if (day === 4) score = 70;
  if (day === 0) score = 40;
  if (day >= 1 && day <= 3) score = 20;
  if (month >= 5 && month <= 8) score = Math.min(score + 10, 100);
  if (eventCount >= 3) score = Math.max(score - 30, 10);
  else if (eventCount === 2) score = Math.max(score - 15, 15);
  else if (eventCount === 1 && !isYourEvent) score = Math.max(score - 5, 20);

  if (isYourEvent) return { score, color: "bg-nocturn" };
  if (score >= 80) return { score, color: "bg-green-500" };
  if (score >= 60) return { score, color: "bg-green-400/70" };
  if (score >= 40) return { score, color: "bg-yellow-500/70" };
  if (score >= 25) return { score, color: "bg-orange-500/70" };
  return { score, color: "bg-red-500/50" };
}

// ── Venue / Artist types ──

interface VenueCard {
  id: string;
  name: string;
  city: string | null;
  capacity: number | null;
  venue_type: string | null;
}

interface ArtistCard {
  id: string;
  name: string;
  slug: string;
  genre: string[];
  metadata: { location?: string } | null;
}

interface CalendarEvent {
  starts_at: string;
  title: string;
  collective_id: string;
}

// ── formatHour ──

function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════

export default function AudiencePage() {
  const supabase = createClient();

  // ── Audience state ──
  const [segments, setSegments] = useState<AudienceSegments>({
    core50: [],
    ambassadors: [],
    repeatFans: [],
    firstTimers: [],
  });
  const [overview, setOverview] = useState<AudienceOverview>({
    totalUniqueAttendees: 0,
    totalEvents: 0,
    avgEventsPerPerson: 0,
    totalReferrals: 0,
    totalRevenue: 0,
  });
  const [activeTab, setActiveTab] = useState<SegmentKey>("core50");
  const [dmTemplates, setDmTemplates] = useState<DMTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  // ── Insights state ──
  const [patterns, setPatterns] = useState<SalesPatterns | null>(null);
  const [audienceInsights, setAudienceInsights] =
    useState<AudienceInsights | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  // ── Venues state ──
  const [venues, setVenues] = useState<VenueCard[]>([]);

  // ── Artists state ──
  const [artists, setArtists] = useState<ArtistCard[]>([]);

  // ── Calendar state ──
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [yourCollectiveIds, setYourCollectiveIds] = useState<string[]>([]);

  // ── Loading ──
  const [loading, setLoading] = useState(true);

  // ── CRM state ──
  const [crmSearch, setCrmSearch] = useState("");
  const [crmSegmentFilter, setCrmSegmentFilter] = useState<AudienceMember["segment"] | "all">("all");

  // ── Section refs + active section ──
  const [activeSection, setActiveSection] = useState<SectionKey>("audience");
  const sectionRefs = useRef<Record<SectionKey, HTMLDivElement | null>>({
    audience: null,
    crm: null,
    insights: null,
    venues: null,
    artists: null,
    calendar: null,
  });
  const tabBarRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef(false);

  // ── Load all data ──
  useEffect(() => {
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAllData() {
    // 1. Audience segments + DM templates (server actions)
    const [segResult, templateResult] = await Promise.all([
      getAudienceSegments(),
      generateDMTemplates("", {}),
    ]);

    if (!segResult.error) {
      setSegments(segResult.segments);
      setOverview(segResult.overview);
    }
    if (!templateResult.error) {
      setDmTemplates(templateResult.templates);
    }

    // 2. Get user + collective for insights + calendar
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: memberships } = await supabase
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null);

    const collIds = (memberships?.map((m: { collective_id: string }) => m.collective_id) ?? []) as string[];
    setYourCollectiveIds(collIds);
    const collectiveId = collIds[0] || "";

    // 3. Parallel: insights, venues, artists, calendar events
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setDate(monthStart.getDate() - 7);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    monthEnd.setDate(monthEnd.getDate() + 7);

    const [patternsRes, audienceRes, venuesRes, artistsRes, calRes] =
      await Promise.all([
        collectiveId
          ? analyzeTicketSalesPatterns(collectiveId)
          : Promise.resolve({ error: null, data: null }),
        collectiveId
          ? getAudienceInsights(collectiveId)
          : Promise.resolve({ error: null, data: null }),
        supabase
          .from("saved_venues")
          .select("id, name, address, capacity, venue_type")
          .limit(6)
          .order("created_at", { ascending: false }),
        supabase
          .from("artists")
          .select("id, name, slug, genre, metadata")
          .limit(8)
          .order("created_at", { ascending: false }),
        supabase
          .from("events")
          .select("starts_at, title, collective_id")
          .in("status", ["published", "completed"])
          .is("deleted_at", null)
          .gte("starts_at", monthStart.toISOString())
          .lte("starts_at", monthEnd.toISOString())
          .order("starts_at"),
      ]);

    if (patternsRes.data) setPatterns(patternsRes.data);
    if (audienceRes.data) setAudienceInsights(audienceRes.data);
    if (patternsRes.error && audienceRes.error)
      setInsightsError(patternsRes.error);

    // Venues — extract city from address
    if (venuesRes.data) {
      setVenues(
        (venuesRes.data as Array<{ id: string; name: string; address: string | null; capacity: number | null; venue_type: string | null }>).map((v) => ({
          id: v.id,
          name: v.name,
          city: v.address?.split(",").slice(-2, -1)[0]?.trim() ?? null,
          capacity: v.capacity,
          venue_type: v.venue_type,
        }))
      );
    }

    if (artistsRes.data) {
      setArtists(artistsRes.data as ArtistCard[]);
    }

    if (calRes.data) {
      setCalendarEvents(calRes.data as CalendarEvent[]);
    }

    setLoading(false);
  }

  // ── IntersectionObserver for scroll tracking ──
  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    const keys: SectionKey[] = [
      "audience",
      "crm",
      "insights",
      "venues",
      "artists",
      "calendar",
    ];

    for (const key of keys) {
      const el = sectionRefs.current[key];
      if (!el) continue;

      const observer = new IntersectionObserver(
        (entries) => {
          if (isScrollingProgrammatically.current) return;
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveSection(key);
            }
          }
        },
        { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
      );

      observer.observe(el);
      observers.push(observer);
    }

    return () => {
      for (const obs of observers) obs.disconnect();
    };
  }, [loading]);

  // ── Scroll to section ──
  function scrollToSection(key: SectionKey) {
    const el = sectionRefs.current[key];
    if (!el) return;

    isScrollingProgrammatically.current = true;
    setActiveSection(key);

    el.scrollIntoView({ behavior: "smooth", block: "start" });

    // Re-enable observer after scroll finishes
    setTimeout(() => {
      isScrollingProgrammatically.current = false;
    }, 800);
  }

  // ── Clipboard ──
  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // ── DM personalization ──
  function getPersonalizedMessage(
    template: DMTemplate,
    member: AudienceMember
  ): string {
    let body = template.body;
    const name = member.name;
    if (name) {
      body = body.replace(/^Hey!/, `Hey ${name}!`);
      body = body.replace(/^We saw you/, `Hey ${name}! We saw you`);
    }
    if (member.eventsAttended > 1) {
      body = body.replace(/\{events\}/g, String(member.eventsAttended));
    }
    if (member.friendsReferred > 0) {
      body = body.replace(/\{referrals\}/g, String(member.friendsReferred));
    }
    const lastEvent = member.eventNames[member.eventNames.length - 1];
    if (lastEvent) {
      body = body.replace(/\{lastEvent\}/g, lastEvent);
    }
    return body;
  }

  // ── Derived CRM state ──
  const allCrmMembers = useMemo(() => {
    const seen = new Set<string>();
    const all: AudienceMember[] = [];
    for (const arr of [segments.core50, segments.ambassadors, segments.repeatFans, segments.firstTimers]) {
      for (const m of arr) {
        if (!seen.has(m.email)) {
          seen.add(m.email);
          all.push(m);
        }
      }
    }
    return all.sort((a, b) => b.totalSpent - a.totalSpent || b.eventsAttended - a.eventsAttended);
  }, [segments]);

  const filteredCrmMembers = useMemo(() => {
    let list = allCrmMembers;
    if (crmSegmentFilter !== "all") {
      list = list.filter((m) => m.segment === crmSegmentFilter);
    }
    if (crmSearch.trim()) {
      const q = crmSearch.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.email.toLowerCase().includes(q) ||
          (m.name ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allCrmMembers, crmSegmentFilter, crmSearch]);

  const crmStats = useMemo(() => {
    const total = allCrmMembers.length;
    const vips = allCrmMembers.filter((m) => m.totalSpent >= 200 || m.eventsAttended >= 5).length;
    const repeats = allCrmMembers.filter((m) => m.eventsAttended >= 2).length;
    const repeatRate = total > 0 ? Math.round((repeats / total) * 100) : 0;
    const totalLtv = allCrmMembers.reduce((s, m) => s + m.totalSpent, 0);
    const avgLtv = total > 0 ? totalLtv / total : 0;
    return { total, vips, repeatRate, avgLtv };
  }, [allCrmMembers]);

  const crmSegmentCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allCrmMembers.length, core: 0, ambassador: 0, repeat: 0, first_timer: 0 };
    for (const m of allCrmMembers) counts[m.segment] = (counts[m.segment] ?? 0) + 1;
    return counts;
  }, [allCrmMembers]);

  // ── Derived audience state ──
  const activeSegment = segments[activeTab];
  const config = segmentConfig[activeTab];
  const targetMap: Record<SegmentKey, DMTemplate["target"]> = {
    core50: "repeat_fan",
    ambassadors: "ambassador",
    repeatFans: "repeat_fan",
    firstTimers: "first_timer",
  };
  const relevantTemplates = dmTemplates.filter(
    (t) => t.target === targetMap[activeTab]
  );

  // ── Calendar grid (current month) ──
  const calendarDays = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: Array<{ date: Date; inMonth: boolean }> = [];

    for (let i = 0; i < firstDay; i++) {
      const d = new Date(year, month, -firstDay + i + 1);
      days.push({ date: d, inMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), inMonth: true });
    }
    while (days.length < 42) {
      const d = new Date(
        year,
        month + 1,
        days.length - firstDay - daysInMonth + 1
      );
      days.push({ date: d, inMonth: false });
    }

    return days;
  }, []);

  const calEventMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ev of calendarEvents) {
      const dk = ev.starts_at.slice(0, 10);
      map[dk] = (map[dk] ?? 0) + 1;
    }
    return map;
  }, [calendarEvents]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Reach</h1>
        <p className="text-sm text-muted-foreground">
          Grow your audience — segment, reward, discover, and re-engage
        </p>
      </div>

      {/* ── Pinned Section Tab Bar ── */}
      <div
        ref={tabBarRef}
        className="sticky top-0 z-20 bg-background pt-2 pb-2 -mx-1 px-1"
      >
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sectionConfig.map(({ key, label, icon: Icon }) => {
            const isActive = activeSection === key;
            return (
              <button
                key={key}
                onClick={() => scrollToSection(key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-card border border-border shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${isActive ? "text-nocturn" : ""}`}
                />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 1: Audience
      ════════════════════════════════════════════════════════════════════════ */}
      <div
        ref={(el) => { sectionRefs.current.audience = el; }}
        className="scroll-mt-16 space-y-4"
      >
        {/* Overview Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold">
                {overview.totalUniqueAttendees}
              </p>
              <p className="text-[11px] text-muted-foreground">Total People</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold">{overview.totalEvents}</p>
              <p className="text-[11px] text-muted-foreground">Events</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold">
                {overview.avgEventsPerPerson}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Avg Events/Person
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-nocturn">
                {overview.totalReferrals}
              </p>
              <p className="text-[11px] text-muted-foreground">Referrals</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-green-400">
                $
                {overview.totalRevenue.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Total Revenue
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Segment Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {(Object.keys(segmentConfig) as SegmentKey[]).map((key) => {
            const conf = segmentConfig[key];
            const count = segments[key].length;
            const Icon = conf.icon;
            const isActive = activeTab === key;

            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-card border border-border shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${isActive ? conf.color : ""}`}
                />
                <span>{conf.shortLabel}</span>
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1.5 py-0 h-4 ${
                    isActive ? conf.badgeColor : ""
                  }`}
                >
                  {count}
                </Badge>
              </button>
            );
          })}
        </div>

        {/* Active Segment Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <config.icon className={`h-4 w-4 ${config.color}`} />
                <CardTitle className="text-base">{config.label}</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTemplates(!showTemplates)}
                className="text-xs"
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                DM Templates
                {showTemplates ? (
                  <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {config.description}
            </p>
          </CardHeader>

          {/* DM Templates Panel */}
          {showTemplates && (
            <div className="px-6 pb-4">
              <div className="rounded-lg border border-nocturn/20 bg-nocturn/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-nocturn" />
                  <p className="text-sm font-medium">
                    Outreach Templates for {config.label}
                  </p>
                </div>
                {relevantTemplates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No templates available for this segment yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {relevantTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="rounded-md border border-border bg-card p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">
                            {template.label}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px]"
                            onClick={() =>
                              copyToClipboard(template.body, template.id)
                            }
                          >
                            {copiedId === template.id ? (
                              <>
                                <Check className="h-3 w-3 mr-1 text-green-400" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3 mr-1" />
                                Copy
                              </>
                            )}
                          </Button>
                        </div>
                        <p className="text-xs font-medium">
                          {template.subject}
                        </p>
                        <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                          {template.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <CardContent>
            {activeSegment.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
                  <config.icon className={`h-8 w-8 ${config.color}`} />
                </div>
                <div className="text-center">
                  <p className="font-medium">
                    No {config.label.toLowerCase()} yet
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {activeTab === "core50" &&
                      "When people attend multiple events, your most loyal fans show up here."}
                    {activeTab === "ambassadors" &&
                      "When attendees refer 3+ friends via referral links, they become ambassadors."}
                    {activeTab === "repeatFans" &&
                      "When attendees come to more than one event, they appear here."}
                    {activeTab === "firstTimers" &&
                      "First-time attendees will appear here after purchasing tickets."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activeSegment.map((member, i) => (
                  <div key={member.email} className="py-3">
                    <button
                      className="w-full text-left"
                      onClick={() =>
                        setExpandedMember(
                          expandedMember === member.email
                            ? null
                            : member.email
                        )
                      }
                    >
                      <div className="flex items-center gap-3">
                        {/* Rank */}
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            i === 0
                              ? "bg-amber-400/20 text-amber-400"
                              : i === 1
                              ? "bg-zinc-400/20 text-zinc-300"
                              : i === 2
                              ? "bg-orange-600/20 text-orange-400"
                              : "bg-zinc-800 text-zinc-500"
                          }`}
                        >
                          {i + 1}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {member.name ?? member.email}
                          </p>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {member.eventsAttended} event
                              {member.eventsAttended !== 1 ? "s" : ""}
                            </span>
                            {member.friendsReferred > 0 && (
                              <span className="flex items-center gap-1 text-nocturn">
                                <Share2 className="h-3 w-3" />
                                {member.friendsReferred} referred
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />$
                              {member.totalSpent.toFixed(0)}
                            </span>
                          </div>
                        </div>

                        {/* Segment badge */}
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            segmentConfig[
                              member.segment === "core"
                                ? "core50"
                                : member.segment === "ambassador"
                                ? "ambassadors"
                                : member.segment === "repeat"
                                ? "repeatFans"
                                : "firstTimers"
                            ].badgeColor
                          }`}
                        >
                          {member.segment === "core"
                            ? "Core"
                            : member.segment === "ambassador"
                            ? "Ambassador"
                            : member.segment === "repeat"
                            ? "Repeat"
                            : "New"}
                        </Badge>

                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform ${
                            expandedMember === member.email
                              ? "rotate-180"
                              : ""
                          }`}
                        />
                      </div>
                    </button>

                    {/* Expanded details */}
                    {expandedMember === member.email && (
                      <div className="mt-3 ml-10 space-y-3">
                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-md bg-zinc-900 p-2 text-center">
                            <p className="text-sm font-bold">
                              {member.eventsAttended}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Events
                            </p>
                          </div>
                          <div className="rounded-md bg-zinc-900 p-2 text-center">
                            <p className="text-sm font-bold text-nocturn">
                              {member.friendsReferred}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Referred
                            </p>
                          </div>
                          <div className="rounded-md bg-zinc-900 p-2 text-center">
                            <p className="text-sm font-bold text-green-400">
                              ${member.totalSpent.toFixed(0)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Spent
                            </p>
                          </div>
                        </div>

                        {/* Events attended */}
                        <div>
                          <p className="text-[11px] text-muted-foreground mb-1">
                            Events attended:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {member.eventNames.map((name) => (
                              <Badge
                                key={name}
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {name}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {/* Contact */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() =>
                              copyToClipboard(
                                member.email,
                                `email-${member.email}`
                              )
                            }
                          >
                            {copiedId === `email-${member.email}` ? (
                              <>
                                <Check className="h-3 w-3 mr-1 text-green-400" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Mail className="h-3 w-3 mr-1" />
                                Copy Email
                              </>
                            )}
                          </Button>
                          {relevantTemplates.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                const msg = getPersonalizedMessage(
                                  relevantTemplates[0],
                                  member
                                );
                                copyToClipboard(msg, `dm-${member.email}`);
                              }}
                            >
                              {copiedId === `dm-${member.email}` ? (
                                <>
                                  <Check className="h-3 w-3 mr-1 text-green-400" />
                                  Copied DM
                                </>
                              ) : (
                                <>
                                  <MessageSquare className="h-3 w-3 mr-1" />
                                  Copy DM
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 2: CRM
      ════════════════════════════════════════════════════════════════════════ */}
      <div
        ref={(el) => { sectionRefs.current.crm = el; }}
        className="scroll-mt-16 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-nocturn" />
          <h2 className="text-lg font-semibold">CRM</h2>
        </div>

        {/* CRM Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold">{crmStats.total}</p>
              <p className="text-[11px] text-muted-foreground">Total Contacts</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-amber-400">{crmStats.vips}</p>
              <p className="text-[11px] text-muted-foreground">VIPs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-green-400">{crmStats.repeatRate}%</p>
              <p className="text-[11px] text-muted-foreground">Repeat Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-nocturn">
                ${crmStats.avgLtv.toFixed(0)}
              </p>
              <p className="text-[11px] text-muted-foreground">Avg LTV</p>
            </CardContent>
          </Card>
        </div>

        {/* Search + Filter */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={crmSearch}
              onChange={(e) => setCrmSearch(e.target.value)}
              className="pl-9 pr-9 bg-card"
            />
            {crmSearch && (
              <button
                onClick={() => setCrmSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Segment filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {(
              [
                { key: "all", label: "All" },
                { key: "core", label: "Core" },
                { key: "ambassador", label: "Ambassadors" },
                { key: "repeat", label: "Repeat" },
                { key: "first_timer", label: "New" },
              ] as { key: AudienceMember["segment"] | "all"; label: string }[]
            ).map(({ key, label }) => {
              const count = crmSegmentCounts[key] ?? 0;
              const isActive = crmSegmentFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setCrmSegmentFilter(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                    isActive
                      ? "bg-nocturn/10 border-nocturn/40 text-nocturn"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-card/50"
                  }`}
                >
                  {label}
                  <span className={`text-[10px] ${isActive ? "text-nocturn" : "text-muted-foreground"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Contact Cards */}
        <Card>
          <CardContent className="p-0">
            {filteredCrmMembers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-nocturn/10">
                  <Users className="h-7 w-7 text-nocturn" />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {crmSearch || crmSegmentFilter !== "all"
                    ? "No contacts match your search."
                    : "No attendees yet. Sell tickets to build your CRM."}
                </p>
                {(crmSearch || crmSegmentFilter !== "all") && (
                  <button
                    onClick={() => { setCrmSearch(""); setCrmSegmentFilter("all"); }}
                    className="text-xs text-nocturn hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredCrmMembers.map((member) => {
                  const segmentLabel =
                    member.segment === "core"
                      ? "Core"
                      : member.segment === "ambassador"
                      ? "Ambassador"
                      : member.segment === "repeat"
                      ? "Repeat"
                      : "New";
                  const segmentColor =
                    member.segment === "core"
                      ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
                      : member.segment === "ambassador"
                      ? "bg-nocturn/10 text-nocturn border-nocturn/20"
                      : member.segment === "repeat"
                      ? "bg-green-400/10 text-green-400 border-green-400/20"
                      : "bg-blue-400/10 text-blue-400 border-blue-400/20";
                  const isVip = member.totalSpent >= 200 || member.eventsAttended >= 5;
                  const lastSeen = member.lastEventDate
                    ? new Date(member.lastEventDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : null;

                  return (
                    <div key={member.email} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium truncate">
                              {member.name ?? member.email}
                            </p>
                            {isVip && (
                              <Badge variant="outline" className="text-[10px] bg-amber-400/10 text-amber-400 border-amber-400/20">
                                VIP
                              </Badge>
                            )}
                            <Badge variant="outline" className={`text-[10px] ${segmentColor}`}>
                              {segmentLabel}
                            </Badge>
                          </div>
                          {member.name && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                              {member.email}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {member.eventsAttended} event{member.eventsAttended !== 1 ? "s" : ""}
                            </span>
                            <span className="flex items-center gap-1 text-green-400">
                              <DollarSign className="h-3 w-3" />
                              ${member.totalSpent.toFixed(0)} spent
                            </span>
                            {member.friendsReferred > 0 && (
                              <span className="flex items-center gap-1 text-nocturn">
                                <Share2 className="h-3 w-3" />
                                {member.friendsReferred} referred
                              </span>
                            )}
                            {lastSeen && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Last seen {lastSeen}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => copyToClipboard(member.email, `crm-email-${member.email}`)}
                          className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy email"
                        >
                          {copiedId === `crm-email-${member.email}` ? (
                            <Check className="h-3.5 w-3.5 text-green-400" />
                          ) : (
                            <Mail className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {filteredCrmMembers.length > 0 && (
          <p className="text-[11px] text-muted-foreground text-center">
            Showing {filteredCrmMembers.length} of {allCrmMembers.length} contacts
          </p>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 3: Insights
      ════════════════════════════════════════════════════════════════════════ */}
      <div
        ref={(el) => { sectionRefs.current.insights = el; }}
        className="scroll-mt-16 space-y-4"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-nocturn" />
          <h2 className="text-lg font-semibold">Insights</h2>
        </div>

        {/* Best Time to Post */}
        <Card className="border-nocturn/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-nocturn" />
              Best Time to Post
            </CardTitle>
          </CardHeader>
          <CardContent>
            {patterns ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-nocturn/10 p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Best Day
                    </p>
                    <p className="text-2xl font-bold text-nocturn">
                      {patterns.bestDayToPost}
                    </p>
                  </div>
                  <div className="rounded-lg bg-nocturn/10 p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Best Hour
                    </p>
                    <p className="text-2xl font-bold text-nocturn">
                      {formatHour(patterns.bestHourToPost)}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-card border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    Avg. Purchase Lead Time
                  </p>
                  <p className="text-lg font-semibold">
                    {patterns.avgDaysBeforeEvent} days before the event
                  </p>
                </div>

                {/* Day-of-week chart */}
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-2">
                    Sales by Day of Week
                  </p>
                  <div className="flex items-end gap-1 h-20">
                    {Object.entries(patterns.salesByDay).map(([day, count]) => {
                      const max = Math.max(
                        ...Object.values(patterns.salesByDay),
                        1
                      );
                      return (
                        <div
                          key={day}
                          className="flex-1 flex flex-col items-center gap-0.5"
                        >
                          <span className="text-[9px] text-muted-foreground">
                            {count}
                          </span>
                          <div
                            className={`w-full rounded-t transition-all ${
                              day === patterns.bestDayToPost
                                ? "bg-nocturn"
                                : "bg-nocturn/30"
                            }`}
                            style={{
                              height: `${Math.max((count / max) * 100, 4)}%`,
                            }}
                          />
                          <span className="text-[9px] text-muted-foreground">
                            {day.slice(0, 3)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center">
                <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {insightsError ??
                    "No sales data yet. Sell some tickets to unlock timing insights."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audience Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-nocturn" />
              Audience Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            {audienceInsights && audienceInsights.totalUniqueAttendees > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xl font-bold">
                      {audienceInsights.totalUniqueAttendees}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Unique Attendees
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <Repeat className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xl font-bold">
                      {audienceInsights.repeatRate}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Repeat Rate
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <DollarSign className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xl font-bold">
                      ${audienceInsights.avgTicketPrice.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Avg Ticket
                    </p>
                  </div>
                </div>

                {/* Top Cities */}
                {audienceInsights.topCities.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Top Cities
                    </p>
                    <div className="space-y-1.5">
                      {audienceInsights.topCities.map((c, i) => (
                        <div
                          key={c.city}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-muted-foreground">
                            {i + 1}. {c.city}
                          </span>
                          <span className="font-medium">{c.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Growth Trend */}
                {audienceInsights.growthTrend.length > 1 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Attendees per Event
                    </p>
                    <div className="flex items-end gap-1 h-16">
                      {audienceInsights.growthTrend.map((point) => {
                        const max = Math.max(
                          ...audienceInsights.growthTrend.map(
                            (p) => p.attendees
                          ),
                          1
                        );
                        return (
                          <div
                            key={point.date}
                            className="flex-1 flex flex-col items-center gap-0.5"
                          >
                            <span className="text-[9px] text-muted-foreground">
                              {point.attendees}
                            </span>
                            <div
                              className="w-full rounded-t bg-nocturn/60 transition-all"
                              style={{
                                height: `${Math.max(
                                  (point.attendees / max) * 100,
                                  4
                                )}%`,
                              }}
                            />
                            <span
                              className="text-[8px] text-muted-foreground truncate max-w-full"
                              title={point.eventTitle}
                            >
                              {new Date(point.date).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric" }
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No audience data yet. Your insights will appear after your
                  first ticket sales.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 3: Venues
      ════════════════════════════════════════════════════════════════════════ */}
      <div
        ref={(el) => { sectionRefs.current.venues = el; }}
        className="scroll-mt-16 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-nocturn" />
            <h2 className="text-lg font-semibold">Venues</h2>
          </div>
          <Link
            href="/dashboard/venues"
            className="flex items-center gap-1 text-xs text-nocturn hover:underline"
          >
            View all <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {venues.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {venues.map((v) => (
              <Link key={v.id} href="/dashboard/venues">
                <Card className="hover:border-nocturn/40 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium truncate">{v.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      {v.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {v.city}
                        </span>
                      )}
                      {v.capacity && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {v.capacity}
                        </span>
                      )}
                    </div>
                    {v.venue_type && (
                      <Badge
                        variant="secondary"
                        className="mt-2 text-[10px]"
                      >
                        {v.venue_type}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No saved venues yet.{" "}
                <Link
                  href="/dashboard/venues"
                  className="text-nocturn hover:underline"
                >
                  Discover venues
                </Link>
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 4: Artists
      ════════════════════════════════════════════════════════════════════════ */}
      <div
        ref={(el) => { sectionRefs.current.artists = el; }}
        className="scroll-mt-16 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="h-5 w-5 text-nocturn" />
            <h2 className="text-lg font-semibold">Artists</h2>
          </div>
          <Link
            href="/dashboard/artists"
            className="flex items-center gap-1 text-xs text-nocturn hover:underline"
          >
            View all <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {artists.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {artists.map((a) => (
              <Link key={a.id} href={`/dashboard/artists/${a.slug}`}>
                <Card className="hover:border-nocturn/40 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium truncate">{a.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      {a.metadata?.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {a.metadata.location}
                        </span>
                      )}
                    </div>
                    {a.genre.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {a.genre.slice(0, 2).map((g) => (
                          <Badge
                            key={g}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {g}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <Music className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No artists added yet.{" "}
                <Link
                  href="/dashboard/artists"
                  className="text-nocturn hover:underline"
                >
                  Browse artists
                </Link>
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 5: Calendar
      ════════════════════════════════════════════════════════════════════════ */}
      <div
        ref={(el) => { sectionRefs.current.calendar = el; }}
        className="scroll-mt-16 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-nocturn" />
            <h2 className="text-lg font-semibold">Calendar</h2>
          </div>
          <Link
            href="/dashboard/calendar"
            className="flex items-center gap-1 text-xs text-nocturn hover:underline"
          >
            Full view <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
            <span className="text-muted-foreground">Great</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-yellow-500/70" />
            <span className="text-muted-foreground">Okay</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-500/50" />
            <span className="text-muted-foreground">Avoid</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-nocturn" />
            <span className="text-muted-foreground">Your event</span>
          </div>
        </div>

        {/* Month label */}
        <p className="text-sm font-medium text-muted-foreground">
          {new Date().toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </p>

        {/* Mini calendar grid */}
        <Card>
          <CardContent className="p-2 sm:p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div
                  key={`${d}-${i}`}
                  className="text-center text-[10px] font-medium text-muted-foreground py-1"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map(({ date, inMonth }, i) => {
                const dateKey = date.toISOString().slice(0, 10);
                const evtCount = calEventMap[dateKey] ?? 0;
                const isPast = date < new Date(new Date().toDateString());
                const isToday =
                  dateKey === new Date().toISOString().slice(0, 10);
                const isYourEvent = calendarEvents.some(
                  (e) =>
                    e.starts_at.slice(0, 10) === dateKey &&
                    yourCollectiveIds.includes(e.collective_id)
                );

                const { color } = getDayScore(date, evtCount, isYourEvent);

                return (
                  <div
                    key={i}
                    className={`
                      relative aspect-square rounded flex items-center justify-center text-[11px]
                      ${!inMonth ? "opacity-15" : ""}
                      ${isPast && inMonth ? "opacity-35" : ""}
                      ${isToday ? "ring-1 ring-nocturn/60" : ""}
                    `}
                  >
                    {/* Heat background */}
                    {inMonth && !isPast && (
                      <div
                        className={`absolute inset-0 rounded ${color} opacity-25`}
                      />
                    )}
                    <span
                      className={`relative z-10 font-medium ${
                        isToday ? "text-nocturn" : ""
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {/* Event dot */}
                    {evtCount > 0 && inMonth && (
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 z-10">
                        <div
                          className={`w-1 h-1 rounded-full ${
                            isYourEvent ? "bg-nocturn" : "bg-white/50"
                          }`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
