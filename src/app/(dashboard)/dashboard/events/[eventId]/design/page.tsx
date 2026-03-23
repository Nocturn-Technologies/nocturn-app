"use client";

import { useEffect, useState, useCallback } from "react";
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
  Camera,
  Search,
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

  // Host message
  const [hostMessage, setHostMessage] = useState("");

  // AI poster generation — conversational flow
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [posterDJs, setPosterDJs] = useState("");
  const [posterDate, setPosterDate] = useState("");
  const [posterVenue, setPosterVenue] = useState("");
  const [posterStyle, setPosterStyle] = useState("");

  // Unsplash photo backgrounds
  const [unsplashQuery, setUnsplashQuery] = useState("");
  const [unsplashResults, setUnsplashResults] = useState<Array<{ id: string; url: string; thumbUrl: string; photographer: string }>>([]);
  const [unsplashLoading, setUnsplashLoading] = useState(false);
  const [showUnsplash, setShowUnsplash] = useState(false);

  // Style reference upload
  const [styleRefUrl, setStyleRefUrl] = useState<string | null>(null);

  // Extra event details for poster
  const [posterTime, setPosterTime] = useState("");
  const [posterAddress, setPosterAddress] = useState("");
  const [posterAge, setPosterAge] = useState("");

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
      setHostMessage(meta.hostMessage ?? "");
      if (meta.styleRefUrl) setStyleRefUrl(meta.styleRefUrl as string);

      // Auto-fill poster fields from event data
      if (e.artistNames?.length > 0) setPosterDJs(e.artistNames.join(", "));
      if (e.dateDisplay) setPosterDate(e.dateDisplay);
      if (e.venueName) setPosterVenue([e.venueName, e.venueCity].filter(Boolean).join(", "));
      if (e.timeDisplay) setPosterTime(e.timeDisplay);
      if (e.venueAddress) setPosterAddress(e.venueAddress);
      if (e.min_age) setPosterAge(`${e.min_age}+`);

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
      hostMessage: hostMessage || null,
    });

    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSaved(true);
      // Redirect back to event page after save
      setTimeout(() => {
        router.push(`/dashboard/events/${eventId}`);
      }, 600);
    }
  }

  async function handleGeneratePoster() {
    setGenerating(true);
    setGenError(null);
    setGeneratedUrl(null);

    try {
      // Step 1: Claude crafts prompt for BACKGROUND ART ONLY (no text)
      const { prompt } = await generatePosterPrompt({
        title: eventTitle,
        genre: vibeTags,
        venueName: posterVenue || undefined,
        styleDirection: posterStyle || undefined,
      });

      // Step 2: Replicate generates the background art
      const res = await fetch("/api/generate-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();

      if (!res.ok) {
        setGenError(data.error || "Failed to generate poster");
        setGenerating(false);
        return;
      }

      // Step 3: Composite text on top using canvas
      const composited = await compositeTextOnPoster(data.imageUrl, {
        title: eventTitle,
        djs: posterDJs,
        date: posterDate,
        venue: posterVenue,
        accentColor: themeColor,
        time: posterTime,
        address: posterAddress,
        age: posterAge,
      });

      setGeneratedUrl(composited);
      setGenerating(false);
    } catch (err) {
      console.error("Poster generation error:", err);
      setGenError("Failed to generate poster. Please try again.");
      setGenerating(false);
    }
  }

  // Composite clean typography over AI-generated background
  async function compositeTextOnPoster(
    bgUrl: string,
    details: { title: string; djs: string; date: string; venue: string; accentColor: string; time?: string; address?: string; age?: string }
  ): Promise<string> {
    const canvas = document.createElement("canvas");
    const W = 1080;
    const H = 1350; // 4:5 Instagram
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // Draw background image
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load background image"));
      img.src = bgUrl;
    });

    // Cover-fit the image
    const scale = Math.max(W / img.width, H / img.height);
    const sw = W / scale;
    const sh = H / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);

    // Dark gradient overlay for text readability
    const grad = ctx.createLinearGradient(0, H * 0.3, 0, H);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.4)");
    grad.addColorStop(1, "rgba(0,0,0,0.85)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Top gradient for branding area
    const topGrad = ctx.createLinearGradient(0, 0, 0, H * 0.25);
    topGrad.addColorStop(0, "rgba(0,0,0,0.6)");
    topGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, W, H * 0.25);

    ctx.textAlign = "center";

    // Event title — top area, uppercase, tracked out
    if (details.title) {
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 42px 'Arial Black', 'Helvetica Neue', sans-serif";
      ctx.letterSpacing = "8px";
      const titleUpper = details.title.toUpperCase();
      ctx.fillText(titleUpper, W / 2, 100, W - 120);
    }

    // DJ names — main headline, large and bold
    if (details.djs) {
      const djNames = details.djs.split(/[,&]/).map((s) => s.trim()).filter(Boolean);
      const startY = H * 0.55;
      const lineHeight = djNames.length > 3 ? 72 : djNames.length > 2 ? 80 : 90;
      const fontSize = djNames.length > 3 ? 52 : djNames.length > 2 ? 58 : 68;

      djNames.forEach((name, i) => {
        ctx.fillStyle = i === 0 ? details.accentColor : "#FFFFFF";
        ctx.font = `900 ${fontSize}px 'Arial Black', 'Helvetica Neue', sans-serif`;
        ctx.letterSpacing = "4px";
        ctx.fillText(name.toUpperCase(), W / 2, startY + i * lineHeight, W - 100);
      });
    }

    // Thin accent line separator
    ctx.strokeStyle = details.accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W * 0.3, H - 260);
    ctx.lineTo(W * 0.7, H - 260);
    ctx.stroke();

    // Date + Time — bottom area
    let bottomY = H - 230;

    if (details.date) {
      const dateText = details.time
        ? `${details.date} — ${details.time}`.toUpperCase()
        : details.date.toUpperCase();
      ctx.fillStyle = details.accentColor;
      ctx.font = "bold 32px 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = "4px";
      ctx.fillText(dateText, W / 2, bottomY, W - 100);
      bottomY += 44;
    }

    // Venue name
    if (details.venue) {
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "600 28px 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = "3px";
      ctx.fillText(details.venue.toUpperCase(), W / 2, bottomY, W - 100);
      bottomY += 36;
    }

    // Venue address
    if (details.address) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "400 22px 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = "1px";
      ctx.fillText(details.address, W / 2, bottomY, W - 100);
      bottomY += 36;
    }

    // Age restriction
    if (details.age) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "bold 24px 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = "2px";
      ctx.fillText(details.age.toUpperCase(), W / 2, bottomY, W - 120);
    }

    return canvas.toDataURL("image/png", 0.95);
  }

  function acceptGeneratedPoster() {
    if (generatedUrl) {
      setFlyerUrl(generatedUrl);
      setGeneratedUrl(null);
    }
  }

  // Unsplash photo search
  const searchUnsplash = useCallback(async (query?: string) => {
    setUnsplashLoading(true);
    try {
      const q = query ?? unsplashQuery;
      const res = await fetch(`/api/unsplash?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.photos) {
        setUnsplashResults(data.photos);
        setShowUnsplash(true);
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setUnsplashLoading(false);
    }
  }, [unsplashQuery]);

  async function selectUnsplashPhoto(photo: { id: string; url: string; downloadUrl?: string }) {
    // Track download per Unsplash guidelines
    if (photo.downloadUrl) {
      fetch("/api/unsplash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadUrl: photo.downloadUrl }),
      }).catch(() => {});
    }

    // Composite text on the photo
    try {
      const composited = await compositeTextOnPoster(photo.url, {
        title: eventTitle,
        djs: posterDJs,
        date: posterDate,
        venue: posterVenue,
        accentColor: themeColor,
        time: posterTime,
        address: posterAddress,
        age: posterAge,
      });
      setGeneratedUrl(composited);
      setShowUnsplash(false);
    } catch {
      // Fallback: use the photo directly
      setFlyerUrl(photo.url);
      setShowUnsplash(false);
    }
  }

  // Style reference upload handler
  function handleStyleRefUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setStyleRefUrl(reader.result as string);
      // Auto-fill the style direction with a hint
      if (!posterStyle) {
        setPosterStyle("Match the visual style of the uploaded reference image");
      }
    };
    reader.readAsDataURL(file);
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

            {/* AI Generation — conversational flow */}
            {!flyerUrl && !generatedUrl && (
              <div className="rounded-2xl border border-nocturn/20 bg-nocturn/5 p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-nocturn/10">
                    <Sparkles className="h-5 w-5 text-nocturn" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">AI Poster Generator</p>
                    <p className="text-xs text-muted-foreground">Tell me about your event and I'll design the flyer</p>
                  </div>
                </div>

                {/* DJ / Artist names */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Who's performing?</label>
                  <Input
                    placeholder="e.g. Marco Carola, Loco Dice, Jamie Jones"
                    value={posterDJs}
                    onChange={(e) => setPosterDJs(e.target.value)}
                    className="bg-card"
                  />
                </div>

                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Event date</label>
                  <Input
                    placeholder="e.g. Saturday March 29"
                    value={posterDate}
                    onChange={(e) => setPosterDate(e.target.value)}
                    className="bg-card"
                  />
                </div>

                {/* Venue */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Venue</label>
                  <Input
                    placeholder="e.g. Coda, Toronto"
                    value={posterVenue}
                    onChange={(e) => setPosterVenue(e.target.value)}
                    className="bg-card"
                  />
                </div>

                {/* Style direction */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Visual style</label>
                  <Input
                    placeholder="e.g. Circoloco DC-10 vibes, dark minimal, neon underground"
                    value={posterStyle}
                    onChange={(e) => setPosterStyle(e.target.value)}
                    className="bg-card"
                  />
                </div>

                {/* Style reference upload */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Style reference (optional)</label>
                  <p className="text-[11px] text-muted-foreground/60">Upload a poster you like as inspiration</p>
                  <div className="flex items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <Upload className="h-4 w-4" />
                      {styleRefUrl ? "Change reference" : "Upload reference"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleStyleRefUpload}
                      />
                    </label>
                    {styleRefUrl && (
                      <div className="relative h-12 w-12 shrink-0 rounded-lg overflow-hidden border border-border">
                        <img src={styleRefUrl} alt="Style reference" className="h-full w-full object-cover" />
                        <button
                          onClick={() => setStyleRefUrl(null)}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity text-white text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {genError && (
                  <p className="text-sm text-red-400">{genError}</p>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handleGeneratePoster}
                    disabled={generating}
                    className="flex-1 bg-nocturn hover:bg-nocturn-light py-5"
                    size="lg"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Designing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        AI Generate
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => searchUnsplash()}
                    disabled={unsplashLoading}
                    variant="outline"
                    className="py-5"
                    size="lg"
                  >
                    {unsplashLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="mr-2 h-4 w-4" />
                    )}
                    Photos
                  </Button>
                </div>

                {/* Unsplash photo picker */}
                {showUnsplash && (
                  <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search nightlife photos..."
                        value={unsplashQuery}
                        onChange={(e) => setUnsplashQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && searchUnsplash()}
                        className="flex-1 bg-background"
                      />
                      <Button size="sm" variant="outline" onClick={() => searchUnsplash()}>
                        Search
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {unsplashResults.map((photo) => (
                        <button
                          key={photo.id}
                          onClick={() => selectUnsplashPhoto(photo)}
                          className="group relative aspect-[4/5] overflow-hidden rounded-lg border border-border"
                        >
                          <img
                            src={photo.thumbUrl}
                            alt={`Photo by ${photo.photographer}`}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-center pb-1">
                            <span className="text-[9px] text-white/0 group-hover:text-white/70 transition-colors truncate px-1">
                              {photo.photographer}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                    {unsplashResults.length > 0 && (
                      <p className="text-[10px] text-muted-foreground/50 text-center">
                        Photos by Unsplash
                      </p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setShowUnsplash(false)}
                    >
                      Close
                    </Button>
                  </div>
                )}

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

          {/* Host Message */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Host Message</label>
            <p className="text-xs text-muted-foreground">
              A personal note displayed on the public event page
            </p>
            <textarea
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-ring resize-y min-h-[80px]"
              placeholder="e.g. Can't wait to see you all tonight — bring the energy!"
              value={hostMessage}
              onChange={(e) => setHostMessage(e.target.value)}
              maxLength={280}
            />
            <p className="text-right text-xs text-muted-foreground">
              {hostMessage.length}/280
            </p>
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
                    style={{ fontFamily: "var(--font-heading), sans-serif" }}
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
