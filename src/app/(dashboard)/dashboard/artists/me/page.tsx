"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { createArtist } from "@/app/actions/artists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Loader2, Search, Users } from "lucide-react";
import Link from "next/link";

interface ArtistProfile {
  id: string;
  name: string;
  bio: string | null;
  genre: string[];
  instagram: string | null;
  soundcloud: string | null;
  spotify: string | null;
  booking_email: string | null;
  default_fee: number | null;
  metadata: { location?: string } | null;
}

export default function ArtistMePage() {
  const supabase = createClient();
  const [_userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [genre, setGenre] = useState("");
  const [instagram, setInstagram] = useState("");
  const [soundcloud, setSoundcloud] = useState("");
  const [spotify, setSpotify] = useState("");
  const [bookingEmail, setBookingEmail] = useState("");
  const [defaultFee, setDefaultFee] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    // Check if artist profile exists
    const { data: artist } = await supabase
      .from("artists")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (artist) {
      setProfile(artist as ArtistProfile);
      setName(artist.name ?? "");
      setBio(artist.bio ?? "");
      setGenre((artist.genre ?? []).join(", "));
      setInstagram(artist.instagram ?? "");
      setSoundcloud(artist.soundcloud ?? "");
      setSpotify(artist.spotify ?? "");
      setBookingEmail(artist.booking_email ?? "");
      setDefaultFee(artist.default_fee ? String(artist.default_fee) : "");
      setLocation((artist.metadata as { location?: string })?.location ?? "");
    } else {
      // Pre-fill name from user profile
      const { data: userProfile } = await supabase
        .from("users")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      if (userProfile) {
        setName(userProfile.full_name ?? "");
        setBookingEmail(userProfile.email ?? "");
      }
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    // Client-side validation: name is required
    if (!name.trim()) {
      setError("Artist name is required");
      return;
    }

    setSaving(true);
    setSaved(false);
    setError(null);

    const genres = genre.split(",").map((g) => g.trim()).filter(Boolean);

    if (profile) {
      // Update existing
      const { error: updateError } = await supabase
        .from("artists")
        .update({
          name,
          bio: bio || null,
          genre: genres,
          instagram: instagram || null,
          soundcloud: soundcloud || null,
          spotify: spotify || null,
          booking_email: bookingEmail || null,
          default_fee: defaultFee ? parseFloat(defaultFee) : null,
          metadata: { location: location || null },
        })
        .eq("id", profile.id);

      if (updateError) {
        console.error("[artists/me] update error:", updateError.message);
        setError(updateError.message || "Failed to update profile. Please try again.");
        setSaving(false);
        return;
      }
    } else {
      // Create new
      const result = await createArtist({
        name,
        bio: bio || null,
        genre: genres,
        instagram: instagram || null,
        soundcloud: soundcloud || null,
        spotify: spotify || null,
        bookingEmail: bookingEmail || null,
        defaultFee: defaultFee ? parseFloat(defaultFee) : null,
        location: location || null,
      });

      if (result?.error) {
        setError(result.error);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSaved(true);
    await loadProfile();
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-300">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-56 rounded-lg bg-muted animate-pulse" />
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
            <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
            <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
              <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
            </div>
            <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading">
          {profile ? "Your Artist Profile" : "Set Up Your Profile"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {profile
            ? "Keep your profile updated so collectives can find and book you"
            : "Fill out your profile to get discovered by collectives on Nocturn"}
        </p>
      </div>

      {/* Profile form */}
      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSave} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label>Artist / DJ Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. DJ Shadow" required maxLength={200} />
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <textarea
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell collectives about your sound, your style, and what makes you unique..."
              />
            </div>

            <div className="space-y-2">
              <Label>Genres (comma separated)</Label>
              <Input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="e.g. House, Techno, Disco" />
            </div>

            <div className="space-y-2">
              <Label>City / Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Toronto, ON" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>SoundCloud</Label>
                <Input value={soundcloud} onChange={(e) => setSoundcloud(e.target.value)} placeholder="https://soundcloud.com/yourname" />
              </div>
              <div className="space-y-2">
                <Label>Spotify</Label>
                <Input value={spotify} onChange={(e) => setSpotify(e.target.value)} placeholder="https://open.spotify.com/artist/..." />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@yourhandle" />
              </div>
              <div className="space-y-2">
                <Label>Booking Email</Label>
                <Input type="email" value={bookingEmail} onChange={(e) => setBookingEmail(e.target.value)} placeholder="booking@you.com" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Default Fee ($)</Label>
              <Input type="number" value={defaultFee} onChange={(e) => setDefaultFee(e.target.value)} placeholder="e.g. 500" min="0" />
              <p className="text-xs text-muted-foreground">Your standard booking rate. Collectives will see this when browsing.</p>
            </div>

            <Button type="submit" className="w-full bg-nocturn hover:bg-nocturn-light" disabled={saving || !name.trim()}>
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : saved ? (
                <><Check className="mr-2 h-4 w-4" /> Saved!</>
              ) : (
                profile ? "Update Profile" : "Create Profile"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/dashboard/artists">
          <Card className="hover:border-nocturn/30 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nocturn/20">
                <Search className="h-5 w-5 text-nocturn" />
              </div>
              <div>
                <p className="font-medium text-sm">Browse Artists</p>
                <p className="text-xs text-muted-foreground">See other DJs in the directory</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/venues">
          <Card className="hover:border-nocturn/30 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nocturn/20">
                <Users className="h-5 w-5 text-nocturn" />
              </div>
              <div>
                <p className="font-medium text-sm">Find Collectives</p>
                <p className="text-xs text-muted-foreground">Connect with promoters booking talent</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
