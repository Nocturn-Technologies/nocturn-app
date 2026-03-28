"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProfileCard } from "./profile-card";
import { ContactDialog } from "./contact-dialog";
import {
  searchProfiles,
  getSavedProfiles,
  getNetworkProfiles,
  saveProfile,
  unsaveProfile,
} from "@/app/actions/marketplace";
import { haptic } from "@/lib/haptics";
import { Search, Compass, ChevronLeft, ChevronRight, Users2 } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"discover" | "network">("discover");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profiles, setProfiles] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [savedProfiles, setSavedProfiles] = useState<any[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Network state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [networkProfiles, setNetworkProfiles] = useState<any[]>([]);
  const [networkConnectionTypes, setNetworkConnectionTypes] = useState<Record<string, string[]>>({});
  const [loadingNetwork, setLoadingNetwork] = useState(false);
  const [networkQuery, setNetworkQuery] = useState("");

  const [loadingDiscover, setLoadingDiscover] = useState(true);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const [contactProfile, setContactProfile] = useState<{
    id: string;
    name: string;
    type: string;
    city: string;
  } | null>(null);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [category, query, cityFilter]);

  // ── Fetch discover profiles ────────────────────────────────────────────

  const fetchProfiles = useCallback(async () => {
    setLoadingDiscover(true);
    const result = await searchProfiles({
      type: category === "all" ? null : category,
      query: query.trim() || null,
      city: cityFilter.trim() || null,
      page,
    });
    setProfiles(result.profiles);
    setTotalCount(result.total);
    setLoadingDiscover(false);
  }, [category, query, cityFilter, page]);

  useEffect(() => {
    const timer = setTimeout(fetchProfiles, 200);
    return () => clearTimeout(timer);
  }, [fetchProfiles]);

  // ── Fetch saved profiles ───────────────────────────────────────────────

  const fetchSaved = useCallback(async () => {
    const result = await getSavedProfiles();
    setSavedProfiles(result.profiles);
    // savedIds is a string[] from the server action
    const ids = new Set<string>(result.savedIds ?? []);
    // Also include profile IDs as fallback
    result.profiles.forEach((p) => ids.add((p as { id: string }).id));
    setSavedIds(ids);
  }, []);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  // ── Fetch network profiles ──────────────────────────────────────────

  const fetchNetwork = useCallback(async () => {
    setLoadingNetwork(true);
    setNetworkError(null);
    try {
      const result = await getNetworkProfiles();
      setNetworkProfiles(result.profiles);
      setNetworkConnectionTypes(result.connectionTypes);
    } catch {
      setNetworkError("Failed to load your network. Please try again.");
    } finally {
      setLoadingNetwork(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "network" && networkProfiles.length === 0 && !loadingNetwork) {
      fetchNetwork();
    }
  }, [activeTab, networkProfiles.length, loadingNetwork, fetchNetwork]);

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

  // ── Active profiles to show ────────────────────────────────────────────

  // Filter network by search
  const filteredNetwork = networkQuery.trim()
    ? networkProfiles.filter((p) => {
        const q = networkQuery.toLowerCase();
        return (
          (p.display_name ?? "").toLowerCase().includes(q) ||
          (p.city ?? "").toLowerCase().includes(q) ||
          (p.user_type ?? "").toLowerCase().includes(q)
        );
      })
    : networkProfiles;

  const displayProfiles = activeTab === "discover" ? profiles : filteredNetwork;
  const isLoading = activeTab === "discover" ? loadingDiscover : loadingNetwork;
  const totalPages = Math.ceil(totalCount / PER_PAGE);
  const showPagination = activeTab === "discover" && totalPages > 1;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 overflow-x-hidden">
      {/* Header */}
      <div className="px-4 md:px-0">
        <h1 className="text-xl font-bold">Discover</h1>
        <p className="text-xs text-muted-foreground">
          Find DJs, photographers, venues, and more for your next event
        </p>
      </div>

      {/* Tab toggle: Discover | Your Network */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5 mx-4 md:mx-0 w-fit">
        <button
          onClick={() => setActiveTab("discover")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
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
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
            activeTab === "network"
              ? "bg-nocturn text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users2 className="h-3.5 w-3.5" />
          Network
          {networkProfiles.length > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
              {networkProfiles.length}
            </span>
          )}
        </button>
      </div>

      {/* Category chips — horizontal scroll */}
      {activeTab === "discover" && (
        <div className="-mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  haptic("light");
                  setCategory(tab.value);
                }}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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

      {/* Search + City filters */}
      {activeTab === "discover" && (
        <div className="flex gap-2 px-4 md:px-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search profiles..."
              className="w-full pl-10"
            />
          </div>
          <div className="w-32 md:w-40">
            <Input
              type="text"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              placeholder="City"
            />
          </div>
        </div>
      )}

      {/* Network search */}
      {activeTab === "network" && (
        <div className="px-4 md:px-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={networkQuery}
              onChange={(e) => setNetworkQuery(e.target.value)}
              placeholder="Search your network by name, city, or role..."
              className="w-full pl-10"
            />
          </div>
        </div>
      )}

      {/* Network error */}
      {activeTab === "network" && networkError && (
        <div className="px-4 md:px-0">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-destructive">{networkError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchNetwork}
                className="min-h-[44px]"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Profiles grid */}
      <div className="px-4 md:px-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
          </div>
        ) : displayProfiles.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
                <Compass className="h-10 w-10 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-medium">
                  {activeTab === "network" ? "No connections yet" : "No profiles found"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {activeTab === "network"
                    ? "Save profiles or send inquiries to build your network"
                    : "Try a different search or category"}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayProfiles.map((profile) => (
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
                  connectionTags={activeTab === "network" ? networkConnectionTypes[profile.id] : undefined}
                />
              ))}
            </div>

            {/* Result count */}
            <p className="text-xs text-muted-foreground text-center pt-2">
              {activeTab === "discover"
                ? `${totalCount} ${totalCount === 1 ? "profile" : "profiles"} found${totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}`
                : `${filteredNetwork.length} ${filteredNetwork.length === 1 ? "connection" : "connections"}`}
            </p>

            {/* Pagination */}
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
                  // Show pages around current
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
          </>
        )}
      </div>

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
