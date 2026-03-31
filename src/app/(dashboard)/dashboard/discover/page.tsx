"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { haptic } from "@/lib/haptics";
import { Search, Compass, ChevronLeft, ChevronRight, Users2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"discover" | "network">("discover");
  const [collectiveId, setCollectiveId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profiles, setProfiles] = useState<any[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const [loadingDiscover, setLoadingDiscover] = useState(true);

  // Collectives state (when "Collectives" category chip is active)
  const [collectives, setCollectives] = useState<DiscoverCollective[]>([]);
  const [collectivesTotal, setCollectivesTotal] = useState(0);
  const [loadingCollectives, setLoadingCollectives] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());

  const [contactProfile, setContactProfile] = useState<{
    id: string;
    name: string;
    type: string;
    city: string;
  } | null>(null);

  const isCollectivesCategory = category === "collective";

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

  // ── Fetch discover profiles (non-collective categories) ──────────────

  const fetchProfiles = useCallback(async () => {
    if (isCollectivesCategory) return; // handled separately
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
  }, [category, query, cityFilter, page, isCollectivesCategory]);

  useEffect(() => {
    if (!isCollectivesCategory) {
      const timer = setTimeout(fetchProfiles, 200);
      return () => clearTimeout(timer);
    }
  }, [fetchProfiles, isCollectivesCategory]);

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

  const currentTotal = isCollectivesCategory ? collectivesTotal : totalCount;
  const totalPages = Math.ceil(currentTotal / PER_PAGE);
  const showPagination = totalPages > 1;
  const isLoading = isCollectivesCategory ? loadingCollectives : loadingDiscover;

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
        <div className="-mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
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
              placeholder={isCollectivesCategory ? "Search collectives..." : "Search profiles..."}
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
