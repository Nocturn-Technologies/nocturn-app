"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProfileCard } from "./profile-card";
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
  type DiscoverCollective,
} from "@/app/actions/discover-collectives";
import { startCollabChat } from "@/app/actions/collab";
import { searchVenues, type VenueResult } from "@/lib/venues-api";
import {
  saveVenue as saveVenueAction,
  removeSavedVenue,
  getSavedVenues,
} from "@/app/actions/venues";
import { haptic } from "@/lib/haptics";
import { Search, Compass, ChevronLeft, ChevronRight, Users2, Star, MapPin, Heart } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { NetworkCRM } from "./network-crm";
import { createClient } from "@/lib/supabase/client";

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_TABS = [
  { label: "All", value: "all" },
  { label: "DJs", value: "artist" },
  { label: "Venues", value: "venue" },
  { label: "Collectives", value: "collective" },
  { label: "Promoters", value: "promoter" },
  { label: "Managers", value: "artist_manager" },
  { label: "Tour Mgrs", value: "tour_manager" },
  { label: "Agents", value: "booking_agent" },
  { label: "Photo", value: "photographer" },
  { label: "Video", value: "videographer" },
  { label: "MC / Host", value: "mc_host" },
  { label: "Designers", value: "graphic_designer" },
  { label: "Sound", value: "sound_production" },
  { label: "Lighting", value: "lighting_production" },
  { label: "Staff", value: "event_staff" },
  { label: "PR", value: "pr_publicist" },
  { label: "Sponsors", value: "sponsor" },
];

// ─── Component ──────────────────────────────────────────────────────────────

const PER_PAGE = 20;

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" /></div>}>
      <DiscoverContent />
    </Suspense>
  );
}

function DiscoverContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"discover" | "network">("discover");
  const [collectiveId, setCollectiveId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState(() => {
    const tab = searchParams.get("tab");
    return tab === "venues" ? "venue" : "all";
  });
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Handle ?tab=venues query param changes after mount
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "venues") {
      setCategory("venue");
    }
  }, [searchParams]);

  // Shape of marketplace_profiles rows returned by searchProfiles() — see
  // app/actions/marketplace.ts for the select list. Keeping this local (and
  // indexable by string) matches the `Record<string, unknown>[]` return type
  // without forcing an `any` cast here.
  type DiscoverProfileRow = {
    id: string;
    slug: string;
    display_name: string;
    user_type?: string | null;
    type?: string | null;
    city?: string | null;
    bio?: string | null;
    genres?: string[] | null;
    services?: string[] | null;
    rate_range?: string | null;
    avatar_url?: string | null;
    cover_photo_url?: string | null;
    instagram_handle?: string | null;
    website_url?: string | null;
    soundcloud_url?: string | null;
    spotify_url?: string | null;
  };
  const [profiles, setProfiles] = useState<DiscoverProfileRow[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const [loadingDiscover, setLoadingDiscover] = useState(true);

  // Collectives state (when "Collectives" category chip is active)
  const [collectives, setCollectives] = useState<DiscoverCollective[]>([]);
  const [collectivesTotal, setCollectivesTotal] = useState(0);
  const [loadingCollectives, setLoadingCollectives] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());

  // Venues state (when "Venues" category chip is active)
  const [venues, setVenues] = useState<VenueResult[]>([]);
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [savedVenueIds, setSavedVenueIds] = useState<Set<string>>(new Set());
  const [savingVenueId, setSavingVenueId] = useState<string | null>(null);

  const [contactProfile, setContactProfile] = useState<{
    id: string;
    name: string;
    type: string;
    city: string;
  } | null>(null);

  // Only the "collective" chip should hit the collectives table. The
  // "promoter" chip used to share this branch, which queried the wrong table
  // entirely — promoters live in marketplace_profiles with user_type =
  // "promoter", not in the `collectives` table. Route them through
  // searchProfiles instead so the chip actually returns promoter profiles.
  const isCollectivesCategory = category === "collective";
  const isVenuesCategory = category === "venue";

  // Fetch collectiveId for the current user
  const collectiveIdFetched = useRef(false);
  useEffect(() => {
    if (collectiveIdFetched.current) return;
    collectiveIdFetched.current = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: membership } = await supabase
          .from("collective_members")
          .select("collective_id")
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        if (membership?.collective_id) {
          setCollectiveId(membership.collective_id);
        }
      } catch {
        // Silent fail — collectiveId is optional for NetworkCRM
      }
    })();
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [category, query, cityFilter]);

  // ── Fetch discover profiles (non-collective, non-venue categories) ──────

  const fetchProfiles = useCallback(async () => {
    if (isCollectivesCategory || isVenuesCategory) return; // handled separately
    setLoadingDiscover(true);
    const result = await searchProfiles({
      type: category === "all" ? null : category,
      query: query.trim() || null,
      city: cityFilter.trim() || null,
      page,
    });
    setProfiles(result.profiles as unknown as DiscoverProfileRow[]);
    setTotalCount(result.total);
    setLoadingDiscover(false);
  }, [category, query, cityFilter, page, isCollectivesCategory, isVenuesCategory]);

  useEffect(() => {
    if (!isCollectivesCategory && !isVenuesCategory) {
      const timer = setTimeout(fetchProfiles, 200);
      return () => clearTimeout(timer);
    }
  }, [fetchProfiles, isCollectivesCategory, isVenuesCategory]);

  // ── Fetch collectives (when "Collectives" chip is selected) ──────────

  const fetchCollectives = useCallback(async () => {
    setLoadingCollectives(true);
    const result = await getDiscoverCollectives({
      query: query.trim() || null,
      city: cityFilter.trim() || null,
      page,
    });
    setCollectives(result.collectives);
    setCollectivesTotal(result.total);
    setLoadingCollectives(false);
  }, [query, cityFilter, page]);

  useEffect(() => {
    if (isCollectivesCategory) {
      const timer = setTimeout(fetchCollectives, 200);
      return () => clearTimeout(timer);
    }
  }, [isCollectivesCategory, fetchCollectives]);

  // ── Fetch venues (when "Venues" chip is selected) ───────────────────

  const fetchVenues = useCallback(async () => {
    setLoadingVenues(true);
    const results = await searchVenues(query.trim(), "All");
    setVenues(results);
    setLoadingVenues(false);
  }, [query]);

  useEffect(() => {
    if (isVenuesCategory) {
      const timer = setTimeout(fetchVenues, 200);
      return () => clearTimeout(timer);
    }
  }, [isVenuesCategory, fetchVenues]);

  // ── Fetch saved venue IDs ───────────────────────────────────────────

  const fetchSavedVenues = useCallback(async () => {
    const { venues: list } = await getSavedVenues();
    if (list) {
      setSavedVenueIds(new Set((list as { place_id: string }[]).map((v) => v.place_id)));
    }
  }, []);

  useEffect(() => {
    fetchSavedVenues();
  }, [fetchSavedVenues]);

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

  async function handleConnect(targetCollectiveId: string) {
    if (!collectiveId) return;
    haptic("medium");
    setConnectingId(targetCollectiveId);
    const result = await startCollabChat(collectiveId, targetCollectiveId);
    setConnectingId(null);
    if (!result.error && result.channelId) {
      setConnectedIds((prev) => new Set(prev).add(targetCollectiveId));
      setTimeout(() => {
        router.push(`/dashboard/chat?channel=${result.channelId}`);
      }, 600);
    }
  }

  // ── Fetch saved profiles ───────────────────────────────────────────────

  const fetchSaved = useCallback(async () => {
    const result = await getSavedProfiles();
    const ids = new Set<string>(result.savedIds ?? []);
    result.profiles.forEach((p) => ids.add((p as { id: string }).id));
    setSavedIds(ids);
  }, []);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  // ── Save / unsave handlers ─────────────────────────────────────────────

  async function handleSave(profileId: string) {
    haptic("light");
    setSavedIds((prev) => new Set(prev).add(profileId));
    const { error } = await saveProfile(profileId);
    if (error) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
    } else {
      fetchSaved();
    }
  }

  async function handleUnsave(profileId: string) {
    haptic("light");
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(profileId);
      return next;
    });
    const { error } = await unsaveProfile(profileId);
    if (error) {
      setSavedIds((prev) => new Set(prev).add(profileId));
    } else {
      fetchSaved();
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────

  const currentTotal = isCollectivesCategory ? collectivesTotal : isVenuesCategory ? venues.length : totalCount;
  const totalPages = isVenuesCategory ? 1 : Math.ceil(currentTotal / PER_PAGE);
  const showPagination = totalPages > 1;
  const isLoading = isCollectivesCategory ? loadingCollectives : isVenuesCategory ? loadingVenues : loadingDiscover;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 overflow-x-hidden">
      {/* Header */}
      <div className="px-4 md:px-0">
        <h1 className="text-2xl font-bold font-heading">Discover</h1>
        <p className="text-xs text-muted-foreground">
          Find DJs, collectives, photographers, venues, and more
        </p>
      </div>

      {/* Tab toggle: Discover | My Network */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5 mx-4 md:mx-0 w-fit">
        <button
          onClick={() => setActiveTab("discover")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all min-h-[44px] ${
            activeTab === "discover"
              ? "bg-nocturn text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Compass className="h-3.5 w-3.5" />
          Discover
        </button>
        <button
          onClick={() => setActiveTab("network")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all min-h-[44px] ${
            activeTab === "network"
              ? "bg-nocturn text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users2 className="h-3.5 w-3.5" />
          My Network
        </button>
      </div>

      {/* Category chips — horizontal scroll (discover tab only) */}
      {activeTab === "discover" && (
        <div className="-mx-4 md:mx-0 md:px-0">
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none md:px-0">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  haptic("light");
                  setCategory(tab.value);
                }}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors min-h-[44px] ${
                  category === tab.value
                    ? "bg-nocturn text-white"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search + City filters (discover tab only) */}
      {activeTab === "discover" && (
        <div className="flex gap-2 px-4 md:px-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isCollectivesCategory
                  ? "Search collectives..."
                  : category === "promoter"
                    ? "Search promoters..."
                    : "Search profiles..."
              }
              className="w-full pl-10"
            />
          </div>
          <div className="w-28 sm:w-32 md:w-40">
            <Input
              type="text"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              placeholder="City"
            />
          </div>
        </div>
      )}

      {/* Network CRM */}
      {activeTab === "network" && (
        <div className="px-4 md:px-0">
          <NetworkCRM collectiveId={collectiveId} />
        </div>
      )}

      {/* Results grid — discover tab */}
      {activeTab === "discover" && (
        <div className="px-4 md:px-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
            </div>
          ) : isVenuesCategory ? (
            /* ── Venues results ── */
            venues.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 py-12">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
                    <MapPin className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="text-center max-w-xs">
                    <p className="font-semibold">No venues found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {query ? "Try a different search" : "No venues available"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {venues.map((venue) => (
                    <DiscoverVenueCard
                      key={venue.place_id}
                      venue={venue}
                      isSaved={savedVenueIds.has(venue.place_id)}
                      isSaving={savingVenueId === venue.place_id}
                      onSave={() => handleSaveVenue(venue)}
                      onRemove={() => handleRemoveVenue(venue.place_id)}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground text-center pt-2">
                  {venues.length} venue{venues.length !== 1 ? "s" : ""} in Toronto
                </p>
              </>
            )
          ) : isCollectivesCategory ? (
            /* ── Collectives results ── */
            collectives.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 py-12">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10">
                    <Users2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="text-center max-w-xs">
                    <p className="font-semibold">No collectives found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {query || cityFilter
                        ? "Try a different search or city"
                        : "No other collectives on Nocturn yet"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {collectives.map((collective) => (
                    <CollectiveCard
                      key={collective.id}
                      collective={collective}
                      onConnect={() => handleConnect(collective.id)}
                      isConnecting={connectingId === collective.id}
                      isConnected={connectedIds.has(collective.id)}
                    />
                  ))}
                </div>

                <p className="text-xs text-muted-foreground text-center pt-2">
                  {`${collectivesTotal} ${collectivesTotal === 1 ? "collective" : "collectives"} on Nocturn${
                    totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""
                  }`}
                </p>
              </>
            )
          ) : (
            /* ── Profile results (all other categories) ── */
            profiles.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 py-12">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
                    <Compass className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="text-center max-w-xs">
                    <p className="font-semibold">No profiles found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try a different search or category
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {profiles.map((profile) => (
                    <ProfileCard
                      key={profile.id}
                      profile={profile}
                      isSaved={savedIds.has(profile.id)}
                      onSave={() => handleSave(profile.id)}
                      onUnsave={() => handleUnsave(profile.id)}
                      onContact={() =>
                        setContactProfile({
                          id: profile.id,
                          name: profile.display_name,
                          type: profile.user_type ?? profile.type ?? "artist",
                          city: profile.city ?? "",
                        })
                      }
                      connectionTags={undefined}
                    />
                  ))}
                </div>

                <p className="text-xs text-muted-foreground text-center pt-2">
                  {`${totalCount} ${totalCount === 1 ? "profile" : "profiles"} found${
                    totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""
                  }`}
                </p>
              </>
            )
          )}

          {/* Shared pagination */}
          {showPagination && (
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
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
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
        </div>
      )}

      {/* Contact Dialog */}
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

// ─── Venue Card for Discover ────────────────────────────────────────────────

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
      {/* Photo / gradient header */}
      <div className={`relative flex h-28 items-end bg-gradient-to-br ${VENUE_GRADIENTS[gradientIdx]} p-3`}>
        {venue.photo_url && (
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
            isSaved ? onRemove() : onSave();
          }}
          disabled={isSaving}
          className={`absolute right-3 top-3 z-10 flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 active:scale-90 ${
            isSaved
              ? "bg-red-500/30 text-red-400"
              : "bg-black/40 text-white/70 hover:text-white"
          }`}
        >
          <Heart className={`h-4 w-4 ${isSaved ? "fill-red-400" : ""}`} />
        </button>
      </div>

      {/* Info */}
      <CardContent className="space-y-1.5 p-3 min-w-0">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <h3 className="text-sm font-semibold leading-tight truncate">{venue.name}</h3>
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
