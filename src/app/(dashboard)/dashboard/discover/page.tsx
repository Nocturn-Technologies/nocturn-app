"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProfileCard, type DiscoverProfile } from "./profile-card";
import { CollectiveCard } from "./collective-card";
import { ContactDialog } from "./contact-dialog";
import {
  searchProfiles,
  getSavedProfiles,
  saveProfile,
  unsaveProfile,
} from "@/app/actions/marketplace";
import {
  getDiscoverCollectives,
  getMyNextEvent,
  getMyConnectedCollectiveIds,
  type DiscoverCollective,
  type NextEventSummary,
} from "@/app/actions/discover-collectives";
import { startCollabChat } from "@/app/actions/collab";
import { searchVenues, type VenueResult } from "@/lib/venues-api";
import {
  saveVenue as saveVenueAction,
  removeSavedVenue,
  getSavedVenues,
} from "@/app/actions/venues";
import { haptic } from "@/lib/haptics";
import {
  Search,
  Users2,
  User,
  MapPin,
  Heart,
  Star,
  X,
  ArrowRight,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ─── Tab system ────────────────────────────────────────────────────────────
// Three primary tabs instead of the old 17-chip strip. Everything else (long-
// tail roles like tour managers, PR, sponsors) lives under People → "More".
type TopTab = "collectives" | "people" | "venues";

const PEOPLE_PRIMARY = [
  { label: "All", value: "all" },
  { label: "DJs", value: "artist" },
  { label: "Photo", value: "photographer" },
  { label: "Designers", value: "graphic_designer" },
] as const;

const PEOPLE_MORE = [
  { label: "Managers", value: "artist_manager" },
  { label: "Tour mgrs", value: "tour_manager" },
  { label: "Booking agents", value: "booking_agent" },
  { label: "Video", value: "videographer" },
  { label: "MC / Host", value: "mc_host" },
  { label: "Sound", value: "sound_production" },
  { label: "Lighting", value: "lighting_production" },
  { label: "Staff", value: "event_staff" },
  { label: "PR", value: "pr_publicist" },
  { label: "Promoters", value: "promoter" },
  { label: "Sponsors", value: "sponsor" },
] as const;

const ALL_PEOPLE_OPTIONS = [...PEOPLE_PRIMARY, ...PEOPLE_MORE];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <DiscoverContent />
    </Suspense>
  );
}

function PageFallback() {
  return (
    <div className="max-w-6xl mx-auto space-y-4 overflow-x-hidden px-4 md:px-0">
      <HeaderSkeleton />
      <SearchSkeleton />
      <GridSkeleton />
    </div>
  );
}

function DiscoverContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Top tab (initialize from ?tab=) ─────────────────────────────────────
  const [tab, setTab] = useState<TopTab>(() => {
    const t = searchParams.get("tab");
    if (t === "people") return "people";
    if (t === "venues") return "venues";
    return "collectives";
  });

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "people") setTab("people");
    else if (t === "venues") setTab("venues");
    else if (t === "collectives") setTab("collectives");
  }, [searchParams]);

  // ── Shared filters ──────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [cityAutoApplied, setCityAutoApplied] = useState(false);

  // People sub-type (only used on People tab)
  const [peopleType, setPeopleType] = useState<string>("all");
  const [showMoreTypes, setShowMoreTypes] = useState(false);

  // View toggle — applies across all 3 tabs.
  // "discover": everyone matching filters. "network": only the subset I've
  // saved (profiles/venues) or started a collab chat with (collectives).
  const [view, setView] = useState<"discover" | "network">("discover");

  // ── Results state, per tab ──────────────────────────────────────────────
  const [collectives, setCollectives] = useState<DiscoverCollective[]>([]);
  const [collectivesTotal, setCollectivesTotal] = useState(0);
  const [collectivesLoading, setCollectivesLoading] = useState(true);

  const [profiles, setProfiles] = useState<DiscoverProfile[]>([]);
  const [profilesTotal, setProfilesTotal] = useState(0);
  const [profilesLoading, setProfilesLoading] = useState(true);

  const [venues, setVenues] = useState<VenueResult[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(true);

  // ── Next-event hero (desktop context card) ──────────────────────────────
  const [nextEvent, setNextEvent] = useState<NextEventSummary | null>(null);
  const [myCollectiveId, setMyCollectiveId] = useState<string | undefined>();

  // ── Saved state ─────────────────────────────────────────────────────────
  const [savedProfileIds, setSavedProfileIds] = useState<Set<string>>(new Set());
  const [savedVenueIds, setSavedVenueIds] = useState<Set<string>>(new Set());
  const [savingVenueId, setSavingVenueId] = useState<string | null>(null);

  // ── Connect state (collectives) ─────────────────────────────────────────
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [pitchError, setPitchError] = useState<string | null>(null);

  // ── Contact dialog (profiles) ───────────────────────────────────────────
  const [contactProfile, setContactProfile] = useState<{
    id: string;
    name: string;
    type: string;
    city: string;
  } | null>(null);

  // ── Bootstrap: fetch next event + user's collective city + connected set ─
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Run in parallel: next event + connected collectives
      const [evt, connectedList] = await Promise.all([
        getMyNextEvent(),
        getMyConnectedCollectiveIds(),
      ]);
      if (cancelled) return;
      setNextEvent(evt);
      setConnectedIds(new Set(connectedList));
      // Default the city filter to the user's collective city (once)
      if (!cityAutoApplied && evt?.collective_city) {
        setCityFilter(evt.collective_city);
        setCityAutoApplied(true);
      }
      // Capture collectiveId from a direct client query (needed for startCollabChat)
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && !cancelled) {
          const { data: membership } = await supabase
            .from("collective_members")
            .select("collective_id")
            .eq("user_id", user.id)
            .is("deleted_at", null)
            .limit(1)
            .maybeSingle();
          if (!cancelled) setMyCollectiveId(membership?.collective_id);
        }
      } catch {
        // Silent fail — startCollabChat will be disabled
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Saved profiles + saved venues bootstrap ─────────────────────────────
  useEffect(() => {
    (async () => {
      const res = await getSavedProfiles();
      const ids = new Set<string>(res.savedIds ?? []);
      res.profiles.forEach((p) => ids.add((p as { id: string }).id));
      setSavedProfileIds(ids);
    })();
    (async () => {
      const { venues: list } = await getSavedVenues();
      if (list) {
        setSavedVenueIds(new Set((list as { place_id: string }[]).map((v) => v.place_id)));
      }
    })();
  }, []);

  // ── Stale-response guards (request counter per tab) ─────────────────────
  const collectivesReq = useRef(0);
  const profilesReq = useRef(0);
  const venuesReq = useRef(0);

  // ── Fetch: collectives ──────────────────────────────────────────────────
  const fetchCollectives = useCallback(async () => {
    const id = ++collectivesReq.current;
    setCollectivesLoading(true);
    const result = await getDiscoverCollectives({
      query: query.trim() || null,
      city: cityFilter.trim() || null,
      page: 1,
    });
    if (id !== collectivesReq.current) return; // stale
    setCollectives(result.collectives);
    setCollectivesTotal(result.total);
    setCollectivesLoading(false);
  }, [query, cityFilter]);

  // ── Fetch: profiles (people tab) ────────────────────────────────────────
  const fetchProfiles = useCallback(async () => {
    const id = ++profilesReq.current;
    setProfilesLoading(true);
    const result = await searchProfiles({
      type: peopleType === "all" ? null : peopleType,
      query: query.trim() || null,
      city: cityFilter.trim() || null,
      page: 1,
    });
    if (id !== profilesReq.current) return; // stale
    setProfiles(result.profiles as unknown as DiscoverProfile[]);
    setProfilesTotal(result.total);
    setProfilesLoading(false);
  }, [peopleType, query, cityFilter]);

  // ── Fetch: venues ───────────────────────────────────────────────────────
  const fetchVenues = useCallback(async () => {
    const id = ++venuesReq.current;
    setVenuesLoading(true);
    const results = await searchVenues(query.trim(), "All");
    if (id !== venuesReq.current) return;
    setVenues(results);
    setVenuesLoading(false);
  }, [query]);

  // ── Debounced triggers per tab ──────────────────────────────────────────
  useEffect(() => {
    if (tab !== "collectives") return;
    const t = setTimeout(fetchCollectives, 250);
    return () => clearTimeout(t);
  }, [tab, fetchCollectives]);

  useEffect(() => {
    if (tab !== "people") return;
    const t = setTimeout(fetchProfiles, 250);
    return () => clearTimeout(t);
  }, [tab, fetchProfiles]);

  useEffect(() => {
    if (tab !== "venues") return;
    const t = setTimeout(fetchVenues, 250);
    return () => clearTimeout(t);
  }, [tab, fetchVenues]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const switchTab = (next: TopTab) => {
    haptic("light");
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/dashboard/discover?${params.toString()}`, { scroll: false });
  };

  async function handleSaveProfile(profileId: string) {
    haptic("light");
    setSavedProfileIds((prev) => new Set(prev).add(profileId));
    const { error } = await saveProfile(profileId);
    if (error) {
      setSavedProfileIds((prev) => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
    }
  }

  async function handleUnsaveProfile(profileId: string) {
    haptic("light");
    setSavedProfileIds((prev) => {
      const next = new Set(prev);
      next.delete(profileId);
      return next;
    });
    const { error } = await unsaveProfile(profileId);
    if (error) {
      setSavedProfileIds((prev) => new Set(prev).add(profileId));
    }
  }

  async function handleSaveVenue(venue: VenueResult) {
    if (savingVenueId) return;
    haptic("light");
    setSavingVenueId(venue.place_id);
    const { error } = await saveVenueAction(venue);
    if (!error) {
      setSavedVenueIds((prev) => new Set(prev).add(venue.place_id));
    }
    setSavingVenueId(null);
  }

  async function handleRemoveVenue(placeId: string) {
    if (savingVenueId) return;
    setSavingVenueId(placeId);
    await removeSavedVenue(placeId);
    setSavedVenueIds((prev) => {
      const next = new Set(prev);
      next.delete(placeId);
      return next;
    });
    setSavingVenueId(null);
  }

  async function handlePitchCollab(targetCollectiveId: string) {
    if (!myCollectiveId) return;
    haptic("medium");
    setPitchError(null);
    setConnectingId(targetCollectiveId);
    const result = await startCollabChat(myCollectiveId, targetCollectiveId);
    setConnectingId(null);
    if (result.error || !result.channelId) {
      setPitchError(result.error ?? "Couldn't start the chat — try again.");
      setTimeout(() => setPitchError(null), 5000);
      return;
    }
    setConnectedIds((prev) => new Set(prev).add(targetCollectiveId));
    router.push(`/dashboard/chat?channel=${result.channelId}`);
  }

  // ── Filtering + computed ────────────────────────────────────────────────
  // When view === "network", we show only the user's saved subset:
  //   collectives → collab-chat partners (connectedIds, loaded server-side)
  //   people      → marketplace_saved profiles (savedProfileIds)
  //   venues      → saved_venues (savedVenueIds)
  const visibleCollectives =
    view === "network" ? collectives.filter((c) => connectedIds.has(c.id)) : collectives;
  const visibleProfiles =
    view === "network" ? profiles.filter((p) => savedProfileIds.has(p.id)) : profiles;
  const visibleVenues =
    view === "network" ? venues.filter((v) => savedVenueIds.has(v.place_id)) : venues;

  const activeLoading =
    tab === "collectives" ? collectivesLoading : tab === "people" ? profilesLoading : venuesLoading;

  // When in "network" view, the displayed total is the filtered length (we
  // can't just reuse the server-provided total since filtering is client-side
  // within the current result page).
  const activeTotal =
    view === "network"
      ? tab === "collectives"
        ? visibleCollectives.length
        : tab === "people"
          ? visibleProfiles.length
          : visibleVenues.length
      : tab === "collectives"
        ? collectivesTotal
        : tab === "people"
          ? profilesTotal
          : venues.length;

  // Per-tab network counts (always visible in the toggle, so the user knows
  // how many of their network are on the screen right now)
  const networkCountForTab =
    tab === "collectives"
      ? collectives.filter((c) => connectedIds.has(c.id)).length
      : tab === "people"
        ? profiles.filter((p) => savedProfileIds.has(p.id)).length
        : venues.filter((v) => savedVenueIds.has(v.place_id)).length;

  const peopleTypeLabel =
    ALL_PEOPLE_OPTIONS.find((o) => o.value === peopleType)?.label ?? "All";

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-4 overflow-x-hidden px-4 md:px-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-heading">Discover</h1>
          <p className="text-xs text-muted-foreground">
            Find collectives to collab with, artists to book, venues to play.
          </p>
        </div>
        <Link
          href="/dashboard/network"
          className="shrink-0 inline-flex items-center gap-1 min-h-[44px] text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          title="Full CRM — import contacts, tags, booking history"
        >
          <Users2 className="h-3.5 w-3.5" />
          CRM
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Desktop-only context card: your next event */}
      {nextEvent && <NextEventHero event={nextEvent} />}

      {/* Top tabs + view toggle */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-muted/30 p-1 w-full md:w-fit" role="tablist" aria-label="Entity type">
          <TabButton
            active={tab === "collectives"}
            onClick={() => switchTab("collectives")}
            icon={<Users2 className="h-3.5 w-3.5" />}
            label="Collectives"
          />
          <TabButton
            active={tab === "people"}
            onClick={() => switchTab("people")}
            icon={<User className="h-3.5 w-3.5" />}
            label="People"
          />
          <TabButton
            active={tab === "venues"}
            onClick={() => switchTab("venues")}
            icon={<MapPin className="h-3.5 w-3.5" />}
            label="Venues"
          />
        </div>

        <ViewToggle
          view={view}
          networkCount={networkCountForTab}
          onChange={(next) => {
            haptic("light");
            setView(next);
          }}
        />
      </div>

      {/* Search + city chip */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 md:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === "collectives"
                ? "Search collectives…"
                : tab === "venues"
                  ? "Search venues in Toronto…"
                  : `Search ${peopleTypeLabel.toLowerCase()}…`
            }
            className="w-full pl-10"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {tab !== "venues" && (
          <CityChip
            value={cityFilter}
            onChange={setCityFilter}
            suggestion={nextEvent?.collective_city ?? null}
          />
        )}
      </div>

      {/* People sub-type filter (only when on People tab) */}
      {tab === "people" && (
        <PeopleSubFilter
          active={peopleType}
          onChange={(v) => {
            haptic("light");
            setPeopleType(v);
            setShowMoreTypes(false);
          }}
          showMore={showMoreTypes}
          onToggleMore={() => setShowMoreTypes((s) => !s)}
        />
      )}

      {/* Pitch error banner */}
      {pitchError && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive animate-in fade-in duration-200">
          {pitchError}
        </div>
      )}

      {/* Results */}
      <div>
        {tab === "collectives" && (
          <CollectivesResults
            collectives={visibleCollectives}
            loading={collectivesLoading}
            query={query}
            city={cityFilter}
            view={view}
            onPitchCollab={handlePitchCollab}
            connectingId={connectingId}
            connectedIds={connectedIds}
            canPitch={!!myCollectiveId}
          />
        )}

        {tab === "people" && (
          <PeopleResults
            profiles={visibleProfiles}
            loading={profilesLoading}
            view={view}
            savedIds={savedProfileIds}
            onSave={handleSaveProfile}
            onUnsave={handleUnsaveProfile}
            onContact={(p) =>
              setContactProfile({
                id: p.id,
                name: p.display_name,
                type: p.user_type ?? p.type ?? "artist",
                city: p.city ?? "",
              })
            }
          />
        )}

        {tab === "venues" && (
          <VenuesResults
            venues={visibleVenues}
            loading={venuesLoading}
            query={query}
            view={view}
            savedVenueIds={savedVenueIds}
            savingVenueId={savingVenueId}
            onSave={handleSaveVenue}
            onRemove={handleRemoveVenue}
          />
        )}
      </div>

      {/* Footer count */}
      {!activeLoading && activeTotal > 0 && (
        <p className="text-[11px] text-muted-foreground text-center pt-2 pb-4">
          {activeTotal} {activeTotal === 1 ? "result" : "results"}
        </p>
      )}

      <ContactDialog
        profileId={contactProfile?.id ?? ""}
        profileName={contactProfile?.name ?? ""}
        open={!!contactProfile}
        onOpenChange={(open) => {
          if (!open) setContactProfile(null);
        }}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all min-h-[44px] ${
        active
          ? "bg-nocturn text-white shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Discover ↔ My network toggle. Lives next to the tab bar and re-filters the
 * current tab's results to only the subset I've saved / started a collab with.
 * The "My network" segment always shows its current count so operators can see
 * their shortlist at a glance.
 */
function ViewToggle({
  view,
  networkCount,
  onChange,
}: {
  view: "discover" | "network";
  networkCount: number;
  onChange: (next: "discover" | "network") => void;
}) {
  return (
    <div
      className="inline-flex gap-1 rounded-xl bg-muted/30 p-1 w-full md:w-fit self-stretch md:self-auto"
      role="tablist"
      aria-label="Filter results by network"
    >
      <button
        role="tab"
        aria-selected={view === "discover"}
        onClick={() => onChange("discover")}
        className={`flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all min-h-[44px] ${
          view === "discover"
            ? "bg-nocturn text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Discover
      </button>
      <button
        role="tab"
        aria-selected={view === "network"}
        onClick={() => onChange("network")}
        className={`flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all min-h-[44px] ${
          view === "network"
            ? "bg-nocturn text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Users2 className="h-3.5 w-3.5" />
        My network
        <span
          className={`ml-0.5 inline-flex items-center justify-center rounded-full px-1.5 min-w-[20px] h-5 text-[11px] font-bold ${
            view === "network"
              ? "bg-white/20 text-white"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {networkCount}
        </span>
      </button>
    </div>
  );
}

function NextEventHero({ event }: { event: NextEventSummary }) {
  const date = new Date(event.starts_at);
  const dateLabel = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const vibes = (event.vibe_tags ?? []).slice(0, 2);

  return (
    <div className="hidden md:flex items-center justify-between gap-4 rounded-2xl border border-nocturn/20 bg-gradient-to-r from-nocturn/10 via-nocturn/5 to-transparent p-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nocturn/20">
          <Sparkles className="h-4 w-4 text-nocturn" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-nocturn/80 font-semibold">
            Your next event
          </p>
          <p className="text-sm font-semibold truncate">
            {event.title} · {dateLabel}
            {event.city ? ` · ${event.city}` : ""}
            {vibes.length > 0 ? ` · ${vibes.join(" / ")}` : ""}
          </p>
        </div>
      </div>
      <Link
        href={`/dashboard/events/${event.id}`}
        className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] rounded-lg bg-nocturn/10 hover:bg-nocturn/20 text-nocturn text-xs font-semibold px-3 transition-colors"
      >
        Open event
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function CityChip({
  value,
  onChange,
  suggestion,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestion: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Any city"
          className="w-36"
          autoFocus
          onBlur={() => {
            onChange(draft.trim());
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onChange(draft.trim());
              setEditing(false);
            }
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
        />
      </div>
    );
  }

  const display = value || suggestion || "Any city";

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1.5 min-h-[44px] rounded-lg border border-border bg-background hover:border-nocturn/30 hover:text-foreground transition-colors px-3 text-xs text-muted-foreground"
    >
      <MapPin className="h-3.5 w-3.5" />
      <span className="max-w-[120px] truncate">{display}</span>
      {value && (
        <span
          role="button"
          tabIndex={0}
          aria-label="Clear city filter"
          className="inline-flex items-center justify-center h-5 w-5 rounded hover:text-red-400 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onChange("");
            }
          }}
        >
          <X className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

function PeopleSubFilter({
  active,
  onChange,
  showMore,
  onToggleMore,
}: {
  active: string;
  onChange: (v: string) => void;
  showMore: boolean;
  onToggleMore: () => void;
}) {
  const activeIsMore = PEOPLE_MORE.some((o) => o.value === active);
  const activeMoreLabel = activeIsMore
    ? ALL_PEOPLE_OPTIONS.find((o) => o.value === active)?.label
    : null;

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
        {PEOPLE_PRIMARY.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`shrink-0 rounded-full px-3 min-h-[44px] text-xs font-medium transition-colors ${
              active === opt.value
                ? "bg-nocturn text-white"
                : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={onToggleMore}
          className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 min-h-[44px] text-xs font-medium transition-colors ${
            activeIsMore
              ? "bg-nocturn text-white"
              : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {activeMoreLabel ?? "More"}
          <ChevronDown className={`h-3 w-3 transition-transform ${showMore ? "rotate-180" : ""}`} />
        </button>
      </div>
      {showMore && (
        <div className="flex flex-wrap gap-1.5 pb-1 border-t border-border/40 pt-2">
          {PEOPLE_MORE.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`rounded-full px-3 min-h-[44px] text-xs font-medium transition-colors ${
                active === opt.value
                  ? "bg-nocturn text-white"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Results sections ───────────────────────────────────────────────────────

function CollectivesResults({
  collectives,
  loading,
  query,
  city,
  view,
  onPitchCollab,
  connectingId,
  connectedIds,
  canPitch,
}: {
  collectives: DiscoverCollective[];
  loading: boolean;
  query: string;
  city: string;
  view: "discover" | "network";
  onPitchCollab: (id: string) => void;
  connectingId: string | null;
  connectedIds: Set<string>;
  canPitch: boolean;
}) {
  if (loading) return <CardGridSkeleton kind="collective" />;
  if (collectives.length === 0) {
    return (
      <EmptyState
        icon={<Users2 className="h-8 w-8 text-muted-foreground" />}
        title={view === "network" ? "No collectives in your network yet" : "No collectives found"}
        subtitle={
          view === "network"
            ? "Pitch a collab to add collectives to your network. They'll show up here."
            : query || city
              ? "Try a different search or widen the city filter."
              : "No other collectives on Nocturn yet — invite one to join."
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {collectives.map((c) => (
        <CollectiveCard
          key={c.id}
          collective={c}
          onPitchCollab={() => onPitchCollab(c.id)}
          isConnecting={connectingId === c.id}
          isConnected={connectedIds.has(c.id)}
          canPitch={canPitch}
        />
      ))}
    </div>
  );
}

function PeopleResults({
  profiles,
  loading,
  view,
  savedIds,
  onSave,
  onUnsave,
  onContact,
}: {
  profiles: DiscoverProfile[];
  loading: boolean;
  view: "discover" | "network";
  savedIds: Set<string>;
  onSave: (id: string) => void;
  onUnsave: (id: string) => void;
  onContact: (p: DiscoverProfile) => void;
}) {
  if (loading) return <CardGridSkeleton kind="profile" />;
  if (profiles.length === 0) {
    return (
      <EmptyState
        icon={<User className="h-8 w-8 text-muted-foreground" />}
        title={view === "network" ? "Nobody saved yet" : "No one matched"}
        subtitle={
          view === "network"
            ? "Save profiles you like. They'll show up here."
            : "Try a different search or role."
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {profiles.map((p) => (
        <ProfileCard
          key={p.id}
          profile={p}
          isSaved={savedIds.has(p.id)}
          onSave={() => onSave(p.id)}
          onUnsave={() => onUnsave(p.id)}
          onContact={() => onContact(p)}
          connectionTags={undefined}
        />
      ))}
    </div>
  );
}

function VenuesResults({
  venues,
  loading,
  query,
  view,
  savedVenueIds,
  savingVenueId,
  onSave,
  onRemove,
}: {
  venues: VenueResult[];
  loading: boolean;
  query: string;
  view: "discover" | "network";
  savedVenueIds: Set<string>;
  savingVenueId: string | null;
  onSave: (v: VenueResult) => void;
  onRemove: (placeId: string) => void;
}) {
  if (loading) return <CardGridSkeleton kind="venue" />;
  if (venues.length === 0) {
    return (
      <EmptyState
        icon={<MapPin className="h-8 w-8 text-muted-foreground" />}
        title={view === "network" ? "No saved venues" : "No venues found"}
        subtitle={
          view === "network"
            ? "Save venues you like. They'll show up here."
            : query
              ? "Try a different search."
              : "No venues available."
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {venues.map((v) => (
        <DiscoverVenueCard
          key={v.place_id}
          venue={v}
          isSaved={savedVenueIds.has(v.place_id)}
          isSaving={savingVenueId === v.place_id}
          onSave={() => onSave(v)}
          onRemove={() => onRemove(v.place_id)}
        />
      ))}
    </div>
  );
}

// ─── Skeleton / empty states ────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div>
      <div className="h-7 w-32 rounded-md bg-muted animate-pulse" />
      <div className="h-3 w-64 rounded-md bg-muted animate-pulse mt-2" />
    </div>
  );
}

function SearchSkeleton() {
  return <div className="h-11 w-full rounded-xl bg-muted animate-pulse" />;
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="h-28 bg-muted animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
            <div className="h-9 w-full rounded-lg bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CardGridSkeleton({ kind }: { kind: "collective" | "profile" | "venue" }) {
  if (kind === "profile") {
    // Horizontal row layout matching ProfileCard (avatar + text + action)
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden p-3">
            <div className="flex items-start gap-3">
              <div className="h-14 w-14 rounded-xl bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                <div className="flex gap-1">
                  <div className="h-5 w-12 rounded bg-muted animate-pulse" />
                  <div className="h-5 w-14 rounded bg-muted animate-pulse" />
                </div>
              </div>
            </div>
            <div className="flex gap-1 mt-3">
              <div className="flex-1 h-11 rounded-lg bg-muted animate-pulse" />
              <div className="h-11 w-11 rounded-lg bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Vertical card layout for collectives + venues (media header + text + CTA)
  const mediaHeight = kind === "collective" ? "h-36" : "h-28";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className={`${mediaHeight} bg-muted animate-pulse`} />
          <div className="p-3 space-y-2">
            <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
            <div className="h-9 w-full rounded-lg bg-muted animate-pulse mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
          {icon}
        </div>
        <div className="text-center max-w-xs">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Venue Card (unchanged from before, kept inline for now) ────────────────

const VENUE_TYPE_COLORS: Record<string, string> = {
  Club: "bg-purple-500/20 text-purple-300",
  Bar: "bg-amber-500/20 text-amber-300",
  Warehouse: "bg-emerald-500/20 text-emerald-300",
  Gallery: "bg-pink-500/20 text-pink-300",
  Rooftop: "bg-sky-500/20 text-sky-300",
  "Live Music": "bg-orange-500/20 text-orange-300",
  Underground: "bg-red-500/20 text-red-300",
};

const VENUE_GRADIENTS = [
  "from-nocturn/60 to-purple-900/40",
  "from-indigo-600/50 to-blue-900/40",
  "from-pink-600/50 to-rose-900/40",
  "from-emerald-600/50 to-teal-900/40",
  "from-amber-600/50 to-orange-900/40",
  "from-sky-600/50 to-cyan-900/40",
];

function DiscoverVenueCard({
  venue,
  isSaved,
  isSaving,
  onSave,
  onRemove,
}: {
  venue: VenueResult;
  isSaved: boolean;
  isSaving: boolean;
  onSave: () => void;
  onRemove: () => void;
}) {
  const gradientIdx = venue.name.charCodeAt(0) % VENUE_GRADIENTS.length;
  const typeCls = VENUE_TYPE_COLORS[venue.venue_type] ?? "bg-muted text-muted-foreground";

  return (
    <Card className="overflow-hidden rounded-2xl transition-all duration-200 hover:border-nocturn/30 active:scale-[0.98] p-0">
      <div className={`relative flex h-28 items-end bg-gradient-to-br ${VENUE_GRADIENTS[gradientIdx]} p-3`}>
        {venue.photo_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={venue.photo_url}
            alt={venue.name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )}
        <div className="absolute left-3 top-3 z-10">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${typeCls}`}>
            {venue.venue_type}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            haptic("light");
            if (isSaved) onRemove();
            else onSave();
          }}
          disabled={isSaving}
          className={`absolute right-3 top-3 z-10 flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 active:scale-90 ${
            isSaved
              ? "bg-red-500/30 text-red-400"
              : "bg-black/40 text-white/70 hover:text-white"
          }`}
          aria-label={isSaved ? "Remove saved venue" : "Save venue"}
        >
          <Heart className={`h-4 w-4 ${isSaved ? "fill-red-400" : ""}`} />
        </button>
      </div>
      <CardContent className="space-y-1.5 p-3 min-w-0">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <h3 className="text-sm font-semibold font-heading leading-tight truncate">{venue.name}</h3>
          {venue.rating > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="text-xs font-medium text-amber-500">{venue.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{venue.neighbourhood || venue.address}</span>
          {venue.review_count > 0 && (
            <>
              <span className="shrink-0 text-muted-foreground/30">|</span>
              <span className="shrink-0">{venue.review_count.toLocaleString()} reviews</span>
            </>
          )}
        </div>
        {venue.capacity && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{venue.capacity.toLocaleString()}</span> capacity
          </div>
        )}
      </CardContent>
    </Card>
  );
}

