"use client";

import { useState, useEffect } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

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

export default function AudiencePage() {
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
  const [loading, setLoading] = useState(true);
  const [dmTemplates, setDmTemplates] = useState<DMTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const result = await getAudienceSegments();
    if (!result.error) {
      setSegments(result.segments);
      setOverview(result.overview);
    }

    // Load DM templates
    const templateResult = await generateDMTemplates("", {});
    if (!templateResult.error) {
      setDmTemplates(templateResult.templates);
    }

    setLoading(false);
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function getPersonalizedMessage(template: DMTemplate, member: AudienceMember): string {
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

  const activeSegment = segments[activeTab];
  const config = segmentConfig[activeTab];

  // Filter DM templates by segment
  const targetMap: Record<SegmentKey, DMTemplate["target"]> = {
    core50: "repeat_fan",
    ambassadors: "ambassador",
    repeatFans: "repeat_fan",
    firstTimers: "first_timer",
  };
  const relevantTemplates = dmTemplates.filter(
    (t) => t.target === targetMap[activeTab]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Reach</h1>
        <p className="text-sm text-muted-foreground">
          Grow your audience — segment, reward, discover, and re-engage
        </p>
      </div>

      {/* Quick links to sub-sections */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <a href="/dashboard/audience" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-card border border-border shadow-sm whitespace-nowrap">
          <UsersRound className="h-3.5 w-3.5 text-nocturn" />
          Audience
        </a>
        <a href="/dashboard/promo-insights" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-card/50 whitespace-nowrap">
          <TrendingUp className="h-3.5 w-3.5" />
          Insights
        </a>
        <a href="/dashboard/venues" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-card/50 whitespace-nowrap">
          <MapPin className="h-3.5 w-3.5" />
          Venues
        </a>
        <a href="/dashboard/artists" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-card/50 whitespace-nowrap">
          <Music className="h-3.5 w-3.5" />
          Artists
        </a>
        <a href="/dashboard/calendar" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-card/50 whitespace-nowrap">
          <CalendarRange className="h-3.5 w-3.5" />
          Calendar
        </a>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold">{overview.totalUniqueAttendees}</p>
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
            <p className="text-xl font-bold">{overview.avgEventsPerPerson}</p>
            <p className="text-[11px] text-muted-foreground">Avg Events/Person</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-nocturn">{overview.totalReferrals}</p>
            <p className="text-[11px] text-muted-foreground">Referrals</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-green-400">
              ${overview.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-muted-foreground">Total Revenue</p>
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
              <Icon className={`h-3.5 w-3.5 ${isActive ? conf.color : ""}`} />
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

      {/* Active Segment */}
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
          <p className="text-xs text-muted-foreground">{config.description}</p>
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
                      <p className="text-xs font-medium">{template.subject}</p>
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
                <p className="font-medium">No {config.label.toLowerCase()} yet</p>
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
                            {member.eventsAttended} event{member.eventsAttended !== 1 ? "s" : ""}
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
                          expandedMember === member.email ? "rotate-180" : ""
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
                            copyToClipboard(member.email, `email-${member.email}`)
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
                              copyToClipboard(
                                msg,
                                `dm-${member.email}`
                              );
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
  );
}
