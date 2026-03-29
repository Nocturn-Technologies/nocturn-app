"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createMarketplaceProfile } from "@/app/actions/marketplace";
import {
  GENRE_OPTIONS,
  SERVICES_BY_TYPE,
  TYPE_LABELS,
} from "@/lib/marketplace-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Check, ArrowRight, Plus, X } from "lucide-react";
import { NocturnLogo } from "@/components/nocturn-logo";

type Step = "info" | "bio" | "tags" | "rate" | "portfolio" | "done";

export default function MarketplaceOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("info");
  const [userType, setUserType] = useState<string>("");
  const [fullName, setFullName] = useState("");

  // Form fields
  const [displayName, setDisplayName] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [instagram, setInstagram] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [rateRange, setRateRange] = useState("");
  const [availability, setAvailability] = useState("");
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([""]);
  const [pastVenues, setPastVenues] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileSlug, setProfileSlug] = useState<string | null>(null);

  // Fetch user info on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setFullName(user.user_metadata?.full_name ?? "");
      setDisplayName(user.user_metadata?.full_name ?? "");
      setUserType(user.user_metadata?.user_type ?? "artist");
    });
  }, [supabase]);

  const isArtist = userType === "artist";
  const tagOptions = isArtist
    ? GENRE_OPTIONS
    : SERVICES_BY_TYPE[userType] ?? [];
  const tagLabel = isArtist ? "Genres" : "Services";
  const typeLabel = TYPE_LABELS[userType] ?? userType;

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

  async function handleCreate() {
    if (!displayName.trim() || !city.trim()) return;

    setSaving(true);
    setError(null);

    const validUrls = portfolioUrls.filter((u) => u.trim());
    const venueList = pastVenues
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    const result = await createMarketplaceProfile({
      displayName,
      city,
      bio: bio || undefined,
      instagramHandle: instagram || undefined,
      genres: isArtist ? selectedTags : undefined,
      services: !isArtist ? selectedTags : undefined,
      rateRange: rateRange || undefined,
      availability: availability || undefined,
      portfolioUrls: validUrls.length > 0 ? validUrls : undefined,
      pastVenues: venueList.length > 0 ? venueList : undefined,
    });

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setProfileSlug(result.slug);
    setStep("done");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <NocturnLogo size="md" />
        </div>

        <div className="space-y-4 min-h-[400px]">
          {/* Step: Info */}
          {step === "info" && (
            <>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nocturn/20">
                  <Sparkles className="h-4 w-4 text-nocturn" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3 max-w-md">
                  <p className="text-sm">
                    Let&apos;s set up your <span className="font-medium text-nocturn">{typeLabel}</span> profile so operators can find you on Nocturn.
                  </p>
                </div>
              </div>

              <div className="ml-8 sm:ml-11 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Display Name *</Label>
                  <Input
                    placeholder="Your name or brand"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="text-base"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">City *</Label>
                  <Input
                    placeholder="e.g. Toronto"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="text-base"
                  />
                </div>
                <Button
                  onClick={() => setStep("bio")}
                  disabled={!displayName.trim() || !city.trim()}
                  className="bg-nocturn hover:bg-nocturn-light"
                  size="sm"
                >
                  Continue
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </>
          )}

          {/* Step: Bio */}
          {step === "bio" && (
            <>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nocturn/20">
                  <Sparkles className="h-4 w-4 text-nocturn" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3 max-w-md">
                  <p className="text-sm">Tell operators a bit about yourself.</p>
                </div>
              </div>

              <div className="ml-8 sm:ml-11 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Bio</Label>
                  <textarea
                    placeholder="What do you do? What makes you stand out?"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full rounded-xl border bg-card px-4 py-3 text-sm leading-relaxed resize-none focus:border-nocturn focus:ring-1 focus:ring-nocturn"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Instagram Handle</Label>
                  <Input
                    placeholder="@yourhandle"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() => setStep("tags")}
                  className="bg-nocturn hover:bg-nocturn-light"
                  size="sm"
                >
                  Continue
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </>
          )}

          {/* Step: Tags (Genres or Services) */}
          {step === "tags" && (
            <>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nocturn/20">
                  <Sparkles className="h-4 w-4 text-nocturn" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3 max-w-md">
                  <p className="text-sm">
                    Select your {tagLabel.toLowerCase()} — pick as many as apply.
                  </p>
                </div>
              </div>

              <div className="ml-8 sm:ml-11 space-y-4">
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
                <Button
                  onClick={() => setStep("rate")}
                  className="bg-nocturn hover:bg-nocturn-light"
                  size="sm"
                >
                  Continue
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </>
          )}

          {/* Step: Rate + Availability */}
          {step === "rate" && (
            <>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nocturn/20">
                  <Sparkles className="h-4 w-4 text-nocturn" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3 max-w-md">
                  <p className="text-sm">Almost done! Rate and availability help operators filter.</p>
                </div>
              </div>

              <div className="ml-8 sm:ml-11 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Rate Range (optional)</Label>
                  <Input
                    placeholder="e.g. $500-1500 or Contact for pricing"
                    value={rateRange}
                    onChange={(e) => setRateRange(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Availability (optional)</Label>
                  <Input
                    placeholder="e.g. Weekends only, Available"
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Past Venues (comma-separated, optional)</Label>
                  <Input
                    placeholder="e.g. Coda, Velvet Underground, Toybox"
                    value={pastVenues}
                    onChange={(e) => setPastVenues(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() => setStep("portfolio")}
                  className="bg-nocturn hover:bg-nocturn-light"
                  size="sm"
                >
                  Continue
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </>
          )}

          {/* Step: Portfolio */}
          {step === "portfolio" && (
            <>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nocturn/20">
                  <Sparkles className="h-4 w-4 text-nocturn" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3 max-w-md">
                  <p className="text-sm">Add links to your past work — SoundCloud mixes, photo portfolios, video reels, anything.</p>
                </div>
              </div>

              <div className="ml-8 sm:ml-11 space-y-4">
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

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button
                  onClick={handleCreate}
                  disabled={saving}
                  className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base"
                >
                  {saving ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                      Creating profile...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Launch My Profile
                    </>
                  )}
                </Button>

                <button
                  onClick={() => router.push("/dashboard")}
                  disabled={saving}
                  className="w-full text-xs text-muted-foreground hover:underline"
                >
                  Skip — I&apos;ll add these later
                </button>
              </div>
            </>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-5 py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold">You&apos;re listed!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Operators in {city} can now find and contact you on Nocturn.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {profileSlug && (
                  <Button
                    onClick={() => router.push(`/dashboard/discover/${profileSlug}`)}
                    className="w-full bg-nocturn hover:bg-nocturn-light py-5 text-base"
                  >
                    <ArrowRight className="mr-2 h-4 w-4" />
                    View My Profile
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => router.push("/dashboard/discover")}
                  className="w-full text-sm text-muted-foreground"
                >
                  Browse the Marketplace
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => router.push("/dashboard")}
                  className="w-full text-sm text-muted-foreground"
                >
                  Go to Dashboard
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
