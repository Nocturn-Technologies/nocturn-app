"use client";

import { useCallback, useEffect, useState } from "react";
import {
  saveVenue as saveVenueAction,
  removeSavedVenue,
  getSavedVenues,
} from "@/app/actions/venues";
import { searchVenues, type VenueResult, type VenueType } from "@/lib/venues-api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { haptic } from "@/lib/haptics";
import { getDistance, formatDistance } from "@/lib/geo";
import { VenueScout } from "@/components/venue-scout";
import {
  Search,
  Heart,
  Star,
  MapPin,
  Phone,
  Globe,
  Clock,
  Users,
  Navigation,
  Trash2,
  Bookmark,
  X,
  Locate,
  ClipboardList,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = "discover" | "saved";
type FilterChip = "All" | VenueType;

interface SavedVenue {
  id: string;
  place_id: string;
  name: string;
  address: string | null;
  neighbourhood: string | null;
  venue_type: string | null;
  rating: number | null;
  review_count: number | null;
  phone: string | null;
  website: string | null;
  capacity: number | null;
  photo_url: string | null;
  hours: { day: string; open: string; close: string }[] | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FILTERS: FilterChip[] = ["All", "Club", "Bar", "Warehouse", "Gallery", "Rooftop", "Live Music", "Underground"];

const TYPE_COLORS: Record<string, string> = {
  Club: "bg-purple-500/20 text-purple-300",
  Bar: "bg-amber-500/20 text-amber-300",
  Warehouse: "bg-emerald-500/20 text-emerald-300",
  Gallery: "bg-pink-500/20 text-pink-300",
  Rooftop: "bg-sky-500/20 text-sky-300",
  "Live Music": "bg-orange-500/20 text-orange-300",
  Underground: "bg-red-500/20 text-red-300",
};

const GRADIENT_COLORS = [
  "from-nocturn/60 to-purple-900/40",
  "from-indigo-600/50 to-blue-900/40",
  "from-pink-600/50 to-rose-900/40",
  "from-emerald-600/50 to-teal-900/40",
  "from-amber-600/50 to-orange-900/40",
  "from-sky-600/50 to-cyan-900/40",
];

function gradientForIndex(i: number) {
  return GRADIENT_COLORS[i % GRADIENT_COLORS.length];
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function VenuesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("discover");

  // Discover state
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterChip>("All");
  const [venues, setVenues] = useState<VenueResult[]>([]);
  const [loadingDiscover, setLoadingDiscover] = useState(true);

  // Saved state
  const [savedVenues, setSavedVenues] = useState<SavedVenue[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Detail sheet
  const [selectedVenue, setSelectedVenue] = useState<VenueResult | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Saving animation
  const [savingId, setSavingId] = useState<string | null>(null);

  // Location state
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [_locationDenied, setLocationDenied] = useState(false);
  const [nearbyVenue, setNearbyVenue] = useState<SavedVenue | null>(null);
  const [scoutingVenue, setScoutingVenue] = useState<{ placeId: string; name: string } | null>(null);

  // ── Request geolocation ────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        setLocationDenied(true);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // ── Check if user is near a saved venue (within 200m) ──────────────────
  useEffect(() => {
    if (!userLocation || savedVenues.length === 0) {
      setNearbyVenue(null);
      return;
    }
    for (const sv of savedVenues) {
      if (sv.latitude != null && sv.longitude != null) {
        const dist = getDistance(userLocation.lat, userLocation.lon, sv.latitude, sv.longitude);
        if (dist <= 0.2) {
          setNearbyVenue(sv);
          return;
        }
      }
    }
    setNearbyVenue(null);
  }, [userLocation, savedVenues]);

  // ── Sort discover venues by distance when location available ───────────
  const venuesSorted = userLocation
    ? [...venues].sort((a, b) => {
        const da = getDistance(userLocation.lat, userLocation.lon, a.latitude, a.longitude);
        const db = getDistance(userLocation.lat, userLocation.lon, b.latitude, b.longitude);
        return da - db;
      })
    : venues;

  const savedVenuesSorted = userLocation
    ? [...savedVenues].sort((a, b) => {
        if (a.latitude == null || a.longitude == null) return 1;
        if (b.latitude == null || b.longitude == null) return -1;
        const da = getDistance(userLocation.lat, userLocation.lon, a.latitude, a.longitude);
        const db = getDistance(userLocation.lat, userLocation.lon, b.latitude, b.longitude);
        return da - db;
      })
    : savedVenues;

  // ── Discover search ──────────────────────────────────────────────────────

  const fetchVenues = useCallback(async () => {
    setLoadingDiscover(true);
    const results = await searchVenues(query, filter);
    setVenues(results);
    setLoadingDiscover(false);
  }, [query, filter]);

  useEffect(() => {
    const timer = setTimeout(fetchVenues, 200);
    return () => clearTimeout(timer);
  }, [fetchVenues]);

  // ── Saved venues ─────────────────────────────────────────────────────────

  const fetchSavedVenues = useCallback(async () => {
    setLoadingSaved(true);
    const { venues: list } = await getSavedVenues();
    const typed = (list ?? []) as SavedVenue[];
    setSavedVenues(typed);
    setSavedIds(new Set(typed.map((v) => v.place_id)));
    setLoadingSaved(false);
  }, []);

  useEffect(() => {
    fetchSavedVenues();
  }, [fetchSavedVenues]);

  // ── Save / Remove ────────────────────────────────────────────────────────

  async function handleSave(venue: VenueResult) {
    if (savingId) return;
    haptic('light');
    setSavingId(venue.place_id);
    const { error } = await saveVenueAction(venue);
    if (!error) {
      setSavedIds((prev) => new Set(prev).add(venue.place_id));
      fetchSavedVenues();
    }
    setSavingId(null);
  }

  async function handleRemove(placeId: string) {
    if (savingId) return;
    setSavingId(placeId);
    await removeSavedVenue(placeId);
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(placeId);
      return next;
    });
    setSavedVenues((prev) => prev.filter((v) => v.place_id !== placeId));
    setSavingId(null);
  }

  // ── Detail sheet ─────────────────────────────────────────────────────────

  function openDetail(venue: VenueResult) {
    setSelectedVenue(venue);
    setSheetOpen(true);
  }

  function openDirections(venue: VenueResult) {
    const q = encodeURIComponent(venue.address || venue.name);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${q}`, "_blank");
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 overflow-x-hidden animate-in fade-in duration-300 max-w-6xl mx-auto">
      {/* Header */}
      <div className="px-4 md:px-0">
        <h1 className="text-2xl font-bold font-heading">Venues</h1>
        <p className="text-sm text-muted-foreground">
          Discover and save venues for your events
        </p>
      </div>

      {/* Check-in banner — shown when within 200m of a saved venue */}
      {nearbyVenue && (
        <div className="mx-4 md:mx-0 rounded-xl border border-nocturn/30 bg-nocturn/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Locate className="h-5 w-5 text-nocturn" />
            <span className="font-semibold">
              You&apos;re at {nearbyVenue.name}!
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-nocturn hover:bg-nocturn-light text-white min-h-[44px] active:scale-95 transition-all duration-200"
              onClick={() =>
                setScoutingVenue({ placeId: nearbyVenue.place_id, name: nearbyVenue.name })
              }
            >
              <ClipboardList className="mr-2 h-3.5 w-3.5" />
              Start Scouting
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px] active:scale-95 transition-all duration-200"
              onClick={() => {
                const sv = nearbyVenue;
                openDetail({
                  place_id: sv.place_id,
                  name: sv.name,
                  venue_type: (sv.venue_type as VenueType) ?? "Club",
                  neighbourhood: sv.neighbourhood ?? "",
                  address: sv.address ?? "",
                  city: sv.city ?? "Toronto",
                  rating: sv.rating ?? 0,
                  review_count: sv.review_count ?? 0,
                  phone: sv.phone ?? "",
                  website: sv.website ?? "",
                  capacity: sv.capacity,
                  latitude: sv.latitude ?? 0,
                  longitude: sv.longitude ?? 0,
                  photo_url: sv.photo_url,
                  hours: sv.hours,
                });
              }}
            >
              <Users className="mr-2 h-3.5 w-3.5" />
              Check Capacity
            </Button>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 mx-4 md:mx-0">
        <TabButton
          active={activeTab === "discover"}
          onClick={() => setActiveTab("discover")}
          label="Discover"
        />
        <TabButton
          active={activeTab === "saved"}
          onClick={() => setActiveTab("saved")}
          label="My Venues"
          count={savedIds.size}
        />
      </div>

      {/* ── Discover tab ─────────────────────────────────────────────────── */}
      {activeTab === "discover" && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="px-4 md:px-0">
            <div className="relative md:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search venues in Toronto..."
                className="w-full pl-10 pr-10"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-muted-foreground hover:bg-muted-foreground/30 active:scale-90 transition-all duration-200"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Filter chips — horizontal scroll within screen bounds */}
          <div className="-mx-4 px-4 md:mx-0 md:px-0">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 min-h-[44px] active:scale-95 ${
                    filter === f
                      ? "bg-nocturn text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Venue list — single column mobile, 2-col md+ */}
          <div className="px-4 md:px-0">
            {loadingDiscover ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <VenueCardSkeleton key={i} />
                ))}
              </div>
            ) : venues.length === 0 ? (
              <EmptyState
                icon={<Search className="h-10 w-10 text-muted-foreground" />}
                title="No venues found"
                subtitle="Try a different search or filter"
                ctaLabel="Clear Search"
                onCta={() => { setQuery(""); setFilter("All"); }}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {venuesSorted.map((venue, i) => (
                  <VenueCard
                    key={venue.place_id}
                    venue={venue}
                    index={i}
                    isSaved={savedIds.has(venue.place_id)}
                    isSaving={savingId === venue.place_id}
                    onTap={() => openDetail(venue)}
                    onSave={() => handleSave(venue)}
                    onRemove={() => handleRemove(venue.place_id)}
                    distance={
                      userLocation
                        ? getDistance(userLocation.lat, userLocation.lon, venue.latitude, venue.longitude)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Saved tab ────────────────────────────────────────────────────── */}
      {activeTab === "saved" && (
        <div className="space-y-4 px-4 md:px-0">
          {loadingSaved ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SavedVenueCardSkeleton key={i} />
              ))}
            </div>
          ) : savedVenues.length === 0 ? (
            <EmptyState
              icon={<Bookmark className="h-10 w-10 text-muted-foreground" />}
              title="No saved venues yet"
              subtitle="Save venues from Discover to build your go-to list"
              ctaLabel="Discover Venues"
              onCta={() => setActiveTab("discover")}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {savedVenuesSorted.map((sv, i) => (
                <SavedVenueCard
                  key={sv.id}
                  venue={sv}
                  index={i}
                  isSaving={savingId === sv.place_id}
                  distance={
                    userLocation && sv.latitude != null && sv.longitude != null
                      ? getDistance(userLocation.lat, userLocation.lon, sv.latitude, sv.longitude)
                      : undefined
                  }
                  onScout={() =>
                    setScoutingVenue({ placeId: sv.place_id, name: sv.name })
                  }
                  onTap={() =>
                    openDetail({
                      place_id: sv.place_id,
                      name: sv.name,
                      venue_type: (sv.venue_type as VenueType) ?? "Club",
                      neighbourhood: sv.neighbourhood ?? "",
                      address: sv.address ?? "",
                      city: sv.city ?? "Toronto",
                      rating: sv.rating ?? 0,
                      review_count: sv.review_count ?? 0,
                      phone: sv.phone ?? "",
                      website: sv.website ?? "",
                      capacity: sv.capacity,
                      latitude: sv.latitude ?? 0,
                      longitude: sv.longitude ?? 0,
                      photo_url: sv.photo_url,
                      hours: sv.hours,
                    })
                  }
                  onRemove={() => handleRemove(sv.place_id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Detail sheet — bottom on mobile, right on desktop ──────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        {/* Mobile: bottom sheet */}
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-2xl md:hidden"
        >
          {selectedVenue && (
            <VenueDetailContent
              venue={selectedVenue}
              savedIds={savedIds}
              savingId={savingId}
              onSave={() => handleSave(selectedVenue)}
              onRemove={() => handleRemove(selectedVenue.place_id)}
              onDirections={() => openDirections(selectedVenue)}
            />
          )}
        </SheetContent>
        {/* Desktop: right panel */}
        <SheetContent
          side="right"
          className="hidden w-full sm:max-w-md overflow-y-auto md:flex md:flex-col"
        >
          {selectedVenue && (
            <VenueDetailContent
              venue={selectedVenue}
              savedIds={savedIds}
              savingId={savingId}
              onSave={() => handleSave(selectedVenue)}
              onRemove={() => handleRemove(selectedVenue.place_id)}
              onDirections={() => openDirections(selectedVenue)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Venue Scout Modal */}
      {scoutingVenue && (
        <VenueScout
          venuePlaceId={scoutingVenue.placeId}
          venueName={scoutingVenue.name}
          onClose={() => setScoutingVenue(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function VenueDetailContent({
  venue,
  savedIds,
  savingId,
  onSave,
  onRemove,
  onDirections,
}: {
  venue: VenueResult;
  savedIds: Set<string>;
  savingId: string | null;
  onSave: () => void;
  onRemove: () => void;
  onDirections: () => void;
}) {
  const isSaved = savedIds.has(venue.place_id);
  const isSaving = savingId === venue.place_id;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-lg font-bold truncate pr-8">
          {venue.name}
        </SheetTitle>
        <SheetDescription className="flex items-center gap-2">
          <TypeBadge type={venue.venue_type} />
          <span className="truncate">{venue.neighbourhood}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5 px-4 pb-6">
        {/* Rating bar */}
        <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
          <div className="flex items-center gap-1.5">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            <span className="text-lg font-bold text-amber-500">
              {venue.rating.toFixed(1)}
            </span>
          </div>
          <span className="text-sm text-muted-foreground">
            {venue.review_count.toLocaleString()} reviews
          </span>
          {venue.capacity && (
            <div className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{venue.capacity.toLocaleString()} cap</span>
            </div>
          )}
        </div>

        {/* Details list */}
        <div className="space-y-3">
          <DetailRow icon={MapPin} label={venue.address} />
          {venue.phone && (
            <DetailRow icon={Phone} label={venue.phone} />
          )}
          {venue.website && (
            <DetailRow
              icon={Globe}
              label={venue.website.replace(/^https?:\/\//, "")}
              href={venue.website}
            />
          )}
          {venue.hours && venue.hours.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Hours</span>
              </div>
              <div className="ml-[26px] space-y-0.5">
                {venue.hours.map((h) => (
                  <div
                    key={h.day}
                    className="flex justify-between text-xs text-muted-foreground"
                  >
                    <span>{h.day}</span>
                    <span>
                      {h.open} - {h.close}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => (isSaved ? onRemove() : onSave())}
            disabled={isSaving}
            className={`flex-1 min-h-[44px] active:scale-95 transition-all duration-200 ${
              isSaved
                ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                : "bg-nocturn hover:bg-nocturn-light text-white"
            }`}
            variant={isSaved ? "outline" : "default"}
          >
            {isSaving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : isSaved ? (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </>
            ) : (
              <>
                <Heart className="mr-2 h-4 w-4" />
                Save to My Venues
              </>
            )}
          </Button>
          <Button variant="secondary" className="min-h-[44px] active:scale-95 transition-all duration-200" onClick={onDirections}>
            <Navigation className="mr-2 h-4 w-4" />
            Directions
          </Button>
        </div>
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md py-2 text-sm font-semibold transition-all duration-200 min-h-[44px] active:scale-95 ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {count != null && count > 0 && (
        <span className="ml-1.5 rounded-full bg-nocturn/20 px-1.5 py-0.5 text-xs text-nocturn">
          {count}
        </span>
      )}
    </button>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      <span className="text-xs font-medium text-amber-500">{rating.toFixed(1)}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_COLORS[type] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {type}
    </span>
  );
}

function VenueCard({
  venue,
  index,
  isSaved,
  isSaving,
  onTap,
  onSave,
  onRemove,
  distance,
}: {
  venue: VenueResult;
  index: number;
  isSaved: boolean;
  isSaving: boolean;
  onTap: () => void;
  onSave: () => void;
  onRemove: () => void;
  distance?: number;
}) {
  return (
    <Card
      className="cursor-pointer overflow-hidden rounded-2xl transition-all duration-200 hover:border-nocturn/30 active:scale-[0.98] p-0"
      onClick={onTap}
    >
      {/* Photo placeholder gradient */}
      <div
        className={`relative flex h-32 items-end bg-gradient-to-br ${gradientForIndex(index)} p-3`}
      >
        <div className="absolute left-3 top-3">
          <TypeBadge type={venue.venue_type} />
        </div>
        <div className="absolute right-3 top-3">
          <HeartButton
            filled={isSaved}
            loading={isSaving}
            onClick={(e) => {
              e.stopPropagation();
              isSaved ? onRemove() : onSave();
            }}
          />
        </div>
        {distance != null && (
          <div className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {formatDistance(distance)}
          </div>
        )}
      </div>

      {/* Info */}
      <CardContent className="space-y-1.5 p-3 min-w-0">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <h3 className="text-base font-semibold leading-tight truncate">{venue.name}</h3>
          <RatingStars rating={venue.rating} />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{venue.neighbourhood}</span>
          {venue.review_count > 0 && (
            <>
              <span className="shrink-0 text-muted-foreground/30">|</span>
              <span className="shrink-0">{venue.review_count.toLocaleString()} reviews</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SavedVenueCard({
  venue,
  index,
  isSaving,
  distance,
  onTap,
  onRemove,
  onScout,
}: {
  venue: SavedVenue;
  index: number;
  isSaving: boolean;
  distance?: number;
  onTap: () => void;
  onRemove: () => void;
  onScout: () => void;
}) {
  return (
    <Card
      className="cursor-pointer rounded-2xl transition-all duration-200 hover:border-nocturn/30 active:scale-[0.98]"
      onClick={onTap}
    >
      <CardContent className="flex items-center gap-3 p-3">
        {/* Mini gradient thumbnail */}
        <div
          className={`h-14 w-14 shrink-0 rounded-lg bg-gradient-to-br ${gradientForIndex(index)} flex items-end justify-center`}
        >
          {distance != null && (
            <span className="mb-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
              {formatDistance(distance)}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="truncate text-sm font-semibold">{venue.name}</h3>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {venue.venue_type && <TypeBadge type={venue.venue_type} />}
            <span className="truncate">{venue.neighbourhood}</span>
          </div>
          {venue.rating && <RatingStars rating={venue.rating} />}
        </div>

        {/* Scout button (shown when nearby) */}
        {distance != null && distance <= 0.5 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onScout();
            }}
            className="shrink-0 text-nocturn hover:bg-nocturn/10 hover:text-nocturn min-h-[44px] min-w-[44px]"
            title="Scout this venue"
            aria-label="Scout this venue"
          >
            <ClipboardList className="h-4 w-4" />
          </Button>
        )}

        {/* Remove button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={isSaving}
          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive min-h-[44px] min-w-[44px]"
          aria-label="Remove from saved venues"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function HeartButton({
  filled,
  loading,
  onClick,
}: {
  filled: boolean;
  loading: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      aria-label={filled ? "Remove from saved venues" : "Save venue"}
      aria-pressed={filled}
      className={`flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nocturn focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        filled
          ? "bg-red-500/30 text-red-400"
          : "bg-black/40 text-white/70 hover:text-white"
      }`}
    >
      <Heart className={`h-4 w-4 ${filled ? "fill-red-400" : ""}`} />
    </button>
  );
}

function DetailRow({
  icon: Icon,
  label,
  href,
}: {
  icon: typeof MapPin;
  label: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-start gap-2.5 text-sm min-w-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className={`break-words min-w-0 ${href ? "text-nocturn" : "text-foreground"}`}>{label}</span>
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block rounded-lg px-1 -mx-1 transition-colors duration-200 hover:bg-accent">
        {content}
      </a>
    );
  }
  return content;
}

function VenueCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="h-32 bg-muted animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <div className="h-3 w-10 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}

function SavedVenueCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border p-3 flex items-center gap-3">
      <div className="h-14 w-14 shrink-0 rounded-lg bg-muted animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-28 rounded bg-muted animate-pulse" />
        <div className="h-3 w-20 rounded bg-muted animate-pulse" />
      </div>
      <div className="h-8 w-8 rounded bg-muted animate-pulse" />
    </div>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex flex-col items-center gap-4 py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
          {icon}
        </div>
        <div className="text-center">
          <p className="font-bold">{title}</p>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {ctaLabel && onCta && (
          <Button
            onClick={onCta}
            className="bg-nocturn hover:bg-nocturn-light text-white active:scale-95 transition-all duration-200 min-h-[44px]"
          >
            {ctaLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
