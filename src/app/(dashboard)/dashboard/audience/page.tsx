"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ContactList } from "@/components/people/contact-list";
import { ImportSheet } from "@/components/people/import-sheet";
import { ContactDetailSheet } from "@/components/people/contact-detail-sheet";
import { Button } from "@/components/ui/button";
import { Upload, MessageSquare, ChevronDown, Calendar, Sparkles } from "lucide-react";
import Link from "next/link";

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

  // Reach insight
  const [reachInsight, setReachInsight] = useState<string | null>(null);

  // Fetch user's active collective + events
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

      // Fetch events for per-event filter dropdown + compute Reach insight
      if (id) {
        const { data: eventsRaw } = await supabase
          .from("events")
          .select("id, title, starts_at")
          .eq("collective_id", id)
          .is("deleted_at", null)
          .order("starts_at", { ascending: false })
          .limit(50);
        setEvents((eventsRaw ?? []) as EventOption[]);

        // Compute Reach insight from contacts
        const { getContacts } = await import("@/app/actions/contacts");
        const result = await getContacts(id, { contactType: "fan" });
        if (!result.error && result.aggregateStats) {
          const { newThisMonth, repeatRate } = result.aggregateStats;
          const core50 = result.segmentCounts.core50 ?? 0;
          if (core50 > 0) {
            setReachInsight(`${core50} fan${core50 !== 1 ? "s" : ""} have been to every event — your core crew`);
          } else if (newThisMonth > 0) {
            setReachInsight(`${newThisMonth} new fan${newThisMonth !== 1 ? "s" : ""} added this month`);
          } else if (repeatRate > 0) {
            setReachInsight(`${repeatRate.toFixed(0)}% of your fans are repeat attendees`);
          }
        }
      }

      setLoading(false);
    }
    fetchCollective();
  }, []);

  // When an event is selected, fetch its attendee emails
  useEffect(() => {
    if (!selectedEventId) {
      setEventAttendeeEmails(new Set());
      return;
    }
    setLoadingEventEmails(true);
    const supabase = createClient();

    (async () => {
      // Fetch ticket buyer emails for this event
      const { data: tickets } = await supabase
        .from("tickets")
        .select("metadata")
        .eq("event_id", selectedEventId)
        .in("status", ["paid", "checked_in"]);

      const emails = new Set<string>();
      for (const t of (tickets ?? []) as { metadata: Record<string, unknown> | null }[]) {
        const email =
          (t.metadata?.customer_email as string) ||
          (t.metadata?.buyer_email as string);
        if (email) emails.add(email.toLowerCase().trim());
      }
      setEventAttendeeEmails(emails);
      setLoadingEventEmails(false);
    })();
  }, [selectedEventId]);

  const handleImportComplete = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

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
