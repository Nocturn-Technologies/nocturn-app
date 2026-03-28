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
  saveProfile,
  unsaveProfile,
} from "@/app/actions/marketplace";
import { haptic } from "@/lib/haptics";
import { Search, Compass, ChevronLeft, ChevronRight } from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_TABS = [
  { label: "All", value: "all" },
  { label: "DJs", value: "artist" },
  { label: "Venues", value: "venue" },
  { label: "Collectives", value: "collective" },
  { label: "Promoters", value: "promoter" },
  { label: "Photo", value: "photographer" },
  { label: "Video", value: "videographer" },
  { label: "Sound", value: "sound_production" },
  { label: "Lighting", value: "lighting_production" },
  { label: "Sponsors", value: "sponsor" },
];

// ─── Component ──────────────────────────────────────────────────────────────

const PER_PAGE = 20;

export default function DiscoverPage() {
  const [activeTab, setActiveTab] = useState<"discover" | "saved">("discover");
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

  const [loadingDiscover, setLoadingDiscover] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(false);

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
    setLoadingSaved(true);
    const result = await getSavedProfiles();
    setSavedProfiles(result.profiles);
    // Convert Set from server to client Set
    const ids = new Set<string>();
    if (result.savedIds) {
      // savedIds comes as a Set but gets serialized — handle both
      if (result.savedIds instanceof Set) {
        result.savedIds.forEach((id: string) => ids.add(id));
      } else if (Array.isArray(result.savedIds)) {
        (result.savedIds as string[]).forEach((id) => ids.add(id));
      }
    }
    // Also build from profiles as fallback
    result.profiles.forEach((p) => ids.add((p as { id: string }).id));
    setSavedIds(ids);
    setLoadingSaved(false);
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

  // ── Active profiles to show ────────────────────────────────────────────

  const displayProfiles = activeTab === "discover" ? profiles : savedProfiles;
  const isLoading = activeTab === "discover" ? loadingDiscover : loadingSaved;
  const totalPages = Math.ceil(totalCount / PER_PAGE);
  const showPagination = activeTab === "discover" && totalPages > 1;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 overflow-x-hidden">
      {/* Header */}
      <div className="px-4 md:px-0">
        <h1 className="text-2xl font-bold">Discover</h1>
        <p className="text-sm text-muted-foreground">
          Find DJs, photographers, venues, and more for your next event
        </p>
      </div>

      {/* Tab toggle: Discover | Saved */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 mx-4 md:mx-0">
        <button
          onClick={() => setActiveTab("discover")}
          className={`flex-1 rounded-md py-2 text-sm font-semibold transition-all min-h-[44px] ${
            activeTab === "discover"
              ? "bg-nocturn text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Discover
        </button>
        <button
          onClick={() => setActiveTab("saved")}
          className={`flex-1 rounded-md py-2 text-sm font-semibold transition-all min-h-[44px] ${
            activeTab === "saved"
              ? "bg-nocturn text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Saved
          {savedIds.size > 0 && (
            <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
              {savedIds.size}
            </span>
          )}
        </button>
      </div>

      {/* Category chips — horizontal scroll */}
      {activeTab === "discover" && (
        <div className="-mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  haptic("light");
                  setCategory(tab.value);
                }}
                className={`shrink-0 rounded-full px-4 min-h-[44px] text-sm font-medium transition-colors ${
                  category === tab.value
                    ? "bg-nocturn text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground"
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
                <p className="font-medium">No profiles found</p>
                <p className="text-sm text-muted-foreground">
                  {activeTab === "saved"
                    ? "Save profiles from Discover to see them here"
                    : "Try a different search or category"}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                />
              ))}
            </div>

            {/* Result count */}
            <p className="text-xs text-muted-foreground text-center pt-2">
              {totalCount} {totalCount === 1 ? "profile" : "profiles"} found
              {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
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
