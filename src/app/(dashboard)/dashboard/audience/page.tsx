"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ContactList } from "@/components/people/contact-list";
import { ImportSheet } from "@/components/people/import-sheet";
import { ContactDetailSheet } from "@/components/people/contact-detail-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Upload,
  MessageSquare,
  ChevronDown,
  Calendar,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReachInsight } from "@/app/actions/contacts";

interface EventOption {
  id: string;
  title: string;
  starts_at: string;
}

export default function AudiencePage() {
  const [collectiveId, setCollectiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );
  const [refreshKey, setRefreshKey] = useState(0);

  // Per-event filter
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventAttendeeEmails, setEventAttendeeEmails] = useState<Set<string>>(new Set());
  const [loadingEventEmails, setLoadingEventEmails] = useState(false);

  // Reach insights
  const [reachInsight, setReachInsight] = useState<string | null>(null);
  const [reachInsights, setReachInsights] = useState<ReachInsight[]>([]);
  const [insightsExpanded, setInsightsExpanded] = useState(true);
  const [copiedInsight, setCopiedInsight] = useState<string | null>(null);

  // Fetch user's active collective + events + insights
  useEffect(() => {
    async function fetchCollective() {
      const supabase = createClient();
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

      const id =
        (
          memberships as { collective_id: string }[] | null
        )?.[0]?.collective_id ?? null;
      setCollectiveId(id);

      if (id) {
        // Fetch events for per-event filter dropdown
        const { data: eventsRaw } = await supabase
          .from("events")
          .select("id, title, starts_at")
          .eq("collective_id", id)
          .order("starts_at", { ascending: false })
          .limit(50);
        setEvents((eventsRaw ?? []) as EventOption[]);

        // Compute Reach insight headline + full insights panel
        const { getContacts, generateReachInsights } = await import("@/app/actions/contacts");

        let contactResult, insightsResult;
        try {
          [contactResult, insightsResult] = await Promise.all([
            getContacts(id, { contactType: "fan" }),
            generateReachInsights(id),
          ]);
        } catch (err) {
          console.error("[AudiencePage] Failed to fetch insights:", err);
          setLoading(false);
          return;
        }

        if (!contactResult.error && contactResult.aggregateStats) {
          const { newThisMonth, repeatRate } = contactResult.aggregateStats;
          const core50 = contactResult.segmentCounts?.core50 ?? 0;
          if (core50 > 0) {
            setReachInsight(`${core50} fan${core50 !== 1 ? "s" : ""} have been to every event — your core crew`);
          } else if (newThisMonth > 0) {
            setReachInsight(`${newThisMonth} new fan${newThisMonth !== 1 ? "s" : ""} added this month`);
          } else if (repeatRate > 0) {
            setReachInsight(`${repeatRate.toFixed(0)}% of your fans are repeat attendees`);
          }
        }

        if (insightsResult && !insightsResult.error && insightsResult.insights.length > 0) {
          setReachInsights(insightsResult.insights);
        }
      }

      setLoading(false);
    }
    fetchCollective();
  }, []);

  // When an event is selected, fetch its attendee emails via server action
  useEffect(() => {
    if (!selectedEventId) {
      setEventAttendeeEmails(new Set());
      return;
    }
    setLoadingEventEmails(true);

    (async () => {
      const { getEventFanEmails } = await import("@/app/actions/contacts");
      const result = await getEventFanEmails(selectedEventId);
      if (!result.error) {
        setEventAttendeeEmails(new Set(result.emails));
      }
      setLoadingEventEmails(false);
    })();
  }, [selectedEventId]);

  const handleImportComplete = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Handle insight actions
  async function handleInsightAction(insight: ReachInsight) {
    if (!collectiveId) return;

    if (insight.actionType === "copy_handles" || insight.actionType === "copy_emails") {
      const { getContacts } = await import("@/app/actions/contacts");
      const result = await getContacts(collectiveId, { contactType: "fan" });
      if (result.error) return;

      let textToCopy = "";
      if (insight.actionType === "copy_handles") {
        // IG handles removed — fall through to email copy
        textToCopy = "";
      } else if (insight.actionType === "copy_emails") {
        const fans = result.contacts.filter((c) => c.email);
        if (insight.id === "core_crew") {
          const { count: eventCount } = await (await import("@/lib/supabase/client")).createClient()
            .from("events")
            .select("*", { count: "exact", head: true })
            .eq("collective_id", collectiveId);
          textToCopy = fans
            .filter((c) => c.totalEvents >= (eventCount ?? 0))
            .map((c) => c.email!)
            .join("\n");
        } else if (insight.id === "dormant_fans") {
          const sixtyDaysAgo = new Date();
          sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
          textToCopy = fans
            .filter((c) => c.lastSeenAt && new Date(c.lastSeenAt) < sixtyDaysAgo)
            .map((c) => c.email!)
            .join("\n");
        } else {
          textToCopy = fans.map((c) => c.email!).join("\n");
        }
      }

      if (textToCopy) {
        await navigator.clipboard.writeText(textToCopy);
        setCopiedInsight(insight.id);
        setTimeout(() => setCopiedInsight(null), 2000);
      }
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6 pb-24 max-w-6xl mx-auto animate-in fade-in duration-300">
        <div className="h-7 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="h-11 w-full rounded-xl bg-muted animate-pulse md:max-w-md" />
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
              <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // No collective
  if (!collectiveId) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
          <Users className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center max-w-xs">
          <p className="font-semibold">No collective yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Join or create a collective to see your audience insights.
          </p>
        </div>
      </div>
    );
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="space-y-6 pb-24 overflow-x-hidden max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            Your Fans
          </h1>
          {reachInsight ? (
            <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-nocturn shrink-0" />
              {reachInsight}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Manage and grow your audience
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href="/dashboard/marketing">
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px] gap-1.5"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">DM Templates</span>
            </Button>
          </Link>
          <Button
            size="sm"
            className="min-h-[44px] gap-1.5 bg-nocturn hover:bg-nocturn-light text-white"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </Button>
        </div>
      </div>

      {/* ── Reach Agent Insights Panel ──────────────────────────────
          Redesigned to a denser 2-col grid (1-col on mobile) with each
          insight as a compact card: emoji chip left, 2-line title/body,
          inline action link at the bottom. The old layout stacked 5
          full-width cards which made the screen feel longer than it
          needed to. */}
      {reachInsights.length > 0 && (
        <div className="rounded-2xl border border-nocturn/20 bg-gradient-to-br from-nocturn/[0.04] via-transparent to-transparent p-3">
          <button
            onClick={() => setInsightsExpanded(!insightsExpanded)}
            className="flex items-center gap-2 w-full text-left min-h-[32px] px-1"
          >
            <Sparkles className="h-4 w-4 text-nocturn shrink-0" />
            <h2 className="text-sm font-bold flex-1">Reach Insights</h2>
            <span className="text-[11px] text-muted-foreground bg-nocturn/10 rounded-full px-2 py-0.5">
              {reachInsights.length} action{reachInsights.length !== 1 ? "s" : ""}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                insightsExpanded ? "rotate-0" : "-rotate-90"
              }`}
            />
          </button>

          {insightsExpanded && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {reachInsights.map((insight) => {
                const isCopy = insight.actionType !== "navigate";
                const justCopied = copiedInsight === insight.id;
                const ActionWrapper: React.ComponentType<{ children: React.ReactNode }> = isCopy
                  ? ({ children }) => (
                      <button
                        type="button"
                        onClick={() => handleInsightAction(insight)}
                        className="group/card w-full text-left"
                      >
                        {children}
                      </button>
                    )
                  : ({ children }) => (
                      <Link href={insight.actionTarget ?? "#"} className="group/card block">
                        {children}
                      </Link>
                    );

                return (
                  <ActionWrapper key={insight.id}>
                    <div className="h-full flex flex-col rounded-xl border border-white/5 bg-zinc-900/40 hover:border-nocturn/30 hover:bg-zinc-900/60 transition-all duration-200 p-3 gap-2">
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 h-8 w-8 rounded-lg bg-nocturn/10 border border-nocturn/15 grid place-items-center text-base leading-none">
                          {insight.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-foreground leading-tight">
                            {insight.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-snug line-clamp-3">
                            {insight.description}
                          </p>
                        </div>
                      </div>
                      {insight.action && (
                        <div className="mt-auto flex items-center gap-1 text-[11px] font-medium text-nocturn group-hover/card:text-nocturn-light transition-colors">
                          {isCopy ? (
                            justCopied ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>{insight.action}</span>
                              </>
                            )
                          ) : (
                            <>
                              <span>{insight.action}</span>
                              <ExternalLink className="h-3 w-3" />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </ActionWrapper>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Per-event filter */}
      {events.length > 0 && (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="relative flex-1 max-w-xs">
            <select
              value={selectedEventId ?? ""}
              onChange={(e) => setSelectedEventId(e.target.value || null)}
              className="w-full appearance-none rounded-lg border bg-background px-3 py-2 pr-8 text-base md:text-sm min-h-[44px] text-foreground transition-colors focus:border-nocturn/40 focus:outline-none"
            >
              <option value="">All Events</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} — {new Date(e.starts_at).toLocaleDateString("en", { month: "short", day: "numeric" })}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
          {selectedEvent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedEventId(null)}
              className="h-8 px-2 text-xs text-muted-foreground"
            >
              Clear
            </Button>
          )}
          {loadingEventEmails && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
          )}
          {selectedEventId && !loadingEventEmails && (
            <span className="text-xs text-muted-foreground">
              {eventAttendeeEmails.size} attendee{eventAttendeeEmails.size !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Contact list */}
      <ContactList
        key={refreshKey}
        collectiveId={collectiveId}
        contactType="fan"
        onContactClick={(id) => setSelectedContactId(id)}
        onImportClick={() => setImportOpen(true)}
        eventFilter={selectedEventId}
        eventAttendeeEmails={selectedEventId ? eventAttendeeEmails : undefined}
      />

      {/* Import sheet */}
      <ImportSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        collectiveId={collectiveId}
        contactType="fan"
        onImportComplete={handleImportComplete}
      />

      {/* Contact detail sheet */}
      <ContactDetailSheet
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
        collectiveId={collectiveId}
        onContactUpdated={handleImportComplete}
      />
    </div>
  );
}
