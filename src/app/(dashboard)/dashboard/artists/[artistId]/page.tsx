"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Music,
  Instagram,
  Mail,
  DollarSign,
  Calendar,
  Clock,
  Check,
  X,
} from "lucide-react";
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
}

interface Booking {
  id: string;
  fee: number | null;
  set_time: string | null;
  set_duration: number | null;
  status: string;
  notes: string | null;
  events: {
    id: string;
    title: string;
    starts_at: string;
    status: string;
    venues: { name: string; city: string } | null;
  };
}

export default function ArtistDetailPage() {
  const params = useParams();
  const artistId = params.artistId as string;
  const supabase = createClient();

  const [artist, setArtist] = useState<Artist | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadArtist();
  }, [artistId]);

  async function loadArtist() {
    const { data: artistData } = await supabase
      .from("artists")
      .select(
        "id, name, slug, bio, genre, instagram, soundcloud, spotify, booking_email, default_fee"
      )
      .eq("id", artistId)
      .maybeSingle();

    if (artistData) setArtist(artistData as Artist);

    // Get all bookings for this artist with event details
    const { data: bookingData } = await supabase
      .from("event_artists")
      .select(
        "id, fee, set_time, set_duration, status, notes, events(id, title, starts_at, status, venues(name, city))"
      )
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false });

    setBookings((bookingData ?? []) as unknown as Booking[]);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/artists">
            <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" aria-label="Go back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Artist not found</h1>
        </div>
      </div>
    );
  }

  const upcoming = bookings.filter(
    (b) =>
      b.events &&
      new Date(b.events.starts_at) >= new Date() &&
      b.status !== "cancelled"
  );
  const past = bookings.filter(
    (b) =>
      b.events &&
      (new Date(b.events.starts_at) < new Date() || b.status === "cancelled")
  );

  const totalEarnings = bookings
    .filter((b) => b.status === "confirmed" && b.fee)
    .reduce((sum, b) => sum + (b.fee ?? 0), 0);

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-500",
    confirmed: "bg-green-500/10 text-green-500",
    declined: "bg-red-500/10 text-red-500",
    cancelled: "bg-muted text-muted-foreground",
  };

  const statusIcons: Record<string, typeof Check> = {
    pending: Clock,
    confirmed: Check,
    declined: X,
    cancelled: X,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/artists">
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10">
          <Music className="h-6 w-6 text-nocturn" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-heading truncate">{artist.name}</h1>
          {artist.genre?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {artist.genre.map((g) => (
                <span
                  key={g}
                  className="rounded-full bg-nocturn/10 px-2 py-0.5 text-xs font-medium text-nocturn"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Info card */}
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
          {artist.bio && (
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">{artist.bio}</p>
            </div>
          )}
          {artist.instagram && (
            <div className="flex items-center gap-2 text-sm">
              <Instagram className="h-4 w-4 text-muted-foreground" />
              <a
                href={`https://instagram.com/${artist.instagram.replace("@", "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-nocturn hover:underline"
              >
                {artist.instagram}
              </a>
            </div>
          )}
          {artist.booking_email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a
                href={`mailto:${artist.booking_email}`}
                className="text-nocturn hover:underline"
              >
                {artist.booking_email}
              </a>
            </div>
          )}
          {artist.default_fee && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>Default fee: ${artist.default_fee}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Music Links */}
      {(artist.soundcloud || artist.spotify) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Listen</p>
            <div className="flex flex-col gap-2">
              {artist.soundcloud && (
                <a
                  href={artist.soundcloud.startsWith("http") ? artist.soundcloud : `https://soundcloud.com/${artist.soundcloud}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 hover:bg-orange-500/10 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20">
                    <svg className="h-5 w-5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.56 8.87V17h8.76c1.85 0 2.68-1.22 2.68-2.68 0-2.3-1.73-3.38-3.38-3.38-.58 0-.87.08-1.15.17-.38-2.49-2.49-3.24-3.82-3.24-1.3 0-2.42.6-3.09 1z"/>
                      <path d="M10.5 9.56V17h.5V8.87c-.17.17-.33.4-.5.69zm-1.5 2.4V17h.75V11.12c-.25.23-.5.5-.75.84zm-1.5 1.97V17h.75v-2.37c-.2.17-.45.4-.75.7zM6 15.27V17h.75v-1.73c-.18.12-.42.3-.75.55zM4.5 16.18V17h.75v-.82c-.25.15-.5.37-.75.55zM3 16.73V17h.75v-.27c-.25.1-.5.2-.75.3z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-orange-400">SoundCloud</p>
                    <p className="text-xs text-muted-foreground">Listen to tracks</p>
                  </div>
                </a>
              )}
              {artist.spotify && (
                <a
                  href={artist.spotify.startsWith("http") ? artist.spotify : `https://open.spotify.com/artist/${artist.spotify}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-3 hover:bg-green-500/10 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20">
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-400">Spotify</p>
                    <p className="text-xs text-muted-foreground">View profile</p>
                  </div>
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-nocturn">{bookings.length}</p>
            <p className="text-xs text-muted-foreground">Total Bookings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-nocturn">{upcoming.length}</p>
            <p className="text-xs text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-nocturn">
              ${totalEarnings.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Total Fees</p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming events */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming Events
          </h2>
          {upcoming.map((booking) => (
            <BookingCard key={booking.id} booking={booking} statusColors={statusColors} statusIcons={statusIcons} />
          ))}
        </div>
      )}

      {/* Past events */}
      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Past Events
          </h2>
          {past.map((booking) => (
            <BookingCard key={booking.id} booking={booking} statusColors={statusColors} statusIcons={statusIcons} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {bookings.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
              <Calendar className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center">
              <p className="font-medium">No bookings yet</p>
              <p className="text-sm text-muted-foreground">
                Book {artist.name} for an event through the lineup builder.
              </p>
            </div>
            <Link href="/dashboard/events">
              <Button variant="outline">View Events</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BookingCard({
  booking,
  statusColors,
  statusIcons,
}: {
  booking: Booking;
  statusColors: Record<string, string>;
  statusIcons: Record<string, typeof Check>;
}) {
  const date = new Date(booking.events.starts_at);
  const StatusIcon = statusIcons[booking.status] ?? Clock;

  return (
    <Link href={`/dashboard/events/${booking.events.id}/lineup`}>
      <Card className="transition-colors hover:border-nocturn/30">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-nocturn/10 text-nocturn">
            <span className="text-xs font-medium uppercase">
              {date.toLocaleDateString("en", { month: "short" })}
            </span>
            <span className="text-lg font-bold leading-none">
              {date.getDate()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{booking.events.title}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {booking.events.venues && (
                <span>{booking.events.venues.name}</span>
              )}
              {booking.fee && <span>${booking.fee}</span>}
              {booking.set_duration && <span>{booking.set_duration}min</span>}
            </div>
          </div>
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
              statusColors[booking.status] ?? ""
            }`}
          >
            <StatusIcon className="h-3 w-3" />
            {booking.status}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
