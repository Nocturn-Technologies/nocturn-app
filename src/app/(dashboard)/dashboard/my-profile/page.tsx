"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMarketplaceProfile, updateMarketplaceProfile } from "@/app/actions/marketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Camera,
  Plus,
  X,
  Loader2,
  Instagram,
  Globe,
  Music,
  ExternalLink,
  Check,
  Video,
} from "lucide-react";
import { validateFileUpload, ALLOWED_IMAGE_TYPES } from "@/lib/utils";

interface ProfileData {
  id: string;
  display_name: string;
  slug: string;
  bio: string | null;
  city: string | null;
  user_type: string;
  instagram_handle: string | null;
  website_url: string | null;
  soundcloud_url: string | null;
  spotify_url: string | null;
  genres: string[] | null;
  services: string[] | null;
  rate_range: string | null;
  availability: string | null;
  portfolio_urls: string[] | null;
  past_venues: string[] | null;
  avatar_url: string | null;
  cover_photo_url: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  artist: "Artist / DJ",
  venue: "Venue",
  photographer: "Photographer",
  videographer: "Videographer",
  sound_production: "Sound & Production",
  lighting_production: "Lighting & Visuals",
  sponsor: "Sponsor / Brand",
};

export default function MyProfilePage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "cover" | "media" | null>(null);
  const [mediaFiles, setMediaFiles] = useState<string[]>([]);
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [instagram, setInstagram] = useState("");
  const [website, setWebsite] = useState("");
  const [soundcloud, setSoundcloud] = useState("");
  const [spotify, setSpotify] = useState("");
  const [rateRange, setRateRange] = useState("");
  const [availability, setAvailability] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const data = await getMarketplaceProfile();
    if (data) {
      const p = data as ProfileData;
      setProfile(p);
      setDisplayName(p.display_name ?? "");
      setBio(p.bio ?? "");
      setCity(p.city ?? "");
      setInstagram(p.instagram_handle ?? "");
      setWebsite(p.website_url ?? "");
      setSoundcloud(p.soundcloud_url ?? "");
      setSpotify(p.spotify_url ?? "");
      setRateRange(p.rate_range ?? "");
      setAvailability(p.availability ?? "");
      setAvatarUrl(p.avatar_url ?? null);
      setCoverPhotoUrl(p.cover_photo_url ?? null);
      // Load media from portfolio_urls
      setMediaFiles(p.portfolio_urls ?? []);
    }
    setLoading(false);
  }

  // TODO(audit): path traversal via ext from file.name — derive ext from validated file.type MIME instead. Also move validation to server action.
  async function uploadFile(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage
      .from("marketplace")
      .upload(path, file, { contentType: file.type, upsert: true });

    if (error) {
      console.error("Upload error:", error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from("marketplace")
      .getPublicUrl(path);

    return urlData.publicUrl;
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setError(null);
    const validationErr = validateFileUpload(file, { allowedTypes: [...ALLOWED_IMAGE_TYPES], maxSizeMB: 5 });
    if (validationErr) { setError(validationErr); return; }
    setUploading("avatar");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const url = await uploadFile(file, `${profile.id}/avatar-${Date.now()}.${ext}`);
    if (url) {
      setAvatarUrl(url);
      const result = await updateMarketplaceProfile({ avatarUrl: url });
      if (result?.error) setError(result.error);
    } else {
      setError("Failed to upload avatar. Please try again.");
    }
    setUploading(null);
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setError(null);
    const validationErr = validateFileUpload(file, { allowedTypes: [...ALLOWED_IMAGE_TYPES], maxSizeMB: 10 });
    if (validationErr) { setError(validationErr); return; }
    setUploading("cover");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const url = await uploadFile(file, `${profile.id}/cover-${Date.now()}.${ext}`);
    if (url) {
      setCoverPhotoUrl(url);
      const result = await updateMarketplaceProfile({ coverPhotoUrl: url });
      if (result?.error) setError(result.error);
    } else {
      setError("Failed to upload cover photo. Please try again.");
    }
    setUploading(null);
  }

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !profile) return;
    setError(null);
    setUploading("media");

    const allowedMedia = [...ALLOWED_IMAGE_TYPES, "video/mp4", "video/webm"] as string[];
    const newUrls: string[] = [];
    const uploadErrors: string[] = [];
    for (const file of Array.from(files)) {
      const validationErr = validateFileUpload(file, { allowedTypes: allowedMedia, maxSizeMB: 50 });
      if (validationErr) { uploadErrors.push(`${file.name}: ${validationErr}`); continue; }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const url = await uploadFile(file, `${profile.id}/media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`);
      if (url) newUrls.push(url);
      else uploadErrors.push(`${file.name}: upload failed`);
    }

    if (uploadErrors.length > 0) setError(uploadErrors.join(" · "));

    if (newUrls.length > 0) {
      const updated = [...mediaFiles, ...newUrls];
      setMediaFiles(updated);
      const result = await updateMarketplaceProfile({ portfolioUrls: updated });
      if (result?.error) setError(result.error);
    }
    setUploading(null);
    // Reset input so same file can be re-selected
    if (mediaRef.current) mediaRef.current.value = "";
  }

  async function removeMedia(url: string) {
    const updated = mediaFiles.filter((u) => u !== url);
    setMediaFiles(updated);
    await updateMarketplaceProfile({ portfolioUrls: updated });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const { error: saveError } = await updateMarketplaceProfile({
      displayName: displayName || undefined,
      bio: bio || null,
      city: city || null,
      instagramHandle: instagram || null,
      websiteUrl: website || null,
      soundcloudUrl: soundcloud || null,
      spotifyUrl: spotify || null,
      rateRange: rateRange || null,
      availability: availability || null,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl animate-in fade-in duration-300">
        <div className="space-y-2">
          <div className="h-7 w-36 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-48 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="rounded-xl border border-border p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-32 rounded bg-muted animate-pulse" />
              <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
            <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
            <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
          </div>
          <div className="h-10 w-28 rounded-md bg-muted animate-pulse ml-auto" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-4 text-center py-20">
        <h2 className="text-xl font-bold">No profile yet</h2>
        <p className="text-muted-foreground">Complete your marketplace onboarding to create your profile.</p>
        <a href="/onboarding/marketplace">
          <Button className="bg-nocturn hover:bg-nocturn-light">Set up profile</Button>
        </a>
      </div>
    );
  }

  const isMediaType = ["photographer", "videographer"].includes(profile.user_type);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold font-heading">My Profile</h1>
        <p className="text-sm text-muted-foreground">
          {TYPE_LABELS[profile.user_type] ?? profile.user_type} · Visible on Discover
        </p>
      </div>

      {/* ── Cover Photo ── */}
      <div className="relative">
        <div
          className="h-40 rounded-xl bg-gradient-to-br from-nocturn/30 to-nocturn/10 overflow-hidden cursor-pointer"
          onClick={() => coverRef.current?.click()}
        >
          {coverPhotoUrl ? (
            <img src={coverPhotoUrl} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm gap-2">
              <Camera className="h-5 w-5" />
              Add cover photo
            </div>
          )}
          {uploading === "cover" && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>
        <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleCoverUpload} />

        {/* Avatar */}
        <div
          className="absolute -bottom-8 left-4 h-20 w-20 rounded-full border-4 border-background bg-card cursor-pointer overflow-hidden"
          onClick={() => avatarRef.current?.click()}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full bg-nocturn/20">
              <Camera className="h-5 w-5 text-nocturn" />
            </div>
          )}
          {uploading === "avatar" && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            </div>
          )}
        </div>
        <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleAvatarUpload} />
      </div>

      <div className="pt-8" />

      {/* ── Basic Info ── */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Toronto" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Bio</Label>
          <textarea
            className="flex w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[100px] resize-none"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell collectives about yourself and what you do..."
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground text-right">{bio.length}/1000</p>
        </div>
      </div>

      {/* ── Photos & Videos ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base">
            {isMediaType ? "Portfolio" : "Photos & Videos"}
          </Label>
          <span className="text-xs text-muted-foreground">{mediaFiles.length}/10</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {isMediaType
            ? "Upload your best work — this is what collectives see first."
            : "Add photos or videos to showcase your work."}
        </p>

        <div className="grid grid-cols-3 gap-2">
          {mediaFiles.map((url, i) => {
            const isVideo = /\.(mp4|mov|webm)$/i.test(url);
            return (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-card group">
                {isVideo ? (
                  <video src={url} className="w-full h-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={`Media ${i + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = "none";
                      const parent = target.parentElement;
                      if (parent && !parent.querySelector(".img-fallback")) {
                        const fallback = document.createElement("div");
                        fallback.className = "img-fallback w-full h-full flex items-center justify-center bg-nocturn/10";
                        fallback.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
                        parent.insertBefore(fallback, parent.firstChild);
                      }
                    }}
                  />
                )}
                <button
                  onClick={() => removeMedia(url)}
                  className="absolute top-1 right-1 min-h-[44px] min-w-[44px] h-11 w-11 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
                {isVideo && (
                  <div className="absolute bottom-1 left-1">
                    <Video className="h-4 w-4 text-white drop-shadow" />
                  </div>
                )}
              </div>
            );
          })}

          {mediaFiles.length < 10 && (
            <button
              onClick={() => mediaRef.current?.click()}
              disabled={uploading === "media"}
              className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-nocturn/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-nocturn transition-colors"
            >
              {uploading === "media" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Plus className="h-5 w-5" />
                  <span className="text-[11px]">Add</span>
                </>
              )}
            </button>
          )}
        </div>
        <input
          ref={mediaRef}
          type="file"
          accept="image/*,video/mp4,video/mov,video/webm"
          multiple
          className="hidden"
          onChange={handleMediaUpload}
        />
      </div>

      {/* ── Social Links ── */}
      <div className="space-y-3">
        <Label className="text-base">Links</Label>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Instagram className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@handle"
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yoursite.com"
              className="flex-1"
            />
          </div>
          {["artist", "photographer", "videographer"].includes(profile.user_type) && (
            <>
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  value={soundcloud}
                  onChange={(e) => setSoundcloud(e.target.value)}
                  placeholder="SoundCloud URL"
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  value={spotify}
                  onChange={(e) => setSpotify(e.target.value)}
                  placeholder="Spotify URL"
                  className="flex-1"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Rate & Availability ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Rate range</Label>
          <Input
            value={rateRange}
            onChange={(e) => setRateRange(e.target.value)}
            placeholder="e.g. $200-500/event"
          />
        </div>
        <div className="space-y-2">
          <Label>Availability</Label>
          <Input
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            placeholder="e.g. Weekends only"
          />
        </div>
      </div>

      {/* ── View Public Profile Link ── */}
      <a
        href={`/dashboard/discover/${profile.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-nocturn hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        View public profile
      </a>

      {/* ── Error message ── */}
      {error && (
        <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Save Button ── */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving || !displayName.trim()}
          className="bg-nocturn hover:bg-nocturn-light min-w-[120px] min-h-[44px]"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4" /> Saved</span>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </div>
  );
}
