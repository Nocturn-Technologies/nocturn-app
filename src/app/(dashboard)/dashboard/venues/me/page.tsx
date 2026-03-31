"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Check, Loader2, Calendar } from "lucide-react";
import Link from "next/link";

export default function VenueMePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [rentalFee, setRentalFee] = useState("");
  const [barMinimum, setBarMinimum] = useState("");

  useEffect(() => {
    loadVenue();
  }, []);

  async function loadVenue() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check if venue exists for this user (via metadata)
    const { data: userProfile } = await supabase
      .from("users")
      .select("full_name, email, metadata")
      .eq("id", user.id)
      .maybeSingle();

    const venueIdFromMeta = (userProfile?.metadata as Record<string, unknown>)?.venue_id as string | undefined;

    if (venueIdFromMeta) {
      const { data: venue } = await supabase
        .from("venues")
        .select("*")
        .eq("id", venueIdFromMeta)
        .maybeSingle();

      if (venue) {
        setVenueId(venue.id);
        setName(venue.name ?? "");
        setAddress(venue.address ?? "");
        setCity(venue.city ?? "");
        setCapacity(venue.capacity ? String(venue.capacity) : "");
        setDescription(venue.description ?? "");
        setPhone((venue.metadata as Record<string, unknown>)?.phone as string ?? "");
        setEmail((venue.metadata as Record<string, unknown>)?.email as string ?? "");
        setWebsite((venue.metadata as Record<string, unknown>)?.website as string ?? "");
        setRentalFee((venue.metadata as Record<string, unknown>)?.rental_fee as string ?? "");
        setBarMinimum((venue.metadata as Record<string, unknown>)?.bar_minimum as string ?? "");
      }
    } else {
      // Pre-fill from user profile
      if (userProfile) {
        setName(userProfile.full_name ?? "");
        setEmail(userProfile.email ?? "");
      }
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const metadata = {
      phone: phone || null,
      email: email || null,
      website: website || null,
      rental_fee: rentalFee || null,
      bar_minimum: barMinimum || null,
      listed_by_venue: true,
    };

    if (venueId) {
      await supabase
        .from("venues")
        .update({
          name,
          address: address || null,
          city: city || null,
          capacity: capacity ? parseInt(capacity) : null,
          description: description || null,
          metadata,
        })
        .eq("id", venueId);
    } else {
      const { data: newVenue, error: insertError } = await supabase
        .from("venues")
        .insert({
          name,
          slug,
          address: address || null,
          city: city || null,
          capacity: capacity ? parseInt(capacity) : null,
          description: description || null,
          metadata,
        })
        .select("id")
        .maybeSingle();

      if (insertError) {
        console.error("[venue] Insert failed:", insertError.message);
        setSaving(false);
        return;
      }

      if (newVenue) {
        setVenueId(newVenue.id);
        // Link venue to user profile
        await supabase
          .from("users")
          .update({ metadata: { venue_id: newVenue.id } })
          .eq("id", user.id);
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {venueId ? "Your Venue" : "List Your Venue"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {venueId
            ? "Keep your listing updated so promoters can find and book your space"
            : "Add your venue to the Nocturn directory — get discovered by collectives"}
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Venue Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CODA Toronto" required />
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 794 Bathurst St" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Toronto" />
              </div>
              <div className="space-y-2">
                <Label>Capacity</Label>
                <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 400" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <textarea
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell promoters about your space — vibe, sound system, what makes it special..."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Contact Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. (416) 555-0123" />
              </div>
              <div className="space-y-2">
                <Label>Booking Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="booking@venue.com" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourvenue.com" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Room Rental ($)</Label>
                <Input type="number" value={rentalFee} onChange={(e) => setRentalFee(e.target.value)} placeholder="e.g. 500" />
              </div>
              <div className="space-y-2">
                <Label>Bar Minimum ($)</Label>
                <Input type="number" value={barMinimum} onChange={(e) => setBarMinimum(e.target.value)} placeholder="e.g. 3000" />
              </div>
            </div>

            <Button type="submit" className="w-full bg-nocturn hover:bg-nocturn-light" disabled={saving}>
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : saved ? (
                <><Check className="mr-2 h-4 w-4" /> Saved!</>
              ) : (
                venueId ? "Update Listing" : "List Venue"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/dashboard/venues">
          <Card className="hover:border-nocturn/30 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nocturn/20">
                <MapPin className="h-5 w-5 text-nocturn" />
              </div>
              <div>
                <p className="font-medium text-sm">Browse Venues</p>
                <p className="text-xs text-muted-foreground">See other venues on the platform</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/calendar">
          <Card className="hover:border-nocturn/30 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nocturn/20">
                <Calendar className="h-5 w-5 text-nocturn" />
              </div>
              <div>
                <p className="font-medium text-sm">Event Calendar</p>
                <p className="text-xs text-muted-foreground">See what nights are busy in your city</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
