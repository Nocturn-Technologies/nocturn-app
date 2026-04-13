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
  ChevronRight,
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
          .is("deleted_at", null)
          .order("starts_at", { ascending: false })
          .limit(50);
        setEvents((eventsRaw ?? []) as EventOption[]);

        // Compute Reach insight headline + full insights panel
        const { getContacts, generateReachInsights } = await import("@/app/actions/contacts");

        const [contactResult, insightsResult] = await Promise.all([
          getContacts(id, { contactType: "fan" }),
          generateReachInsights(id),
        ]);

        if (!contactResult.error && contactResult.aggregateStats) {
          const { newThisMonth, repeatRate } = contactResult.aggregateStats;
          const core50 = contactResult.segmentCounts.core50 ?? 0;
          if (core50 > 0) {
            setReachInsight(`${core50} fan${core50 !== 1 ? "s" : ""} have been to every event — your core crew`);
          } else if (newThisMonth > 0) {
            setReachInsight(`${newThisMonth} new fan${newThisMonth !== 1 ? "s" : ""} added this month`);
          } else if (repeatRate > 0) {
            setReachInsight(`${repeatRate.toFixed(0)}% of your fans are repeat attendees`);
          }
        }

        if (!insightsResult.error && insightsResult.insights.length > 0) {
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
        // Copy IG handles for the relevant segment
        const fans = result.contacts.filter((c) => c.instagram);
        if (insight.id === "ambassador_candidates" || insight.id === "potential_ambassadors") {
          textToCopy = fans
            .filter((c) => c.totalEvents >= 2)
            .map((c) => `@${c.instagram!.replace(/^@/, "")}`)
            .join("\n");
        } else {
          textToCopy = fans
            .map((c) => `@${c.instagram!.replace(/^@/, "")}`)
            .join("\n");
        }
      } else if (insight.actionType === "copy_emails") {
        const fans = result.contacts.filter((c) => c.email);
        if (insight.id === "core_crew") {
          const { count: eventCount } = await (await import("@/lib/supabase/client")).createClient()
            .from("events")
            .select("*", { count: "exact", head: true })
            .eq("collective_id", collectiveId)
            .is("deleted_at", null);
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
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
          <p className="text-xs text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // No collective
  if (!collectiveId) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">
          No collective found. Join or create one to manage your fans.
        </p>
      </div>
    );
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="space-y-6 pb-24 overflow-x-hidden">
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

      {/* ── Reach Agent Insights Panel ──────────────────────────── */}
      {reachInsights.length > 0 && (
        <Card className="border-l-4 border-l-nocturn bg-card">
          <CardContent className="p-4">
            <button
              onClick={() => setInsightsExpanded(!insightsExpanded)}
              className="flex items-center gap-2 w-full text-left min-h-[36px]"
            >
              <Sparkles className="h-4 w-4 text-nocturn shrink-0" />
              <h2 className="text-sm font-bold flex-1">Reach Insights</h2>
              <span className="text-[11px] text-muted-foreground mr-1">
                {reachInsights.length} action{reachInsights.length !== 1 ? "s" : ""}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                  insightsExpanded ? "rotate-0" : "-rotate-90"
                }`}
              />
            </button>

            {insightsExpanded && (
              <div className="mt-3 space-y-3">
                {reachInsights.map((insight) => (
                  <div
                    key={insight.id}
                    className="rounded-lg bg-muted/30 p-3 space-y-2"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base shrink-0 mt-0.5">{insight.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {insight.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {insight.description}
                        </p>
                      </div>
                    </div>
                    {insight.action && (
                      <div className="pl-7">
                        {insight.actionType === "navigate" ? (
                          <Link href={insight.actionTarget ?? "#"}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-nocturn hover:text-nocturn-light gap-1"
                            >
                              {insight.action}
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-nocturn hover:text-nocturn-light gap-1"
                            onClick={() => handleInsightAction(insight)}
                          >
                            {copiedInsight === insight.id ? (
                              <>
                                <Check className="h-3 w-3 text-green-400" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                {insight.action}
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
