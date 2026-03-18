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
import { Music, Plus, Search, Instagram } from "lucide-react";

interface Artist {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  genre: string[];
  instagram: string | null;
  booking_email: string | null;
  default_fee: number | null;
}

export default function ArtistsPage() {
  const supabase = createClient();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New artist form
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [genre, setGenre] = useState("");
  const [instagram, setInstagram] = useState("");
  const [bookingEmail, setBookingEmail] = useState("");
  const [defaultFee, setDefaultFee] = useState("");

  useEffect(() => {
    loadArtists();
  }, []);

  async function loadArtists() {
    const { data } = await supabase
      .from("artists")
      .select("id, name, slug, bio, genre, instagram, booking_email, default_fee")
      .is("deleted_at", null)
      .order("name");
    setArtists((data ?? []) as Artist[]);
    setLoading(false);
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
      soundcloud: null,
      spotify: null,
      bookingEmail: bookingEmail || null,
      defaultFee: defaultFee ? parseFloat(defaultFee) : null,
    });

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    // Reset form
    setName("");
    setBio("");
    setGenre("");
    setInstagram("");
    setBookingEmail("");
    setDefaultFee("");
    setShowAdd(false);
    setSaving(false);
    loadArtists();
  }

  const filtered = artists.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.genre?.some((g) => g.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Artists</h1>
          <p className="text-sm text-muted-foreground">
            Manage your artist database
          </p>
        </div>
        <Button
          className="bg-nocturn hover:bg-nocturn-light"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Artist
        </Button>
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
            <CardDescription>Add an artist to your database for easy booking</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="artistName">Name</Label>
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
              <div className="space-y-2">
                <Label htmlFor="artistBio">Bio (optional)</Label>
                <Input
                  id="artistBio"
                  placeholder="Short bio or description"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
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
                  <Label htmlFor="artistEmail">Booking email</Label>
                  <Input
                    id="artistEmail"
                    type="email"
                    placeholder="booking@artist.com"
                    value={bookingEmail}
                    onChange={(e) => setBookingEmail(e.target.value)}
                  />
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
                  />
                </div>
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
            placeholder="Search by name or genre..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
                Build your artist database to quickly book talent for events.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((artist) => (
            <Card key={artist.id} className="transition-colors hover:border-nocturn/30">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10">
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
                    {artist.instagram && (
                      <span className="flex items-center gap-1">
                        <Instagram className="h-3 w-3" />
                        {artist.instagram}
                      </span>
                    )}
                    {artist.default_fee && (
                      <span>${artist.default_fee}</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
