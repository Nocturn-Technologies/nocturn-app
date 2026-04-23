"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Instagram,
  User,
  Users,
  Clock,
  Mail,
  Phone,
  DollarSign,
  TrendingUp,
  Repeat2,
  Download,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";


// ── Types ────────────────────────────────────────────────────────────────────

export interface PeopleContact {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  instagram?: string | null;
  soundcloud_url?: string | null;
  spotify_url?: string | null;
  avatar_url?: string | null;
  contact_type: "industry" | "fan";
  role?: string | null;
  tags: string[];
  notes?: string | null;
  source?: string | null;
  follow_up_at?: string | null;
  total_events?: number;
  total_spend?: number;
  segment?: string | null;
  profile_id?: string | null;
  created_at: string;
  last_seen_at?: string | null;
}

export interface PeopleStats {
  total: number;
  repeat?: number;
  ambassadors?: number;
  booked?: number;
  saved?: number;
}

interface ContactListProps {
  collectiveId: string;
  contactType: "industry" | "fan";
  onContactClick?: (contactId: string) => void;
  onImportClick?: () => void;
  /** Event ID to filter contacts by (only show fans who have tickets for this event) */
  eventFilter?: string | null;
  /** Emails of attendees for the selected event (used with eventFilter) */
  eventAttendeeEmails?: Set<string>;
  /** Demo-mode override — when set, skips server fetch and renders these values. */
  demoContacts?: PeopleContact[];
  demoAggStats?: { totalRevenue: number; avgSpend: number; repeatRate: number; newThisMonth: number };
  demoSegmentCounts?: Record<string, number>;
}

// ── Sort types ──────────────────────────────────────────────────────────────

type SortBy = "name" | "events" | "spent" | "recent" | "newest";
type SortDirection = "asc" | "desc";

// ── Constants ────────────────────────────────────────────────────────────────

const PER_PAGE = 25;

const FAN_FILTERS: { label: string; value: string; icon: string; hint: string }[] = [
  { label: "All Fans", value: "all", icon: "👥", hint: "Everyone in your audience" },
  { label: "Regulars", value: "repeat", icon: "🔁", hint: "Came back 2+ times" },
  { label: "New Faces", value: "new", icon: "✨", hint: "First-timers to convert" },
  { label: "Core Crew", value: "core50", icon: "💎", hint: "Your day-ones" },
  { label: "Ambassadors", value: "ambassadors", icon: "🚀", hint: "Your street team" },
  { label: "Has IG", value: "has_ig", icon: "📱", hint: "Reachable on Instagram" },
  { label: "Dormant", value: "dormant", icon: "😴", hint: "60+ days since last event" },
  { label: "VIP", value: "vip", icon: "⭐", hint: "Tagged VIP" },
];

const INDUSTRY_ROLE_LABELS: Record<string, string> = {
  artist: "DJs",
  venue: "Venues",
  photographer: "Photo",
  videographer: "Video",
  promoter: "Promoters",
  sound_production: "Sound",
  lighting_production: "Lighting",
  sponsor: "Sponsors",
  booking_agent: "Booking",
  graphic_designer: "Design",
  mc_host: "MCs",
  event_staff: "Staff",
};

const SEGMENT_BADGE_STYLES: Record<string, string> = {
  core50: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  ambassadors: "bg-nocturn/10 text-nocturn border-nocturn/20",
  repeat: "bg-green-400/10 text-green-400 border-green-400/20",
  new: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  vip: "bg-rose-400/10 text-rose-400 border-rose-400/20",
  dormant: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20",
  has_ig: "bg-pink-400/10 text-pink-400 border-pink-400/20",
};

const ROLE_BADGE_STYLES: Record<string, string> = {
  artist: "bg-[#7B2FF7]/15 text-[#9D5CFF] border-[#7B2FF7]/25",
  venue: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  photographer: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  videographer: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  promoter: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const SOURCE_LABELS: Record<string, string> = {
  ticket: "ticket",
  import: "import",
  marketplace: "marketplace",
  manual: "manual",
  referral: "referral",
};

const MOBILE_SORT_OPTIONS: { label: string; value: SortBy }[] = [
  { label: "Recent", value: "recent" },
  { label: "Most Events", value: "events" },
  { label: "Top Spenders", value: "spent" },
  { label: "Newest", value: "newest" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  // Fallback to "Mar 15" format
  return date.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function formatCurrency(amount: number): string {
  if (amount >= 10000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  return `$${amount.toFixed(0)}`;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ContactList({
  collectiveId,
  contactType,
  onContactClick,
  onImportClick,
  eventFilter,
  eventAttendeeEmails,
  demoContacts,
  demoAggStats,
  demoSegmentCounts,
}: ContactListProps) {
  const [contacts, setContacts] = useState<PeopleContact[]>([]);
  const [stats, setStats] = useState<PeopleStats>({ total: 0 });
  const [aggStats, setAggStats] = useState<{ totalRevenue: number; avgSpend: number; repeatRate: number; newThisMonth: number }>({
    totalRevenue: 0, avgSpend: 0, repeatRate: 0, newThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [copied, setCopied] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on filter/search change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilter, sortBy, sortDirection]);

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { getContacts } = await import("@/app/actions/contacts");
      const result = await getContacts(collectiveId, { contactType });
      if (result.error) {
        setError(result.error);
      } else {
        setContacts((result.contacts ?? []).map((c): PeopleContact => ({
          id: c.id,
          email: c.email ?? "",
          name: c.fullName,
          phone: c.phone,
          instagram: undefined,
          soundcloud_url: (c.metadata as Record<string, unknown>)?.soundcloud_url as string | undefined,
          spotify_url: (c.metadata as Record<string, unknown>)?.spotify_url as string | undefined,
          avatar_url: (c.metadata as Record<string, unknown>)?.avatar_url as string | undefined,
          contact_type: c.contactType,
          role: c.role,
          tags: c.tags ?? [],
          notes: c.notes,
          source: c.source,
          follow_up_at: c.followUpAt,
          total_events: c.totalEvents,
          total_spend: c.totalSpend,
          segment: (c.metadata as Record<string, unknown>)?.segment as string | undefined,
          profile_id: c.marketplaceProfileId,
          created_at: c.createdAt,
          last_seen_at: c.lastSeenAt,
        })));
        setStats({ total: result.totalCount ?? 0, ...result.segmentCounts });
        if (result.aggregateStats) setAggStats(result.aggregateStats);
      }
    } catch {
      setError("Failed to load contacts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [collectiveId, contactType]);

  useEffect(() => {
    // Demo-mode short-circuit — skip server fetch entirely.
    if (demoContacts) {
      setContacts(demoContacts);
      setStats({ total: demoContacts.length, ...(demoSegmentCounts ?? {}) });
      if (demoAggStats) setAggStats(demoAggStats);
      setLoading(false);
      return;
    }
    fetchContacts();
    // Fire-and-forget: sync contact metrics from ticket data (rate-limited to 1x/hour)
    if (contactType === "fan") {
      import("@/app/actions/contacts").then(({ syncContactMetrics }) => {
        syncContactMetrics(collectiveId).then((result) => {
          // If metrics were synced, refetch contacts to show updated spend/events
          if (result.synced > 0) fetchContacts();
        });
      });
    }
  }, [fetchContacts, collectiveId, contactType, demoContacts, demoAggStats, demoSegmentCounts]);

  // ── Export + Copy handlers ──

  function handleExportCSV() {
    // CSV-safe escaping to prevent formula injection
    function csvSafe(field: string): string {
      let safe = field;
      if (/^[=+\-@\t\r]/.test(safe)) safe = `'${safe}`;
      return `"${safe.replace(/"/g, '""')}"`;
    }

    const headers = [
      "Name", "Email", "Phone", "Instagram", "Events", "Spent",
      "Segment", "Last Seen", "Tags", "Source",
    ];

    const rows = sorted.map((c) => [
      csvSafe(c.name ?? ""),
      csvSafe(c.email),
      csvSafe(c.phone ?? ""),
      csvSafe(c.instagram ? `@${c.instagram.replace(/^@/, "")}` : ""),
      csvSafe(String(c.total_events ?? 0)),
      csvSafe(`$${(c.total_spend ?? 0).toFixed(2)}`),
      csvSafe(c.segment ?? ""),
      csvSafe(c.last_seen_at ? new Date(c.last_seen_at).toLocaleDateString("en-US") : ""),
      csvSafe(c.tags.join(", ")),
      csvSafe(c.source ?? ""),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nocturn-fans-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyHandles() {
    const handles = sorted
      .filter((c) => c.instagram)
      .map((c) => `@${c.instagram!.replace(/^@/, "")}`)
      .join("\n");

    if (!handles) return;
    navigator.clipboard.writeText(handles).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Stat cards — use server-computed aggregate stats (across ALL fans, not just current page) ──
  const summaryStats = useMemo(() => ({
    totalFans: stats.total,
    totalRevenue: aggStats.totalRevenue,
    avgSpend: aggStats.avgSpend,
    repeatRate: aggStats.repeatRate,
  }), [stats.total, aggStats]);

  // Build dynamic filter chips for industry (only roles that have contacts)
  const industryFilters = useMemo(() => {
    if (contactType !== "industry") return [];
    const roleCounts = new Map<string, number>();
    for (const c of contacts) {
      if (c.role) {
        roleCounts.set(c.role, (roleCounts.get(c.role) ?? 0) + 1);
      }
    }
    const chips: { label: string; value: string; icon: string; hint: string }[] = [
      { label: "All", value: "all", icon: "👥", hint: "All industry contacts" },
    ];
    for (const [role, count] of roleCounts) {
      if (count > 0 && INDUSTRY_ROLE_LABELS[role]) {
        chips.push({ label: INDUSTRY_ROLE_LABELS[role], value: role, icon: "🎵", hint: `${count} ${INDUSTRY_ROLE_LABELS[role].toLowerCase()}` });
      }
    }
    // Also collect custom tags used by multiple contacts
    const tagCounts = new Map<string, number>();
    for (const c of contacts) {
      for (const tag of c.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    for (const [tag, count] of tagCounts) {
      if (count >= 2 && !chips.some((ch) => ch.value === tag)) {
        chips.push({ label: tag, value: `tag:${tag}`, icon: "🏷️", hint: `Tagged "${tag}"` });
      }
    }
    return chips;
  }, [contacts, contactType]);

  // Fan filters with custom tags
  const fanFilters = useMemo(() => {
    if (contactType !== "fan") return [];
    const base = [...FAN_FILTERS];
    const tagCounts = new Map<string, number>();
    for (const c of contacts) {
      for (const tag of c.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    for (const [tag, count] of tagCounts) {
      if (count >= 2 && !base.some((f) => f.value === tag)) {
        base.push({ label: tag, value: `tag:${tag}`, icon: "🏷️", hint: `Tagged "${tag}"` });
      }
    }
    return base;
  }, [contacts, contactType]);

  const filters = contactType === "fan" ? fanFilters : industryFilters;

  // Compute segment counts for agentic badges
  const segmentCounts = useMemo(() => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Apply event filter first if active
    const base = eventFilter && eventAttendeeEmails
      ? contacts.filter((c) => c.email && eventAttendeeEmails.has(c.email.toLowerCase()))
      : contacts;

    return {
      all: base.length,
      repeat: base.filter((c) => (c.total_events ?? 0) >= 2).length,
      new: base.filter((c) => (c.total_events ?? 0) <= 1).length,
      core50: base.filter((c) => c.segment === "core50").length,
      ambassadors: base.filter((c) => c.segment === "ambassadors").length,
      has_ig: base.filter((c) => !!c.instagram).length,
      dormant: base.filter((c) => c.last_seen_at && new Date(c.last_seen_at) < sixtyDaysAgo && (c.total_events ?? 0) >= 1).length,
      vip: base.filter((c) => c.tags.includes("vip")).length,
    };
  }, [contacts, eventFilter, eventAttendeeEmails]);

  // Filter contacts
  const filtered = useMemo(() => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    return contacts.filter((c) => {
      // Event filter — only show fans whose email matches an attendee of the selected event
      if (eventFilter && eventAttendeeEmails) {
        if (!c.email || !eventAttendeeEmails.has(c.email.toLowerCase())) return false;
      }

      // Search
      const q = debouncedSearch.toLowerCase();
      if (q) {
        const matchName = c.name?.toLowerCase().includes(q);
        const matchEmail = c.email?.toLowerCase().includes(q);
        const matchTag = c.tags.some((t) => t.includes(q));
        if (!matchName && !matchEmail && !matchTag) return false;
      }

      // Filter
      if (activeFilter === "all") return true;

      // Tag-based filter
      if (activeFilter.startsWith("tag:")) {
        return c.tags.includes(activeFilter.slice(4));
      }

      // Fan segment filters
      if (contactType === "fan") {
        if (activeFilter === "core50") return c.segment === "core50";
        if (activeFilter === "ambassadors") return c.segment === "ambassadors";
        if (activeFilter === "repeat") return (c.total_events ?? 0) >= 2;
        if (activeFilter === "new") return (c.total_events ?? 0) <= 1;
        if (activeFilter === "has_ig") return !!c.instagram;
        if (activeFilter === "dormant") return !!(c.last_seen_at && new Date(c.last_seen_at) < sixtyDaysAgo && (c.total_events ?? 0) >= 1);
        if (activeFilter === "vip") return c.tags.includes("vip");
      }

      // Industry role filter
      if (contactType === "industry") {
        return c.role === activeFilter;
      }

      return true;
    });
  }, [contacts, debouncedSearch, activeFilter, contactType, eventFilter, eventAttendeeEmails]);

  // Sort filtered contacts
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDirection === "asc" ? 1 : -1;

    arr.sort((a, b) => {
      switch (sortBy) {
        case "name": {
          const nameA = (a.name ?? a.email).toLowerCase();
          const nameB = (b.name ?? b.email).toLowerCase();
          return dir * nameA.localeCompare(nameB);
        }
        case "events":
          return dir * ((a.total_events ?? 0) - (b.total_events ?? 0));
        case "spent":
          return dir * ((a.total_spend ?? 0) - (b.total_spend ?? 0));
        case "recent": {
          const dateA = a.last_seen_at ?? a.created_at;
          const dateB = b.last_seen_at ?? b.created_at;
          return dir * (new Date(dateA).getTime() - new Date(dateB).getTime());
        }
        case "newest":
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        default:
          return 0;
      }
    });

    return arr;
  }, [filtered, sortBy, sortDirection]);

  const totalPages = Math.ceil(sorted.length / PER_PAGE);
  const paginated = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // ── Sort handler ──
  function handleSort(column: SortBy) {
    if (sortBy === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      // Default descending for numeric/date, ascending for name
      setSortDirection(column === "name" ? "asc" : "desc");
    }
  }

  function SortIndicator({ column }: { column: SortBy }) {
    if (sortBy !== column) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="h-3 w-3 inline-block ml-0.5" />
    ) : (
      <ChevronDown className="h-3 w-3 inline-block ml-0.5" />
    );
  }

  // ── Loading state ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
          <p className="text-xs text-muted-foreground">Loading contacts...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchContacts}
            className="min-h-[44px]"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Helpers ──

  function getInitials(contact: PeopleContact): string {
    if (contact.name) {
      return contact.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
    }
    return contact.email?.[0]?.toUpperCase() ?? "?";
  }

  function formatFollowUp(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil(
      (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
    if (diffDays <= 7) return `In ${diffDays}d`;
    return date.toLocaleDateString("en", { month: "short", day: "numeric" });
  }

  function getLastSeenDate(contact: PeopleContact): string | null {
    const dateStr = contact.last_seen_at ?? contact.created_at;
    if (!dateStr) return null;
    return formatRelativeDate(dateStr);
  }

  // ── Main render ──

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      {contactType === "fan" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-nocturn/15 flex items-center justify-center">
                <Users className="h-4 w-4 text-nocturn" />
              </div>
            </div>
            <p className="text-xl font-bold text-foreground">{summaryStats.totalFans}</p>
            <p className="text-xs text-muted-foreground">Total Fans</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-green-500/15 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-green-400" />
              </div>
            </div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(summaryStats.totalRevenue)}</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-blue-500/15 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-blue-400" />
              </div>
            </div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(summaryStats.avgSpend)}</p>
            <p className="text-xs text-muted-foreground">Avg Spend</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Repeat2 className="h-4 w-4 text-amber-400" />
              </div>
            </div>
            <p className="text-xl font-bold text-foreground">{summaryStats.repeatRate.toFixed(0)}%</p>
            <p className="text-xs text-muted-foreground">Repeat Rate</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${contactType === "fan" ? "fans" : "contacts"}...`}
          className="pl-10"
        />
      </div>

      {/* ── Agentic Segment Filters ─────────────────────── */}
      {filters.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {filters.map((f) => {
            const count = segmentCounts[f.value as keyof typeof segmentCounts] ?? 0;
            const isActive = activeFilter === f.value;
            // Hide empty segments (except All)
            if (f.value !== "all" && count === 0) return null;
            return (
              <button
                key={f.value}
                onClick={() => setActiveFilter(f.value)}
                className={`shrink-0 rounded-xl px-3 py-2 text-left transition-colors min-h-[44px] min-w-[90px] border ${
                  isActive
                    ? "bg-nocturn/10 border-nocturn/30 ring-1 ring-nocturn/20"
                    : "bg-card border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{f.icon}</span>
                  <span className={`text-xs font-semibold ${isActive ? "text-nocturn" : "text-foreground"}`}>
                    {count}
                  </span>
                </div>
                <p className={`text-[11px] mt-0.5 ${isActive ? "text-nocturn/80" : "text-muted-foreground"}`}>
                  {f.label}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile sort pills */}
      <div className="md:hidden flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {MOBILE_SORT_OPTIONS.map(({ label, value }) => {
          const isActive = sortBy === value;
          return (
            <button
              key={value}
              onClick={() => handleSort(value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors min-h-[44px] ${
                isActive
                  ? "bg-foreground/10 text-foreground border border-border"
                  : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              {label}
              {isActive && (
                sortDirection === "desc" ? (
                  <ChevronDown className="h-3 w-3 inline-block ml-0.5" />
                ) : (
                  <ChevronUp className="h-3 w-3 inline-block ml-0.5" />
                )
              )}
            </button>
          );
        })}
      </div>

      {/* Result count + export actions */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          {activeFilter !== "all" && (
            <Sparkles className="h-3 w-3 text-nocturn shrink-0" />
          )}
          {sorted.length} result{sorted.length !== 1 ? "s" : ""}
          {activeFilter !== "all" &&
            ` · ${filters.find((f) => f.value === activeFilter)?.hint ?? filters.find((f) => f.value === activeFilter)?.label ?? activeFilter}`}
          {debouncedSearch && ` · "${debouncedSearch}"`}
        </p>
        {sorted.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyHandles}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              disabled={!sorted.some((c) => c.instagram)}
              title="Copy all IG handles to clipboard"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{copied ? "Copied!" : "@handles"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportCSV}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              title="Export current view as CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
          </div>
        )}
      </div>

      {/* Contact list */}
      {sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
              {contactType === "fan" ? (
                <Users className="h-8 w-8 text-nocturn" />
              ) : (
                <User className="h-8 w-8 text-nocturn" />
              )}
            </div>
            <div className="text-center">
              <p className="font-medium">
                {contacts.length === 0
                  ? `No ${contactType === "fan" ? "fans" : "contacts"} yet`
                  : "No matches found"}
              </p>
              <p className="text-sm text-muted-foreground mt-1 max-w-[260px]">
                {contacts.length === 0
                  ? contactType === "fan"
                    ? "Your attendee list will appear here once you start selling tickets. You can also import existing contacts."
                    : "Build your industry network — import DJs, venue managers, and promoters you work with."
                  : "Try a different search or clear your filters to see more contacts."}
              </p>
            </div>
            {contacts.length === 0 ? (
              onImportClick ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={onImportClick}
                >
                  Import contacts
                </Button>
              ) : null
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() => {
                  setSearch("");
                  setActiveFilter("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Desktop header — sortable for fans */}
          {contactType === "fan" && (
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 text-xs font-medium text-muted-foreground">
              <button
                onClick={() => handleSort("name")}
                className="col-span-3 text-left flex items-center gap-0.5 hover:text-foreground transition-colors min-h-[44px]"
              >
                Contact
                <SortIndicator column="name" />
              </button>
              <span className="col-span-2">Info</span>
              <button
                onClick={() => handleSort("events")}
                className="col-span-1 text-center flex items-center justify-center gap-0.5 hover:text-foreground transition-colors min-h-[44px]"
              >
                Events
                <SortIndicator column="events" />
              </button>
              <button
                onClick={() => handleSort("spent")}
                className="col-span-2 text-center flex items-center justify-center gap-0.5 hover:text-foreground transition-colors min-h-[44px]"
              >
                Spent
                <SortIndicator column="spent" />
              </button>
              <span className="col-span-1 text-center flex items-center justify-center">Segment</span>
              <button
                onClick={() => handleSort("recent")}
                className="col-span-1 text-center flex items-center justify-center gap-0.5 hover:text-foreground transition-colors min-h-[44px]"
              >
                Last Seen
                <SortIndicator column="recent" />
              </button>
              <span className="col-span-2 text-right flex items-center justify-end">Tags</span>
            </div>
          )}
          {contactType === "industry" && (
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 text-xs font-medium text-muted-foreground">
              <button
                onClick={() => handleSort("name")}
                className="col-span-3 text-left flex items-center gap-0.5 hover:text-foreground transition-colors min-h-[44px]"
              >
                Contact
                <SortIndicator column="name" />
              </button>
              <span className="col-span-3">Info</span>
              <span className="col-span-2 text-center flex items-center justify-center">Role</span>
              <span className="col-span-2 text-center flex items-center justify-center">Notes</span>
              <span className="col-span-2 text-right flex items-center justify-end">Tags</span>
            </div>
          )}

          {paginated.map((contact) => (
            <Card
              key={contact.id}
              className="cursor-pointer hover:border-border/80 transition-colors duration-150"
              onClick={() => onContactClick?.(contact.id)}
            >
              <CardContent className="p-4">
                {/* ── Desktop row ── */}
                <div className="hidden md:grid grid-cols-12 items-center gap-2">
                  {/* Avatar + name */}
                  <div className="col-span-3 flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 shrink-0 rounded-full bg-nocturn/10 flex items-center justify-center">
                      {contact.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={contact.avatar_url}
                          alt={contact.name || "Contact"}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold text-nocturn/60 select-none">
                          {getInitials(contact) || (
                            <User className="h-4 w-4 text-nocturn/50" />
                          )}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-sm">
                          {contact.name || contact.email}
                        </p>
                        {/* Follow-up indicator */}
                        {contact.follow_up_at &&
                          new Date(contact.follow_up_at) >=
                            new Date(
                              new Date().setHours(0, 0, 0, 0)
                            ) && (
                            <span className="flex items-center gap-0.5 text-amber-400">
                              <Clock className="h-2.5 w-2.5" />
                              <span className="text-[11px] font-medium">
                                {formatFollowUp(contact.follow_up_at)}
                              </span>
                            </span>
                          )}
                      </div>
                    </div>
                  </div>

                  {/* Contact info column — email, phone, IG */}
                  {contactType === "fan" ? (
                    <div className="col-span-2 min-w-0 space-y-0.5">
                      {contact.email && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{contact.email}</span>
                        </div>
                      )}
                      {contact.phone && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" />
                          <a
                            href={`tel:${contact.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-foreground transition-colors"
                          >
                            {contact.phone}
                          </a>
                        </div>
                      )}
                      {contact.instagram && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                          <Instagram className="h-3 w-3 shrink-0" />
                          <a
                            href={`https://instagram.com/${contact.instagram.replace(/^@/, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-pink-400 transition-colors truncate"
                          >
                            @{contact.instagram.replace(/^@/, "")}
                          </a>
                        </div>
                      )}
                      {!contact.email && !contact.phone && !contact.instagram && (
                        <span className="text-[11px] text-muted-foreground/40">No contact info</span>
                      )}
                    </div>
                  ) : (
                    <div className="col-span-3 min-w-0 space-y-0.5">
                      {contact.email && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{contact.email}</span>
                        </div>
                      )}
                      {contact.phone && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" />
                          <a
                            href={`tel:${contact.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-foreground transition-colors"
                          >
                            {contact.phone}
                          </a>
                        </div>
                      )}
                      {contact.instagram && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                          <Instagram className="h-3 w-3 shrink-0" />
                          <a
                            href={`https://instagram.com/${contact.instagram.replace(/^@/, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-pink-400 transition-colors truncate"
                          >
                            @{contact.instagram.replace(/^@/, "")}
                          </a>
                        </div>
                      )}
                      {!contact.email && !contact.phone && !contact.instagram && (
                        <span className="text-[11px] text-muted-foreground/40">No contact info</span>
                      )}
                    </div>
                  )}

                  {contactType === "fan" ? (
                    <>
                      <div className="col-span-1 text-center">
                        <p className="text-sm">{contact.total_events ?? 0}</p>
                      </div>
                      <p className="col-span-2 text-center font-medium text-nocturn">
                        ${(contact.total_spend ?? 0).toFixed(2)}
                      </p>
                      <div className="col-span-1 flex justify-center">
                        {contact.segment && (
                          <Badge
                            variant="outline"
                            className={`text-[11px] ${SEGMENT_BADGE_STYLES[contact.segment] ?? ""}`}
                          >
                            {contact.segment}
                          </Badge>
                        )}
                      </div>
                      <div className="col-span-1 text-center">
                        <span className="text-[11px] text-muted-foreground">
                          {getLastSeenDate(contact)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="col-span-2 flex justify-center">
                        {contact.role && (
                          <Badge
                            variant="outline"
                            className={`text-[11px] uppercase tracking-wide ${
                              ROLE_BADGE_STYLES[contact.role] ??
                              "bg-muted/60 text-muted-foreground"
                            }`}
                          >
                            {INDUSTRY_ROLE_LABELS[contact.role] ?? contact.role}
                          </Badge>
                        )}
                      </div>
                      <p className="col-span-2 text-center text-xs text-muted-foreground truncate">
                        {contact.notes
                          ? contact.notes.length > 40
                            ? contact.notes.slice(0, 40) + "..."
                            : contact.notes
                          : ""}
                      </p>
                    </>
                  )}

                  {/* Tags + source */}
                  <div className="col-span-2 flex flex-wrap justify-end gap-1">
                    {contact.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] text-white/70"
                      >
                        {tag}
                      </span>
                    ))}
                    {contact.tags.length > 3 && (
                      <span className="text-[11px] text-muted-foreground">
                        +{contact.tags.length - 3}
                      </span>
                    )}
                    {contact.source && (
                      <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[11px] text-muted-foreground/70">
                        {SOURCE_LABELS[contact.source] ?? contact.source}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Mobile layout ── */}
                <div className="md:hidden space-y-2">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="h-10 w-10 shrink-0 rounded-full bg-nocturn/10 flex items-center justify-center">
                      {contact.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={contact.avatar_url}
                          alt={contact.name || "Contact"}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold text-nocturn/60 select-none">
                          {getInitials(contact) || (
                            <User className="h-4 w-4 text-nocturn/50" />
                          )}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="truncate font-medium text-sm">
                          {contact.name || contact.email}
                        </p>
                        {contactType === "fan" && (
                          <span className="text-nocturn font-medium text-sm shrink-0 ml-2">
                            ${(contact.total_spend ?? 0).toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Contact info row — email, phone, IG */}
                      <div className="mt-1 space-y-0.5">
                        {contact.email && (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                            <Mail className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{contact.email}</span>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Phone className="h-2.5 w-2.5 shrink-0" />
                            <a
                              href={`tel:${contact.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-foreground transition-colors"
                            >
                              {contact.phone}
                            </a>
                          </div>
                        )}
                        {contact.instagram && (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                            <Instagram className="h-2.5 w-2.5 shrink-0" />
                            <a
                              href={`https://instagram.com/${contact.instagram.replace(/^@/, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-pink-400 transition-colors truncate"
                            >
                              @{contact.instagram.replace(/^@/, "")}
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Badges row */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {contactType === "fan" && contact.segment && (
                          <Badge
                            variant="outline"
                            className={`text-[11px] ${SEGMENT_BADGE_STYLES[contact.segment] ?? ""}`}
                          >
                            {contact.segment}
                          </Badge>
                        )}
                        {contactType === "industry" && contact.role && (
                          <Badge
                            variant="outline"
                            className={`text-[11px] uppercase tracking-wide ${
                              ROLE_BADGE_STYLES[contact.role] ??
                              "bg-muted/60 text-muted-foreground"
                            }`}
                          >
                            {INDUSTRY_ROLE_LABELS[contact.role] ?? contact.role}
                          </Badge>
                        )}
                        {contactType === "fan" && (
                          <span className="text-[11px] text-muted-foreground">
                            {contact.total_events ?? 0} event
                            {(contact.total_events ?? 0) !== 1 ? "s" : ""}
                          </span>
                        )}
                        {/* Last seen */}
                        {contactType === "fan" && getLastSeenDate(contact) && (
                          <span className="text-[11px] text-muted-foreground/70">
                            · {getLastSeenDate(contact)}
                          </span>
                        )}
                        {/* Follow-up */}
                        {contact.follow_up_at &&
                          new Date(contact.follow_up_at) >=
                            new Date(new Date().setHours(0, 0, 0, 0)) && (
                            <span className="flex items-center gap-0.5 text-amber-400">
                              <Clock className="h-2.5 w-2.5" />
                              <span className="text-[11px] font-medium">
                                {formatFollowUp(contact.follow_up_at)}
                              </span>
                            </span>
                          )}
                        {contact.source && (
                          <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[11px] text-muted-foreground/70">
                            {SOURCE_LABELS[contact.source] ?? contact.source}
                          </span>
                        )}
                      </div>

                      {/* Tags */}
                      {contact.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {contact.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] text-white/70"
                            >
                              {tag}
                            </span>
                          ))}
                          {contact.tags.length > 4 && (
                            <span className="text-[11px] text-muted-foreground">
                              +{contact.tags.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Notes preview */}
                      {contact.notes && (
                        <p className="mt-1 text-[11px] text-muted-foreground/70 truncate">
                          {contact.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="min-h-[44px] min-w-[44px]"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (page <= 3) pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setPage(pageNum);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={`min-h-[44px] min-w-[44px] ${
                      page === pageNum
                        ? "bg-nocturn hover:bg-nocturn-light"
                        : ""
                    }`}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => {
                  setPage((p) => Math.min(totalPages, p + 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="min-h-[44px] min-w-[44px]"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
