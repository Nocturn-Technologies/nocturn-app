"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { createArtist } from "@/app/actions/artists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Music, Plus, Search, Instagram, ExternalLink, MapPin, BarChart3 } from "lucide-react";
import Link from "next/link";

interface Artist {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  genre: string[];
  instagram: string | null;
  soundcloud: string | null;
  spotify: string | null;
  booking_email: string | null;
  default_fee: number | null;
  metadata: { location?: string } | null;
}

export default function ArtistsPage() {
  const supabase = createClient();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New artist form
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
    loadArtists();
  }, []);

  async function loadArtists() {
    try {
      const { data, error: fetchError } = await supabase
        .from("artists")
        .select("id, name, slug, bio, genre, instagram, soundcloud, spotify, booking_email, default_fee, metadata")
        .is("deleted_at", null)
        .order("name");
      if (fetchError) throw fetchError;
      setArtists((data ?? []) as Artist[]);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load artists");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const genres = genre
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);

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

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setName("");
    setBio("");
    setGenre("");
    setInstagram("");
    setSoundcloud("");
    setSpotify("");
    setBookingEmail("");
    setDefaultFee("");
    setLocation("");
    setShowAdd(false);
    setSaving(false);
    loadArtists();
  }

  const filtered = artists.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.genre?.some((g) => g.toLowerCase().includes(search.toLowerCase())) ||
      (a.metadata as { location?: string })?.location?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" onClick={() => { setLoading(true); setLoadError(null); loadArtists(); }}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Artist Library</h1>
          <p className="text-sm text-muted-foreground">
            Shared directory of DJs, producers, and performers across Nocturn
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/artists/analytics">
            <Button variant="outline" className="border-nocturn/20 text-nocturn hover:bg-nocturn/10">
              <BarChart3 className="mr-2 h-4 w-4" />
              Performance
            </Button>
          </Link>
          <Button
            className="bg-nocturn hover:bg-nocturn-light"
            onClick={() => setShowAdd(!showAdd)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Artist
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Add artist form */}
      {showAdd && (
        <Card className="border-nocturn/20">
          <CardHeader>
            <CardTitle className="text-base">Add New Artist</CardTitle>
            <CardDescription>Add to the Nocturn-wide artist directory — visible to all collectives</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="artistName">Name *</Label>
                  <Input
                    id="artistName"
                    placeholder="DJ Shadow"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="artistGenre">Genres (comma-separated)</Label>
                  <Input
                    id="artistGenre"
                    placeholder="house, techno, disco"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="artistBio">Bio</Label>
                  <Input
                    id="artistBio"
                    placeholder="Short bio or description"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="artistLocation">Based in</Label>
                  <Input
                    id="artistLocation"
                    placeholder="Toronto, ON"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="artistInstagram">Instagram</Label>
                  <Input
                    id="artistInstagram"
                    placeholder="@djshadow"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="artistSoundcloud">SoundCloud</Label>
                  <Input
                    id="artistSoundcloud"
                    placeholder="soundcloud.com/djshadow"
                    value={soundcloud}
                    onChange={(e) => setSoundcloud(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="artistSpotify">Spotify</Label>
                  <Input
                    id="artistSpotify"
                    placeholder="open.spotify.com/artist/..."
                    value={spotify}
                    onChange={(e) => setSpotify(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="artistEmail">Booking email</Label>
                  <Input
                    id="artistEmail"
                    type="email"
                    placeholder="booking@artist.com"
                    value={bookingEmail}
                    onChange={(e) => setBookingEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="artistFee">Default fee ($)</Label>
                <Input
                  id="artistFee"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="500"
                  value={defaultFee}
                  onChange={(e) => setDefaultFee(e.target.value)}
                  className="max-w-[200px]"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="bg-nocturn hover:bg-nocturn-light" disabled={saving}>
                  {saving ? "Adding..." : "Add Artist"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      {artists.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, genre, or city..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Artist count */}
      {artists.length > 0 && (
        <p className="text-xs text-muted-foreground">{filtered.length} artist{filtered.length !== 1 ? "s" : ""}</p>
      )}

      {/* Artist list */}
      {artists.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
              <Music className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center">
              <p className="font-medium">No artists yet</p>
              <p className="text-sm text-muted-foreground">
                Add DJs, producers, and performers to the shared Nocturn library.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((artist) => {
            const loc = (artist.metadata as { location?: string })?.location;
            return (
              <Link key={artist.id} href={`/dashboard/artists/${artist.id}`}>
              <Card className="transition-colors hover:border-nocturn/30">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10 shrink-0">
                    <Music className="h-5 w-5 text-nocturn" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{artist.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {artist.genre?.slice(0, 3).map((g) => (
                        <span
                          key={g}
                          className="rounded-full bg-nocturn/10 px-2 py-0.5 text-[10px] font-medium text-nocturn"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {loc && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {loc}
                        </span>
                      )}
                      {artist.instagram && (
                        <span className="flex items-center gap-1">
                          <Instagram className="h-3 w-3" />
                          {artist.instagram}
                        </span>
                      )}
                      {(artist.soundcloud || artist.spotify) && (
                        <span className="flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          {artist.soundcloud ? "SC" : ""}
                          {artist.soundcloud && artist.spotify ? " · " : ""}
                          {artist.spotify ? "Spotify" : ""}
                        </span>
                      )}
                      {artist.default_fee && (
                        <span>${artist.default_fee}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
