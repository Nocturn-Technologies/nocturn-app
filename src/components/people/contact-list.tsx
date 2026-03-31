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
  Instagram,
  User,
  Clock,
  Mail,
  Phone,
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
}

// ── Constants ────────────────────────────────────────────────────────────────

const PER_PAGE = 25;

const FAN_FILTERS = [
  { label: "All", value: "all" },
  { label: "Core 50", value: "core50" },
  { label: "Ambassadors", value: "ambassadors" },
  { label: "Repeat", value: "repeat" },
  { label: "New", value: "new" },
  { label: "VIP", value: "vip" },
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

// ── Component ───────────────────────────────────────────────────────────────

export function ContactList({
  collectiveId,
  contactType,
  onContactClick,
}: ContactListProps) {
  const [contacts, setContacts] = useState<PeopleContact[]>([]);
  const [stats, setStats] = useState<PeopleStats>({ total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on filter/search change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilter]);

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
          instagram: c.instagram,
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
        })));
        setStats({ total: result.totalCount ?? 0, ...result.segmentCounts });
      }
    } catch {
      setError("Failed to load contacts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [collectiveId, contactType]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Build dynamic filter chips for industry (only roles that have contacts)
  const industryFilters = useMemo(() => {
    if (contactType !== "industry") return [];
    const roleCounts = new Map<string, number>();
    for (const c of contacts) {
      if (c.role) {
        roleCounts.set(c.role, (roleCounts.get(c.role) ?? 0) + 1);
      }
    }
    const chips: { label: string; value: string }[] = [
      { label: "All", value: "all" },
    ];
    for (const [role, count] of roleCounts) {
      if (count > 0 && INDUSTRY_ROLE_LABELS[role]) {
        chips.push({ label: INDUSTRY_ROLE_LABELS[role], value: role });
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
        chips.push({ label: tag, value: `tag:${tag}` });
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
        base.push({ label: tag, value: `tag:${tag}` });
      }
    }
    return base;
  }, [contacts, contactType]);

  const filters = contactType === "fan" ? fanFilters : industryFilters;

  // Filter contacts
  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      // Search
      const q = debouncedSearch.toLowerCase();
      if (q) {
        const matchName = c.name?.toLowerCase().includes(q);
        const matchEmail = c.email.toLowerCase().includes(q);
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
        if (activeFilter === "vip") return c.tags.includes("vip");
      }

      // Industry role filter
      if (contactType === "industry") {
        return c.role === activeFilter;
      }

      return true;
    });
  }, [contacts, debouncedSearch, activeFilter, contactType]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

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

  // ── Main render ──

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {contactType === "fan" ? (
          <>
            <span className="font-medium text-foreground">
              {stats.total} fan{stats.total !== 1 ? "s" : ""}
            </span>
            {(stats.repeat ?? 0) > 0 && (
              <>
                <span className="text-white/20">·</span>
                <span>{stats.repeat} repeat</span>
              </>
            )}
            {(stats.ambassadors ?? 0) > 0 && (
              <>
                <span className="text-white/20">·</span>
                <span>{stats.ambassadors} ambassadors</span>
              </>
            )}
          </>
        ) : (
          <>
            <span className="font-medium text-foreground">
              {stats.total} contact{stats.total !== 1 ? "s" : ""}
            </span>
            {(stats.booked ?? 0) > 0 && (
              <>
                <span className="text-white/20">·</span>
                <span>{stats.booked} booked</span>
              </>
            )}
            {(stats.saved ?? 0) > 0 && (
              <>
                <span className="text-white/20">·</span>
                <span>{stats.saved} saved</span>
              </>
            )}
          </>
        )}
      </div>

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

      {/* Filter chips */}
      {filters.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {filters.map(({ label, value }) => {
            const isActive = activeFilter === value;
            return (
              <button
                key={value}
                onClick={() => setActiveFilter(value)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors min-h-[44px] ${
                  isActive
                    ? "bg-nocturn text-white"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Result count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        {activeFilter !== "all" &&
          ` · ${filters.find((f) => f.value === activeFilter)?.label ?? activeFilter}`}
        {debouncedSearch && ` · "${debouncedSearch}"`}
      </p>

      {/* Contact list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {contacts.length === 0
                ? `No ${contactType === "fan" ? "fans" : "contacts"} yet. Import some to get started.`
                : "No contacts match your filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Desktop header */}
          {contactType === "fan" && (
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 text-xs font-medium text-muted-foreground">
              <span className="col-span-3">Contact</span>
              <span className="col-span-3">Info</span>
              <span className="col-span-1 text-center">Events</span>
              <span className="col-span-2 text-center">Spent</span>
              <span className="col-span-1 text-center">Segment</span>
              <span className="col-span-2 text-right">Tags</span>
            </div>
          )}
          {contactType === "industry" && (
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 text-xs font-medium text-muted-foreground">
              <span className="col-span-3">Contact</span>
              <span className="col-span-3">Info</span>
              <span className="col-span-2 text-center">Role</span>
              <span className="col-span-2 text-center">Notes</span>
              <span className="col-span-2 text-right">Tags</span>
            </div>
          )}

          {paginated.map((contact) => (
            <Card
              key={contact.id}
              className="cursor-pointer hover:border-border/80 transition-all"
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
                          alt=""
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
                              <span className="text-[9px] font-medium">
                                {formatFollowUp(contact.follow_up_at)}
                              </span>
                            </span>
                          )}
                      </div>
                    </div>
                  </div>

                  {/* Contact info column — email, phone, IG */}
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

                  {contactType === "fan" ? (
                    <>
                      <p className="col-span-1 text-center text-sm">
                        {contact.total_events ?? 0}
                      </p>
                      <p className="col-span-2 text-center font-medium text-nocturn">
                        ${(contact.total_spend ?? 0).toFixed(2)}
                      </p>
                      <div className="col-span-1 flex justify-center">
                        {contact.segment && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${SEGMENT_BADGE_STYLES[contact.segment] ?? ""}`}
                          >
                            {contact.segment}
                          </Badge>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="col-span-2 flex justify-center">
                        {contact.role && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] uppercase tracking-wide ${
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
                        className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-white/70"
                      >
                        {tag}
                      </span>
                    ))}
                    {contact.tags.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">
                        +{contact.tags.length - 3}
                      </span>
                    )}
                    {contact.source && (
                      <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[8px] text-muted-foreground/60">
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
                          alt=""
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
                            className={`text-[9px] ${SEGMENT_BADGE_STYLES[contact.segment] ?? ""}`}
                          >
                            {contact.segment}
                          </Badge>
                        )}
                        {contactType === "industry" && contact.role && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] uppercase tracking-wide ${
                              ROLE_BADGE_STYLES[contact.role] ??
                              "bg-muted/60 text-muted-foreground"
                            }`}
                          >
                            {INDUSTRY_ROLE_LABELS[contact.role] ?? contact.role}
                          </Badge>
                        )}
                        {contactType === "fan" && (
                          <span className="text-[10px] text-muted-foreground">
                            {contact.total_events ?? 0} event
                            {(contact.total_events ?? 0) !== 1 ? "s" : ""}
                          </span>
                        )}
                        {/* Follow-up */}
                        {contact.follow_up_at &&
                          new Date(contact.follow_up_at) >=
                            new Date(new Date().setHours(0, 0, 0, 0)) && (
                            <span className="flex items-center gap-0.5 text-amber-400">
                              <Clock className="h-2.5 w-2.5" />
                              <span className="text-[9px] font-medium">
                                {formatFollowUp(contact.follow_up_at)}
                              </span>
                            </span>
                          )}
                        {contact.source && (
                          <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[8px] text-muted-foreground/60">
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
                              className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-white/70"
                            >
                              {tag}
                            </span>
                          ))}
                          {contact.tags.length > 4 && (
                            <span className="text-[9px] text-muted-foreground">
                              +{contact.tags.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Notes preview */}
                      {contact.notes && (
                        <p className="mt-1 text-[10px] text-muted-foreground/60 truncate">
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
