"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Upload,
  Loader2,
  ExternalLink,
  Check,
  Image as ImageIcon,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { updateEventDesign, getEventDesign } from "@/app/actions/events";
import { generatePosterPrompt } from "@/app/actions/ai-poster";

const VIBE_OPTIONS = [
  "House",
  "Techno",
  "Hip-Hop",
  "R&B",
  "Afrobeats",
  "Latin",
  "Open Format",
  "Amapiano",
  "Drill",
  "Reggaeton",
  "Disco",
  "Funk",
  "DNB",
  "Jersey Club",
];

const AGE_OPTIONS = [
  { value: "", label: "No restriction" },
  { value: "19", label: "19+" },
  { value: "21", label: "21+" },
];

const THEME_COLORS = [
  { name: "Purple", value: "#7B2FF7" },
  { name: "Red", value: "#EF4444" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Gold", value: "#F59E0B" },
  { name: "Green", value: "#10B981" },
  { name: "Pink", value: "#EC4899" },
  { name: "Teal", value: "#14B8A6" },
  { name: "Orange", value: "#F97316" },
];

export default function EventDesignPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [flyerUrl, setFlyerUrl] = useState("");
  const [description, setDescription] = useState("");
  const [vibeTags, setVibeTags] = useState<string[]>([]);
  const [minAge, setMinAge] = useState("");
  const [dressCode, setDressCode] = useState("");
  const [themeColor, setThemeColor] = useState("#7B2FF7");
  const [eventTitle, setEventTitle] = useState("");
  const [collectiveSlug, setCollectiveSlug] = useState("");
  const [eventSlug, setEventSlug] = useState("");

  // AI poster generation
  const [generating, setGenerating] = useState(false);
  const [styleDirection, setStyleDirection] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const result = await getEventDesign(eventId);
      if (result.error || !result.event) {
        setError(result.error ?? "Failed to load event");
        setLoading(false);
        return;
      }
      const e = result.event;
      setFlyerUrl(e.flyer_url ?? "");
      setDescription(e.description ?? "");
      setVibeTags((e.vibe_tags as string[]) ?? []);
      setMinAge(e.min_age ? String(e.min_age) : "");
      setEventTitle(e.title);
      setEventSlug(e.slug);
      setCollectiveSlug(e.collectiveSlug ?? "");
      const meta = (e.metadata ?? {}) as Record<string, string>;
      setDressCode(meta.dressCode ?? "");
      setThemeColor(meta.themeColor ?? "#7B2FF7");
      setLoading(false);
    }
    load();
  }, [eventId]);

  function toggleVibe(tag: string) {
    setVibeTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    const result = await updateEventDesign(eventId, {
      flyerUrl: flyerUrl || null,
      description: description || null,
      vibeTags,
      minAge: minAge ? parseInt(minAge) : null,
      dressCode: dressCode || null,
      themeColor,
    });

    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function handleGeneratePoster() {
    setGenerating(true);
    setGenError(null);
    setGeneratedUrl(null);

    try {
      // Step 1: Claude crafts the perfect prompt
      const { prompt } = await generatePosterPrompt({
        title: eventTitle,
        genre: vibeTags,
        styleDirection: styleDirection || undefined,
      });

      // Step 2: Replicate generates the image
      const res = await fetch("/api/generate-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspectRatio: "3:4" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setGenError(data.error || "Failed to generate poster");
        setGenerating(false);
        return;
      }

      setGeneratedUrl(data.imageUrl);
      setGenerating(false);
    } catch {
      setGenError("Failed to generate poster. Please try again.");
      setGenerating(false);
    }
  }

  function acceptGeneratedPoster() {
    if (generatedUrl) {
      setFlyerUrl(generatedUrl);
      setGeneratedUrl(null);
    }
  }

  const publicUrl = collectiveSlug && eventSlug ? `/e/${collectiveSlug}/${eventSlug}` : null;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">Design — {eventTitle}</h1>
          <p className="text-sm text-muted-foreground">
            Customize how your event page looks to attendees
          </p>
        </div>
        {publicUrl && (
          <Link href={publicUrl} target="_blank">
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-2 h-3 w-3" />
              Preview
            </Button>
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* ─── Controls ─── */}
        <div className="space-y-6">
          {/* Flyer — AI Generate or URL */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Event Flyer</label>

            {/* Current flyer preview */}
            {flyerUrl && (
              <div className="space-y-3">
                <div
                  className="mx-auto h-64 w-full max-w-sm rounded-xl bg-cover bg-center border border-border"
                  style={{ backgroundImage: `url(${flyerUrl})` }}
                />
                <button
                  onClick={() => setFlyerUrl("")}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Remove flyer
                </button>
              </div>
            )}

            {/* AI Generated poster preview */}
            {generatedUrl && !flyerUrl && (
              <div className="space-y-3">
                <div className="relative">
                  <img
                    src={generatedUrl}
                    alt="AI Generated Poster"
                    className="mx-auto h-64 w-full max-w-sm rounded-xl object-cover border-2 border-nocturn"
                  />
                  <div className="absolute top-2 right-2 rounded-full bg-nocturn px-2 py-1 text-[10px] font-bold text-white">
                    AI Generated
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={acceptGeneratedPoster}
                    className="flex-1 bg-nocturn hover:bg-nocturn-light"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Use This Poster
                  </Button>
                  <Button
                    onClick={handleGeneratePoster}
                    variant="outline"
                    disabled={generating}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${generating ? "animate-spin" : ""}`} />
                    Regenerate
                  </Button>
                </div>
              </div>
            )}

            {/* AI Generation controls */}
            {!flyerUrl && !generatedUrl && (
              <div className="rounded-2xl border-2 border-dashed border-nocturn/30 bg-nocturn/5 p-6 space-y-4">
                <div className="text-center space-y-2">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10">
                    <Sparkles className="h-6 w-6 text-nocturn" />
                  </div>
                  <p className="text-sm font-medium">Generate with AI</p>
                  <p className="text-xs text-muted-foreground">
                    Describe the vibe and AI will create a poster
                  </p>
                </div>

                <Input
                  placeholder="e.g. dark and moody, neon lights, futuristic..."
                  value={styleDirection}
                  onChange={(e) => setStyleDirection(e.target.value)}
                  className="bg-card"
                />

                {genError && (
                  <p className="text-sm text-red-400">{genError}</p>
                )}

                <Button
                  onClick={handleGeneratePoster}
                  disabled={generating}
                  className="w-full bg-nocturn hover:bg-nocturn-light"
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating poster...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Poster
                    </>
                  )}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-background px-2 text-muted-foreground">or paste URL</span>
                  </div>
                </div>

                <Input
                  placeholder="Paste flyer image URL..."
                  value={flyerUrl}
                  onChange={(e) => setFlyerUrl(e.target.value)}
                  className="bg-card"
                />
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <textarea
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-ring resize-y min-h-[120px]"
              placeholder="Tell people what this event is about..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Vibe Tags */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Vibe Tags</label>
            <div className="flex flex-wrap gap-2">
              {VIBE_OPTIONS.map((tag) => {
                const isActive = vibeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleVibe(tag)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-nocturn bg-nocturn/10 text-nocturn"
                        : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Age Restriction */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Age Restriction</label>
            <select
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={minAge}
              onChange={(e) => setMinAge(e.target.value)}
            >
              {AGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Dress Code */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Dress Code</label>
            <Input
              placeholder="e.g. Smart casual, All black, No sneakers..."
              value={dressCode}
              onChange={(e) => setDressCode(e.target.value)}
              className="bg-card"
            />
          </div>

          {/* Theme Color */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Theme Color</label>
            <p className="text-xs text-muted-foreground">
              Sets the accent color on your public event page
            </p>
            <div className="flex flex-wrap gap-3">
              {THEME_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setThemeColor(c.value)}
                  className={`relative h-10 w-10 rounded-full transition-transform hover:scale-110 ${
                    themeColor === c.value ? "ring-2 ring-white ring-offset-2 ring-offset-background scale-110" : ""
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                >
                  {themeColor === c.value && (
                    <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />
                  )}
                </button>
              ))}
              {/* Custom color input */}
              <div className="relative">
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  className="absolute inset-0 h-10 w-10 cursor-pointer opacity-0"
                />
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground hover:border-muted-foreground/50 ${
                    !THEME_COLORS.find((c) => c.value === themeColor)
                      ? "ring-2 ring-white ring-offset-2 ring-offset-background"
                      : ""
                  }`}
                  style={
                    !THEME_COLORS.find((c) => c.value === themeColor)
                      ? { backgroundColor: themeColor }
                      : undefined
                  }
                >
                  {THEME_COLORS.find((c) => c.value === themeColor) ? (
                    <span className="text-xs">+</span>
                  ) : (
                    <Check className="h-4 w-4 text-white" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Error / Save */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-nocturn py-5 hover:bg-nocturn-light"
            size="lg"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="mr-2 h-4 w-4" />
            ) : null}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Design"}
          </Button>
        </div>

        {/* ─── Live Preview (desktop) ─── */}
        <div className="hidden lg:block">
          <div className="sticky top-6 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Preview</p>
            <div
              className="overflow-hidden rounded-2xl border border-border bg-[#09090B]"
              style={{ maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}
            >
              <div className="w-full">
                {/* Mini hero */}
                {flyerUrl ? (
                  <div
                    className="relative h-44 w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${flyerUrl})` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/40 to-transparent" />
                  </div>
                ) : (
                  <div
                    className="relative h-32 w-full"
                    style={{
                      background: `linear-gradient(135deg, ${themeColor}40 0%, ${themeColor}15 40%, #09090B 100%)`,
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/60 to-transparent" />
                  </div>
                )}

                <div className="space-y-4 px-4 pb-6 -mt-8 relative">
                  <h2
                    className="text-xl font-bold text-white"
                    style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
                  >
                    {eventTitle}
                  </h2>

                  {vibeTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {vibeTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Preview date placeholder */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center rounded-lg bg-white/5 px-2.5 py-1.5">
                        <span className="text-[9px] font-semibold uppercase text-white/40">SAT</span>
                        <span className="text-sm font-bold text-white">25</span>
                        <span className="text-[9px] font-semibold uppercase text-white/40">APR</span>
                      </div>
                      <div className="text-xs text-white/60">
                        10:00 PM — 2:00 AM
                      </div>
                    </div>
                  </div>

                  {description && (
                    <p className="text-xs leading-relaxed text-white/50 line-clamp-3">
                      {description}
                    </p>
                  )}

                  {dressCode && (
                    <p className="text-[10px] text-white/40">
                      Dress code: {dressCode}
                    </p>
                  )}

                  {/* Preview CTA */}
                  <div
                    className="rounded-xl py-3 text-center text-sm font-bold text-white"
                    style={{ backgroundColor: themeColor }}
                  >
                    Get Tickets
                  </div>

                  <p className="text-center text-[10px] text-white/20">
                    Powered by <span style={{ color: themeColor }}>nocturn.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
