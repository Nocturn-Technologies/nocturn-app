"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createMarketplaceProfile } from "@/app/actions/marketplace";
import { importProfileFromUrl, type ImportedProfileData } from "@/app/actions/import-profile";
import {
  GENRE_OPTIONS,
  SERVICES_BY_TYPE,
  TYPE_LABELS,
  TYPE_BADGE_COLORS,
} from "@/lib/marketplace-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  Check,
  ArrowLeft,
  Plus,
  X,
  Download,
  Loader2,
  Edit3,
  Link2,
} from "lucide-react";
import { NocturnLogo } from "@/components/nocturn-logo";
import { MarketplaceConnect } from "@/components/onboarding/marketplace-connect";

type Step = "import" | "review" | "connect" | "creating" | "done";

const STORAGE_KEY = "nocturn_marketplace_onboarding";

interface SavedMarketplaceProgress {
  step: Step;
  displayName: string;
  city: string;
  bio: string;
  instagram: string;
  selectedTags: string[];
  rateRange: string;
  availability: string;
  portfolioUrls: string[];
  pastVenues: string;
  soundcloudUrl: string;
  websiteUrl: string;
  importUrl: string;
}

function saveMarketplaceProgress(data: SavedMarketplaceProgress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function clearMarketplaceProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export default function MarketplaceOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [authChecked, setAuthChecked] = useState(false);
  const [step, setStep] = useState<Step>("import");
  const [userType, setUserType] = useState<string>("");
  const [_fullName, setFullName] = useState("");

  // Import state
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Profile fields (populated from import or manual entry)
  const [displayName, setDisplayName] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [instagram, setInstagram] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [rateRange, setRateRange] = useState("");
  const [availability, setAvailability] = useState("");
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([""]);
  const [pastVenues, setPastVenues] = useState("");
  const [soundcloudUrl, setSoundcloudUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_profileSlug, setProfileSlug] = useState<string | null>(null);

  // Editing mode on review screen
  const [editing, setEditing] = useState(false);

  // Restore progress from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data: SavedMarketplaceProgress = JSON.parse(saved);
        if (data.displayName) setDisplayName(data.displayName);
        if (data.city) setCity(data.city);
        if (data.bio) setBio(data.bio);
        if (data.instagram) setInstagram(data.instagram);
        if (data.selectedTags?.length) setSelectedTags(data.selectedTags);
        if (data.rateRange) setRateRange(data.rateRange);
        if (data.availability) setAvailability(data.availability);
        if (data.portfolioUrls?.length) setPortfolioUrls(data.portfolioUrls);
        if (data.pastVenues) setPastVenues(data.pastVenues);
        if (data.soundcloudUrl) setSoundcloudUrl(data.soundcloudUrl);
        if (data.websiteUrl) setWebsiteUrl(data.websiteUrl);
        if (data.importUrl) setImportUrl(data.importUrl);
        // Restore to step (but not terminal steps)
        if (data.step && data.step !== "creating" && data.step !== "done" && data.step !== "connect") {
          setStep(data.step);
        }
      }
    } catch {}
  }, []);

  // Save progress whenever state changes (skip terminal steps)
  useEffect(() => {
    if (step === "creating" || step === "done" || step === "connect") return;
    saveMarketplaceProgress({
      step,
      displayName,
      city,
      bio,
      instagram,
      selectedTags,
      rateRange,
      availability,
      portfolioUrls,
      pastVenues,
      soundcloudUrl,
      websiteUrl,
      importUrl,
    });
  }, [step, displayName, city, bio, instagram, selectedTags, rateRange, availability, portfolioUrls, pastVenues, soundcloudUrl, websiteUrl, importUrl]);

  // Fetch user info on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setFullName(user.user_metadata?.full_name ?? "");
      // Only set displayName from user metadata if not already restored from localStorage
      setDisplayName((prev) => prev || (user.user_metadata?.full_name ?? ""));
      setUserType(user.user_metadata?.user_type ?? "artist");
      setAuthChecked(true);
    });
  }, [supabase, router]);

  const isArtist = userType === "artist";
  const tagOptions = isArtist
    ? [...GENRE_OPTIONS]
    : SERVICES_BY_TYPE[userType] ?? [];
  const tagLabel = isArtist ? "Genres" : "Services";
  const typeLabel = TYPE_LABELS[userType] ?? userType;
  const badgeColor = TYPE_BADGE_COLORS[userType] ?? "bg-accent text-muted-foreground";

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function addPortfolioSlot() {
    if (portfolioUrls.length < 5) {
      setPortfolioUrls((prev) => [...prev, ""]);
    }
  }

  function removePortfolioSlot(index: number) {
    setPortfolioUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePortfolioUrl(index: number, value: string) {
    setPortfolioUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  // Import from URL
  const handleImport = useCallback(async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportError(null);

    const result = await importProfileFromUrl(importUrl.trim(), userType);

    if (result.error) {
      setImportError(result.error);
      setImporting(false);
      return;
    }

    if (result.data) {
      applyImportData(result.data);
    }

    setImporting(false);
    setStep("review");
  }, [importUrl, userType]);

  function applyImportData(data: ImportedProfileData) {
    if (data.displayName) setDisplayName(data.displayName);
    if (data.bio) setBio(data.bio);
    if (data.city) setCity(data.city);
    if (data.instagramHandle) setInstagram(`@${data.instagramHandle.replace(/^@/, "")}`);
    if (data.soundcloudUrl) setSoundcloudUrl(data.soundcloudUrl);
    if (data.websiteUrl) setWebsiteUrl(data.websiteUrl);
    if (data.rateRange) setRateRange(data.rateRange);
    if (data.availability) setAvailability(data.availability);
    if (data.genres && data.genres.length > 0) setSelectedTags(data.genres);
    if (data.services && data.services.length > 0) setSelectedTags(data.services);
    if (data.portfolioUrls && data.portfolioUrls.length > 0) setPortfolioUrls(data.portfolioUrls);
    if (data.pastVenues && data.pastVenues.length > 0) setPastVenues(data.pastVenues.join(", "));
  }

  // Skip import → go straight to review with empty fields
  function handleSkipImport() {
    setStep("review");
  }

  // Create profile
  async function handleCreate() {
    if (!displayName.trim()) return;

    setSaving(true);
    setError(null);
    setStep("creating");

    const validUrls = portfolioUrls.filter((u) => u.trim());
    const venueList = pastVenues
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    const result = await createMarketplaceProfile({
      displayName: displayName.trim(),
      city: city.trim() || undefined,
      bio: bio.trim() || undefined,
      instagramHandle: instagram.replace(/^@/, "").trim() || undefined,
      soundcloudUrl: soundcloudUrl.trim() || undefined,
      websiteUrl: websiteUrl.trim() || undefined,
      genres: isArtist && selectedTags.length > 0 ? selectedTags : undefined,
      services: !isArtist && selectedTags.length > 0 ? selectedTags : undefined,
      rateRange: rateRange.trim() || undefined,
      availability: availability.trim() || undefined,
      portfolioUrls: validUrls.length > 0 ? validUrls : undefined,
      pastVenues: venueList.length > 0 ? venueList : undefined,
    });

    setSaving(false);

    if (result.error) {
      setError(result.error);
      setStep("review");
      return;
    }

    setProfileSlug(result.slug);
    clearMarketplaceProgress();
    setStep("connect");
  }

  // Progress indicator
  const stepNumber = step === "import" ? 1 : step === "review" || step === "creating" ? 2 : 3;

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-nocturn border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <NocturnLogo size="md" />
        </div>

        {/* Progress dots */}
        {step !== "done" && (
          <div className="flex justify-center gap-2">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  n === stepNumber
                    ? "w-6 bg-nocturn"
                    : n < stepNumber
                    ? "w-1.5 bg-nocturn/50"
                    : "w-1.5 bg-accent"
                }`}
              />
            ))}
          </div>
        )}

        <div className="space-y-4 min-h-[400px]">
          {/* ─── SCREEN 1: IMPORT ─── */}
          {step === "import" && (
            <>
              <div className="text-center space-y-2 mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-nocturn/10 text-nocturn">
                  <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${badgeColor}`}>
                    {typeLabel}
                  </span>
                </div>
                <h2 className="text-xl font-bold font-heading">Set up your profile</h2>
                <p className="text-sm text-muted-foreground">
                  Drop a link and we&apos;ll pull your info automatically.
                </p>
              </div>

              {/* Import URL input */}
              <div className="space-y-3">
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="instagram.com/yourname or soundcloud.com/yourname"
                    value={importUrl}
                    onChange={(e) => {
                      setImportUrl(e.target.value);
                      setImportError(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleImport()}
                    className="pl-10 text-base h-12"
                    autoFocus
                  />
                </div>

                {importError && (
                  <p className="text-sm text-destructive">{importError}</p>
                )}

                <Button
                  onClick={handleImport}
                  disabled={importing || !importUrl.trim()}
                  className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base"
                >
                  {importing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reading your profile...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Import Profile
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-3 py-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <button
                onClick={handleSkipImport}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                Fill in manually →
              </button>
            </>
          )}

          {/* ─── SCREEN 2: REVIEW / EDIT PROFILE ─── */}
          {(step === "review" || step === "creating") && (
            <>
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setStep("import")}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back
                </button>
                <h2 className="text-lg font-bold">
                  {editing ? "Edit your profile" : "This you?"}
                </h2>
                <button
                  onClick={() => setEditing(!editing)}
                  className="flex items-center gap-1 text-xs text-nocturn hover:underline"
                >
                  <Edit3 className="h-3 w-3" />
                  {editing ? "Preview" : "Edit"}
                </button>
              </div>

              {!editing ? (
                /* ── Preview Card ── */
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  {/* Card header with name + type badge */}
                  <div className="p-5 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/20 text-nocturn font-bold text-lg shrink-0">
                        {displayName[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate">
                          {displayName || "Your Name"}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${badgeColor}`}>
                            {typeLabel}
                          </span>
                          {city && (
                            <span className="text-xs text-muted-foreground">{city}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {bio && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {bio}
                      </p>
                    )}

                    {/* Tags */}
                    {selectedTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 rounded-full text-[11px] font-medium bg-accent text-muted-foreground"
                          >
                            {tag.replace(/-/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Links row */}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {instagram && <span>📷 {instagram}</span>}
                      {soundcloudUrl && <span>🎵 SoundCloud</span>}
                      {websiteUrl && <span>🔗 Website</span>}
                    </div>

                    {/* Rate + Availability */}
                    {(rateRange || availability) && (
                      <div className="flex gap-4 text-xs text-muted-foreground border-t border-border pt-3 mt-1">
                        {rateRange && <span>💰 {rateRange}</span>}
                        {availability && <span>📅 {availability}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* ── Edit Form ── */
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                  <div className="space-y-2">
                    <Label className="text-xs">Display Name *</Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name or brand"
                      className="text-base"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">City</Label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Toronto"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Bio</Label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="What do you do? What makes you stand out?"
                      className="w-full rounded-xl border bg-card px-4 py-3 text-sm leading-relaxed resize-none focus:border-nocturn focus:ring-1 focus:ring-nocturn"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">{tagLabel}</Label>
                    <div className="flex flex-wrap gap-2">
                      {tagOptions.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px] ${
                            selectedTags.includes(tag)
                              ? "bg-nocturn text-white"
                              : "bg-accent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {tag.replace(/-/g, " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Instagram</Label>
                      <Input
                        value={instagram}
                        onChange={(e) => setInstagram(e.target.value)}
                        placeholder="@handle"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">SoundCloud URL</Label>
                      <Input
                        value={soundcloudUrl}
                        onChange={(e) => setSoundcloudUrl(e.target.value)}
                        placeholder="https://soundcloud.com/..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Website</Label>
                    <Input
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Rate Range</Label>
                      <Input
                        value={rateRange}
                        onChange={(e) => setRateRange(e.target.value)}
                        placeholder="$500-1500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Availability</Label>
                      <Input
                        value={availability}
                        onChange={(e) => setAvailability(e.target.value)}
                        placeholder="Weekends only"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Past Venues (comma-separated)</Label>
                    <Input
                      value={pastVenues}
                      onChange={(e) => setPastVenues(e.target.value)}
                      placeholder="Coda, Velvet Underground, Toybox"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Portfolio Links</Label>
                    {portfolioUrls.map((url, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          placeholder="https://..."
                          type="url"
                          value={url}
                          onChange={(e) => updatePortfolioUrl(i, e.target.value)}
                          className="flex-1"
                        />
                        {portfolioUrls.length > 1 && (
                          <button
                            onClick={() => removePortfolioSlot(i)}
                            className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent shrink-0"
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    ))}
                    {portfolioUrls.length < 5 && (
                      <button
                        onClick={addPortfolioSlot}
                        className="flex items-center gap-1 text-xs text-nocturn hover:underline"
                      >
                        <Plus className="h-3 w-3" /> Add another link
                      </button>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                onClick={handleCreate}
                disabled={saving || !displayName.trim()}
                className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base"
              >
                {saving || step === "creating" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating your profile...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {editing ? "Save & Launch" : "Looks good — launch it"}
                  </>
                )}
              </Button>
            </>
          )}

          {/* ─── SCREEN 3: CONNECT ─── */}
          {step === "connect" && (
            <>
              <div className="text-center space-y-2 mb-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 mx-auto">
                  <Check className="h-7 w-7 text-green-500" />
                </div>
                <h2 className="text-xl font-bold">You&apos;re listed!</h2>
                <p className="text-sm text-muted-foreground">
                  Operators in {city || "your city"} can now find you. Want to connect with someone?
                </p>
              </div>

              <MarketplaceConnect
                userType={userType}
                displayName={displayName}
                city={city}
                onSkip={() => router.push("/dashboard")}
                onDone={() => router.push("/dashboard")}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
