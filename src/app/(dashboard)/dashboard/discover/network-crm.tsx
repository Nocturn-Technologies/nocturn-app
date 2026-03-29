"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Users,
  Crown,
  TrendingUp,
  DollarSign,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getNetworkCRM, type CRMContact, type CRMStats, type ContactSegment } from "@/app/actions/network-crm";

// ── Constants ──────────────────────────────────────────────────────────────────

const PER_PAGE = 20;

type SegmentFilter = "all" | ContactSegment;

const SEGMENT_LABELS: Record<ContactSegment, string> = {
  vip: "VIP",
  repeat: "Repeat",
  new: "New",
  lapsed: "Lapsed",
};

// ── Segment badge styles ───────────────────────────────────────────────────────

function segmentBadgeClass(segment: ContactSegment): string {
  switch (segment) {
    case "vip":
      return "bg-[#7B2FF7]/20 text-[#9D5CFF] border border-[#7B2FF7]/30";
    case "repeat":
      return "bg-blue-500/15 text-blue-400 border border-blue-500/25";
    case "new":
      return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25";
    case "lapsed":
      return "bg-orange-500/15 text-orange-400 border border-orange-500/25";
  }
}

function segmentDotClass(segment: ContactSegment): string {
  switch (segment) {
    case "vip":
      return "bg-[#7B2FF7]";
    case "repeat":
      return "bg-blue-400";
    case "new":
      return "bg-emerald-400";
    case "lapsed":
      return "bg-orange-400";
  }
}

// ── Mini sparkline ─────────────────────────────────────────────────────────────

function Sparkline({ data, segment }: { data: number[]; segment: ContactSegment }) {
  if (!data || data.length < 2) {
    return (
      <div className="flex items-end gap-[2px] h-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="w-1 rounded-sm bg-muted/40"
            style={{ height: "4px" }}
          />
        ))}
      </div>
    );
  }

  const max = Math.max(...data, 0.01);
  const colorClass =
    segment === "vip"
      ? "bg-[#7B2FF7]"
      : segment === "repeat"
      ? "bg-blue-400"
      : segment === "new"
      ? "bg-emerald-400"
      : "bg-orange-400";

  return (
    <div className="flex items-end gap-[2px] h-6">
      {data.map((val, i) => {
        const heightPct = Math.max((val / max) * 100, 8);
        return (
          <div
            key={i}
            className={`w-1 rounded-sm ${colorClass} opacity-80`}
            style={{ height: `${heightPct}%` }}
          />
        );
      })}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  iconBg,
  iconColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Contact card ──────────────────────────────────────────────────────────────

function ContactCard({ contact }: { contact: CRMContact }) {
  const [expanded, setExpanded] = useState(false);

  const displayName = contact.name ?? contact.email.split("@")[0];
  const emailDomain = contact.email.split("@")[1] ?? "";

  const lastSeenDate = contact.lastSeen
    ? new Date(contact.lastSeen).toLocaleDateString("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <Card
      className="border-border/50 hover:border-border transition-colors cursor-pointer group"
      onClick={() => setExpanded((p) => !p)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          {/* Avatar + name */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold uppercase">
              {displayName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {contact.name ? contact.email : `@${emailDomain}`}
              </p>
            </div>
          </div>

          {/* Segment badge */}
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${segmentBadgeClass(contact.segment)}`}
          >
            {contact.segment === "vip" && "★ "}
            {SEGMENT_LABELS[contact.segment]}
          </span>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/40 p-2">
            <p className="text-[10px] text-muted-foreground mb-0.5">Events</p>
            <p className="text-sm font-bold">{contact.eventsAttended}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <p className="text-[10px] text-muted-foreground mb-0.5">Spent</p>
            <p className="text-sm font-bold text-nocturn">
              ${contact.totalSpent.toFixed(0)}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <p className="text-[10px] text-muted-foreground mb-0.5">Referrals</p>
            <p className="text-sm font-bold">{contact.referralCount}</p>
          </div>
        </div>

        {/* Sparkline + last seen */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60 font-medium">
              Spend trend
            </p>
            <Sparkline data={contact.spendHistory} segment={contact.segment} />
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60 font-medium">
              Last seen
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{lastSeenDate}</p>
          </div>
        </div>

        {/* Expanded: event history */}
        {expanded && contact.eventTitles.length > 0 && (
          <div className="border-t border-border/40 pt-3 space-y-1.5 mt-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-medium mb-2">
              Events attended
            </p>
            {contact.eventTitles.map((title, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${segmentDotClass(contact.segment)}`}
                />
                <p className="text-xs text-muted-foreground truncate">{title}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main CRM Component ─────────────────────────────────────────────────────────

export function NetworkCRM() {
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [stats, setStats] = useState<CRMStats>({
    totalContacts: 0,
    vipCount: 0,
    repeatRate: 0,
    avgLTV: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await Promise.race([
        getNetworkCRM(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 20000)
        ),
      ]);
      if (result.error) {
        setError(result.error);
      } else {
        setContacts(result.contacts);
        setStats(result.stats);
      }
    } catch {
      setError("Failed to load contacts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, segmentFilter]);

  // Filter contacts
  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const matchesSegment =
        segmentFilter === "all" || c.segment === segmentFilter;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.email.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q);

      return matchesSegment && matchesSearch;
    });
  }, [contacts, searchQuery, segmentFilter]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Segment counts for filter chips
  const segmentCounts = useMemo(() => {
    const counts: Record<ContactSegment, number> = { vip: 0, repeat: 0, new: 0, lapsed: 0 };
    for (const c of contacts) counts[c.segment]++;
    return counts;
  }, [contacts]);

  // ── Render: loading ──────────────────────────────────────────────────────────

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

  // ── Render: error ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData} className="min-h-[44px]">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Render: empty state ──────────────────────────────────────────────────────

  if (contacts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
            <Users className="h-8 w-8 text-nocturn" />
          </div>
          <div className="text-center max-w-xs">
            <p className="font-semibold text-lg">No contacts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once people buy tickets to your events, they&apos;ll appear here
              as CRM contacts — automatically segmented and tracked.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Render: main ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Total Contacts"
          value={stats.totalContacts.toLocaleString()}
          iconBg="bg-nocturn/10"
          iconColor="text-nocturn"
        />
        <StatCard
          icon={<Crown className="h-5 w-5" />}
          label="VIPs (5+ events)"
          value={stats.vipCount.toLocaleString()}
          iconBg="bg-[#7B2FF7]/10"
          iconColor="text-[#9D5CFF]"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Repeat Rate"
          value={`${stats.repeatRate}%`}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-400"
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Avg LTV"
          value={`$${stats.avgLTV.toFixed(0)}`}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-400"
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or email..."
          className="pl-10"
        />
      </div>

      {/* Segment filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {(["all", "vip", "repeat", "new", "lapsed"] as const).map((seg) => {
          const isActive = segmentFilter === seg;
          const count =
            seg === "all"
              ? contacts.length
              : segmentCounts[seg];

          let chipClass = "";
          if (isActive) {
            if (seg === "all") chipClass = "bg-nocturn text-white";
            else if (seg === "vip") chipClass = "bg-[#7B2FF7] text-white";
            else if (seg === "repeat") chipClass = "bg-blue-500 text-white";
            else if (seg === "new") chipClass = "bg-emerald-500 text-white";
            else chipClass = "bg-orange-500 text-white";
          } else {
            chipClass = "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted";
          }

          return (
            <button
              key={seg}
              onClick={() => setSegmentFilter(seg)}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${chipClass}`}
            >
              {seg === "all" ? "All" : SEGMENT_LABELS[seg]}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                  isActive ? "bg-white/20" : "bg-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground/70 px-0.5">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#7B2FF7]" />
          VIP = 5+ events
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          Repeat = 2–4 events
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          New = 1 event
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
          Lapsed = 90+ days inactive
        </span>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
        {segmentFilter !== "all" && ` · ${SEGMENT_LABELS[segmentFilter]}`}
        {searchQuery && ` · matching "${searchQuery}"`}
        {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
      </p>

      {/* Contact grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No contacts match your search or filter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paginated.map((contact) => (
              <ContactCard key={contact.email} contact={contact} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2 pb-4">
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
                      page === pageNum ? "bg-nocturn hover:bg-nocturn-light" : ""
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
        </>
      )}
    </div>
  );
}

// ── Export alias used in discover page ────────────────────────────────────────
// (re-exported for clarity)
export default NetworkCRM;
