"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateEvent } from "@/app/actions/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Ticket,
  Plus,
  Trash2,
  Save,
  DollarSign,
} from "lucide-react";
import Link from "next/link";

interface TierData {
  id?: string;
  name: string;
  price: number;
  quantity: number;
}

interface EventData {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  doorsOpen: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueCapacity: number;
  tiers: TierData[];
  barMinimum: number | null;
  venueDeposit: number | null;
  venueCost: number | null;
  estimatedBarRevenue: number | null;
}

export function EditEventForm({ event }: { event: EventData }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [date, setDate] = useState(event.date);
  const [startTime, setStartTime] = useState(event.startTime);
  const [endTime, setEndTime] = useState(event.endTime);
  const [doorsOpen, setDoorsOpen] = useState(event.doorsOpen);
  const [venueName, setVenueName] = useState(event.venueName);
  const [venueAddress, setVenueAddress] = useState(event.venueAddress);
  const [venueCity, setVenueCity] = useState(event.venueCity);
  const [venueCapacity, setVenueCapacity] = useState(event.venueCapacity);
  const [tiers, setTiers] = useState<TierData[]>(event.tiers);
  const [removedTierIds, setRemovedTierIds] = useState<string[]>([]);
  const [barMinimum, setBarMinimum] = useState(event.barMinimum ?? "");
  const [venueDeposit, setVenueDeposit] = useState(event.venueDeposit ?? "");
  const [venueCostVal, setVenueCostVal] = useState(event.venueCost ?? "");
  const [estimatedBarRevenue, setEstimatedBarRevenue] = useState(event.estimatedBarRevenue ?? "");

  function addTier() {
    setTiers([...tiers, { name: "", price: 0, quantity: 0 }]);
  }

  function removeTier(index: number) {
    const tier = tiers[index];
    if (tier.id) {
      setRemovedTierIds([...removedTierIds, tier.id]);
    }
    setTiers(tiers.filter((_, i) => i !== index));
  }

  function updateTier(index: number, field: keyof TierData, value: string | number) {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: value };
    setTiers(updated);
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!date || !startTime) {
      setError("Date and start time are required.");
      return;
    }

    const invalidTier = tiers.find((t) => !t.name.trim() || Number(t.quantity) <= 0);
    if (invalidTier) {
      setError("All ticket tiers must have a name and a quantity greater than 0.");
      return;
    }

    setSaving(true);
    setError(null);

    const result = await updateEvent(event.id, {
      title: title.trim(),
      description: description.trim() || null,
      date,
      startTime,
      endTime: endTime || null,
      doorsOpen: doorsOpen || null,
      venueName: venueName.trim(),
      venueAddress: venueAddress.trim(),
      venueCity: venueCity.trim(),
      venueCapacity,
      tiers: tiers.map((t) => ({
        id: t.id,
        name: t.name.trim(),
        price: Number(t.price),
        quantity: Number(t.quantity),
      })),
      removedTierIds,
      barMinimum: barMinimum ? Number(barMinimum) : null,
      venueDeposit: venueDeposit ? Number(venueDeposit) : null,
      venueCost: venueCostVal ? Number(venueCostVal) : null,
      estimatedBarRevenue: estimatedBarRevenue ? Number(estimatedBarRevenue) : null,
    });

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    router.push(`/dashboard/events/${event.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${event.id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Edit Event</h1>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Event Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-nocturn" />
            Event Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your event..."
              rows={4}
              className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doorsOpen">Doors Open</Label>
              <Input
                id="doorsOpen"
                type="time"
                value={doorsOpen}
                onChange={(e) => setDoorsOpen(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Venue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-nocturn" />
            Venue
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="venueName">Venue Name</Label>
              <Input
                id="venueName"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="e.g. The Warehouse"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venueCity">City</Label>
              <Input
                id="venueCity"
                value={venueCity}
                onChange={(e) => setVenueCity(e.target.value)}
                placeholder="e.g. Brooklyn"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="venueAddress">Address</Label>
            <Input
              id="venueAddress"
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              placeholder="e.g. 123 Main St"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="venueCapacity">Capacity</Label>
            <Input
              id="venueCapacity"
              type="number"
              inputMode="numeric"
              value={venueCapacity || ""}
              onChange={(e) => setVenueCapacity(Number(e.target.value))}
              placeholder="e.g. 500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Venue Financials */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-nocturn" />
            Venue Financials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="venueCost">Venue Cost ($)</Label>
              <Input
                id="venueCost"
                type="number"
                inputMode="numeric"
                min="0"
                step="0.01"
                value={venueCostVal}
                onChange={(e) => setVenueCostVal(e.target.value ? Number(e.target.value) : "")}
                placeholder="e.g. 2500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venueDeposit">Venue Deposit ($)</Label>
              <Input
                id="venueDeposit"
                type="number"
                inputMode="numeric"
                min="0"
                step="0.01"
                value={venueDeposit}
                onChange={(e) => setVenueDeposit(e.target.value ? Number(e.target.value) : "")}
                placeholder="e.g. 1000"
              />
              <p className="text-[10px] text-muted-foreground">Amount at risk if bar minimum not met</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="barMinimum">Bar Minimum ($)</Label>
              <Input
                id="barMinimum"
                type="number"
                inputMode="numeric"
                min="0"
                step="0.01"
                value={barMinimum}
                onChange={(e) => setBarMinimum(e.target.value ? Number(e.target.value) : "")}
                placeholder="e.g. 3000"
              />
              <p className="text-[10px] text-muted-foreground">Minimum bar sales required by venue</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedBarRevenue">Estimated Bar Revenue ($)</Label>
              <Input
                id="estimatedBarRevenue"
                type="number"
                inputMode="numeric"
                min="0"
                step="0.01"
                value={estimatedBarRevenue}
                onChange={(e) => setEstimatedBarRevenue(e.target.value ? Number(e.target.value) : "")}
                placeholder="e.g. 4000"
              />
              <p className="text-[10px] text-muted-foreground">Your estimate of total bar sales for the night</p>
            </div>
          </div>
          {barMinimum && estimatedBarRevenue && Number(estimatedBarRevenue) < Number(barMinimum) && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-400">
              Your estimated bar revenue is below the bar minimum. You risk losing your ${venueDeposit || "deposit"}.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Tiers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-nocturn" />
            Ticket Tiers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tiers.map((tier, index) => (
            <div
              key={tier.id ?? `new-${index}`}
              className="rounded-lg border border-border p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Tier {index + 1}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => removeTier(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={tier.name}
                    onChange={(e) => updateTier(index, "name", e.target.value)}
                    placeholder="e.g. General"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Price ($)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="0.01"
                    value={tier.price || ""}
                    onChange={(e) =>
                      updateTier(index, "price", Number(e.target.value))
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={tier.quantity || ""}
                    onChange={(e) =>
                      updateTier(index, "quantity", Number(e.target.value))
                    }
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={addTier}
            className="w-full border-dashed"
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add Tier
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Save Button */}
      <div className="flex justify-end gap-3 pb-8">
        <Link href={`/dashboard/events/${event.id}`}>
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button
          className="bg-nocturn hover:bg-nocturn-light"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving...
            </span>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
