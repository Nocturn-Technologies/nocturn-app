"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
            <Button variant="ghost" size="icon">
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
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10">
          <Music className="h-6 w-6 text-nocturn" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{artist.name}</h1>
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
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
