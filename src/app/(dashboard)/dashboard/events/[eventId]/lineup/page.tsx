"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  addArtistToEvent,
  createArtistAndAddToEvent,
  updateBookingStatus,
} from "@/app/actions/artists";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Plus, Music, MoreVertical, Check, X, Clock, Loader2 } from "lucide-react";
import Link from "next/link";

interface EventArtist {
  id: string;
  artist_id: string;
  fee: number | null;
  set_time: string | null;
  set_duration: number | null;
  status: string;
  notes: string | null;
  artists: {
    name: string;
    genre: string[];
    instagram: string | null;
  };
}

interface Artist {
  id: string;
  name: string;
  genre: string[];
  default_fee: number | null;
}

export default function LineupPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const supabase = createClient();

  const [eventTitle, setEventTitle] = useState("");
  const [lineup, setLineup] = useState<EventArtist[]>([]);
  const [allArtists, setAllArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tab: pick existing vs create new artist on the fly
  const [mode, setMode] = useState<"existing" | "new">("existing");

  // Add to lineup form
  const [selectedArtistId, setSelectedArtistId] = useState("");
  const [fee, setFee] = useState("");
  const [setTime, setSetTime] = useState("");
  const [setDuration, setSetDuration] = useState("");
  const [notes, setNotes] = useState("");

  // Inline create-artist fields
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [sendInvite, setSendInvite] = useState(true);

  useEffect(() => {
    loadData();
  }, [eventId]);

  async function loadData() {
    // Get event title
    const { data: event } = await supabase
      .from("events")
      .select("title")
      .eq("id", eventId)
      .is("deleted_at", null)
      .maybeSingle();
    if (event) setEventTitle(event.title);

    // Get lineup
    const { data: lineupData } = await supabase
      .from("event_artists")
      .select("id, artist_id, fee, set_time, set_duration, status, notes, artists(name, genre, instagram)")
      .eq("event_id", eventId)
      .order("set_time");
    setLineup((lineupData ?? []) as unknown as EventArtist[]);

    // Get all artists for the dropdown
    const { data: artistData } = await supabase
      .from("artists")
      .select("id, name, genre, default_fee")
      .is("deleted_at", null)
      .order("name");
    setAllArtists((artistData ?? []) as Artist[]);

    setLoading(false);
  }

  async function handleAddToLineup(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await addArtistToEvent({
      eventId,
      artistId: selectedArtistId,
      fee: fee ? parseFloat(fee) : null,
      setTime: setTime || null,
      setDuration: setDuration ? parseInt(setDuration) : null,
      notes: notes || null,
    });

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    resetAddForm();
    loadData();
  }

  async function handleCreateAndBook(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await createArtistAndAddToEvent({
      eventId,
      name: newName,
      email: newEmail || null,
      phone: newPhone || null,
      fee: fee ? parseFloat(fee) : null,
      setTime: setTime || null,
      setDuration: setDuration ? parseInt(setDuration) : null,
      notes: notes || null,
      sendInvite: sendInvite && !!newEmail,
    });

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    resetAddForm();
    loadData();
  }

  function resetAddForm() {
    setSelectedArtistId("");
    setFee("");
    setSetTime("");
    setSetDuration("");
    setNotes("");
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setSendInvite(true);
    setMode("existing");
    setShowAdd(false);
    setSaving(false);
  }

  async function handleStatusChange(eventArtistId: string, status: "pending" | "confirmed" | "declined" | "cancelled") {
    setChangingStatusId(eventArtistId);
    const result = await updateBookingStatus({ eventArtistId, status });
    if (result.error) {
      setError(result.error);
    }
    await loadData();
    setChangingStatusId(null);
  }

  // Filter out already-booked artists
  const bookedIds = lineup.map((l) => l.artist_id);
  const availableArtists = allArtists.filter((a) => !bookedIds.includes(a.id));


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

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-muted animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-7 w-24 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-32 rounded-lg bg-muted animate-pulse" />
          </div>
        </div>
        <div className="h-11 w-full rounded-md bg-muted animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                <div className="h-3 w-36 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-6 w-20 rounded-full bg-muted animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" aria-label="Back to event">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-heading">Lineup</h1>
          <p className="text-sm text-muted-foreground">{eventTitle}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Add artist button */}
      <Button
        className="w-full bg-nocturn hover:bg-nocturn-light"
        onClick={() => setShowAdd(!showAdd)}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Artist to Lineup
      </Button>

      {/* Add artist form */}
      {showAdd && (
        <Card className="border-nocturn/20">
          <CardHeader>
            <CardTitle className="text-base">Book an Artist</CardTitle>
            <CardDescription>
              {mode === "existing"
                ? "Pick from your roster, or create a new artist on the fly."
                : "Create a new artist and book them in one step."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={`rounded-md py-2 transition-colors ${
                  mode === "existing"
                    ? "bg-nocturn text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                From roster
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className={`rounded-md py-2 transition-colors ${
                  mode === "new"
                    ? "bg-nocturn text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Create new
              </button>
            </div>

            {mode === "existing" ? (
              availableArtists.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    No artists in your roster yet. Create one below or visit the artist database.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setMode("new")}
                    >
                      Create new artist
                    </Button>
                    <Link href="/dashboard/artists" className="flex-1">
                      <Button variant="ghost" className="w-full">
                        Open database
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleAddToLineup} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Artist</Label>
                    <select
                      value={selectedArtistId}
                      onChange={(e) => {
                        setSelectedArtistId(e.target.value);
                        const a = allArtists.find((x) => x.id === e.target.value);
                        if (a?.default_fee) setFee(a.default_fee.toString());
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      required
                    >
                      <option value="">Select artist...</option>
                      {availableArtists.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} {a.genre?.length ? `(${a.genre.join(", ")})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Fee ($)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="500"
                        value={fee}
                        onChange={(e) => setFee(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Set time</Label>
                      <Input
                        type="time"
                        value={setTime}
                        onChange={(e) => setSetTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Duration (min)</Label>
                      <Input
                        type="number"
                        min="15"
                        step="15"
                        placeholder="60"
                        value={setDuration}
                        onChange={(e) => setSetDuration(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Input
                      placeholder="Special requests, equipment needs, etc."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" className="bg-nocturn hover:bg-nocturn-light" disabled={saving || !selectedArtistId}>
                      {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Booking...</> : "Book Artist"}
                    </Button>
                    <Button type="button" variant="ghost" onClick={resetAddForm}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )
            ) : (
              <form onSubmit={handleCreateAndBook} className="space-y-4">
                <div className="space-y-2">
                  <Label>Artist name *</Label>
                  <Input
                    placeholder="Floorplan"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      placeholder="artist@example.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      type="tel"
                      placeholder="+1 555 555 5555"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Fee ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="500"
                      value={fee}
                      onChange={(e) => setFee(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Set time</Label>
                    <Input
                      type="time"
                      value={setTime}
                      onChange={(e) => setSetTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (min)</Label>
                    <Input
                      type="number"
                      min="15"
                      step="15"
                      placeholder="60"
                      value={setDuration}
                      onChange={(e) => setSetDuration(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input
                    placeholder="Special requests, equipment needs, etc."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                {newEmail && (
                  <label className="flex items-start gap-2 rounded-md border border-border bg-card/50 p-3 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendInvite}
                      onChange={(e) => setSendInvite(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-nocturn"
                    />
                    <span>
                      <span className="font-medium text-foreground">Send magic-link invite</span>
                      <span className="block text-muted-foreground">
                        Email the artist a sign-in link so they can claim their profile.
                      </span>
                    </span>
                  </label>
                )}
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    className="bg-nocturn hover:bg-nocturn-light"
                    disabled={saving || !newName.trim()}
                  >
                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : "Create & book"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={resetAddForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lineup list */}
      {lineup.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
              <Music className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center">
              <p className="font-medium">No artists booked yet</p>
              <p className="text-sm text-muted-foreground">
                Add artists to build your event lineup.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {lineup.length} Artist{lineup.length !== 1 ? "s" : ""} Booked
          </h2>
          {lineup.map((item) => {
            const StatusIcon = statusIcons[item.status] ?? Clock;
            return (
              <Card key={item.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nocturn/10">
                    <Music className="h-5 w-5 text-nocturn" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.artists.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {item.artists.genre?.length > 0 && (
                        <span>{item.artists.genre.join(", ")}</span>
                      )}
                      {item.fee && <span>${item.fee}</span>}
                      {item.set_duration && <span>{item.set_duration}min</span>}
                    </div>
                  </div>
                  <span
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      statusColors[item.status] ?? ""
                    }`}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {item.status}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent" disabled={changingStatusId === item.id}>
                      {changingStatusId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {item.status !== "confirmed" && (
                        <DropdownMenuItem onClick={() => handleStatusChange(item.id, "confirmed")} disabled={!!changingStatusId}>
                          <Check className="mr-2 h-4 w-4 text-green-500" />
                          Confirm
                        </DropdownMenuItem>
                      )}
                      {item.status !== "declined" && (
                        <DropdownMenuItem onClick={() => handleStatusChange(item.id, "declined")} disabled={!!changingStatusId}>
                          <X className="mr-2 h-4 w-4 text-red-500" />
                          Decline
                        </DropdownMenuItem>
                      )}
                      {item.status !== "cancelled" && (
                        <DropdownMenuItem onClick={() => handleStatusChange(item.id, "cancelled")} disabled={!!changingStatusId}>
                          Cancel booking
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            );
          })}

          {/* Total cost summary */}
          {lineup.some((l) => l.fee) && (
            <div className="flex justify-between rounded-lg border border-border p-3 text-sm">
              <span className="text-muted-foreground">Total artist fees</span>
              <span className="font-medium">
                ${lineup.reduce((sum, l) => sum + (l.fee ? Number(l.fee) : 0), 0).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
