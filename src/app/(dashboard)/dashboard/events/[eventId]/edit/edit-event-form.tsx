"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateEvent } from "@/app/actions/events";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
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
  Megaphone,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

interface TierData {
  id?: string;
  name: string;
  price: number;
  quantity: number;
}

interface ExpenseRow {
  id?: string;           // present = existing row; absent = newly added in this session
  category: string;
  label: string;
  amount: number;        // in the row's native currency
  currency: string;      // ISO 4217 lowercase
}

// Chip tray for common expense categories. Tapping a chip adds a row with
// the label + category prefilled. Keeps the empty form short; operators only
// see rows for categories they actually use.
const EXPENSE_CHIPS: Array<{ category: string; label: string }> = [
  { category: "talent",         label: "Talent fee" },
  { category: "flights",        label: "Flights" },
  { category: "hotel",          label: "Hotel" },
  { category: "transport",      label: "Transport" },
  { category: "per_diem",       label: "Per diem" },
  { category: "venue_rental",   label: "Venue rental" },
  { category: "deposit",        label: "Deposit" },
  { category: "ads",            label: "Ads" },
  { category: "graphic_design", label: "Graphic design" },
  { category: "photo",          label: "Photo" },
  { category: "video",          label: "Video" },
];

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
  // v2 multi-currency budget
  currency: string;
  expenses: ExpenseRow[];
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
  const [eventCurrency, setEventCurrency] = useState(event.currency);
  const [expenses, setExpenses] = useState<ExpenseRow[]>(event.expenses);
  const [removedExpenseIds, setRemovedExpenseIds] = useState<string[]>([]);

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

  function addExpense(category: string, label: string) {
    setExpenses((prev) => [...prev, { category, label, amount: 0, currency: eventCurrency }]);
  }

  function addCustomExpense() {
    addExpense("other", "Custom expense");
  }

  function updateExpense(index: number, partial: Partial<ExpenseRow>) {
    setExpenses((prev) => prev.map((e, i) => (i === index ? { ...e, ...partial } : e)));
  }

  function removeExpense(index: number) {
    const row = expenses[index];
    if (row.id) setRemovedExpenseIds((prev) => [...prev, row.id!]);
    setExpenses((prev) => prev.filter((_, i) => i !== index));
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
      currency: eventCurrency,
      // Only send rows with a label — drops blank scaffolding without surprising the operator.
      expenseItems: expenses
        .filter((e) => e.label.trim().length > 0)
        .map((e) => ({
          id: e.id,
          category: e.category,
          label: e.label.trim(),
          amount: Number(e.amount) || 0,
          currency: e.currency.toLowerCase(),
        })),
      removedExpenseIds,
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
    <div className="mx-auto max-w-2xl space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${event.id}`}>
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" aria-label="Back to event">
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
              className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base md:text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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
                min={new Date().toISOString().split("T")[0]}
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
              <p className="text-[11px] text-muted-foreground">Amount at risk if bar minimum not met</p>
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
              <p className="text-[11px] text-muted-foreground">Minimum bar sales required by venue</p>
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
              <p className="text-[11px] text-muted-foreground">Your estimate of total bar sales for the night</p>
            </div>
          </div>
          {barMinimum && estimatedBarRevenue && Number(estimatedBarRevenue) < Number(barMinimum) && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-400">
              Your estimated bar revenue is below the bar minimum. You risk losing your ${venueDeposit || "deposit"}.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Budget & Expenses (v2 multi-currency) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-nocturn" />
            Budget &amp; expenses
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Event currency */}
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="eventCurrency">Report this event&apos;s budget in</Label>
            <select
              id="eventCurrency"
              value={eventCurrency}
              onChange={(e) => setEventCurrency(e.target.value)}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 text-sm text-white focus:border-nocturn/50 focus:outline-none min-h-[44px]"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Individual rows can be entered in any currency — totals convert to this one.
            </p>
          </div>

          {/* Itemized expense rows */}
          {expenses.length > 0 && (
            <div className="space-y-3 border-t border-white/5 pt-4">
              {expenses.map((row, i) => {
                const showFxHint = row.currency.toLowerCase() !== eventCurrency.toLowerCase() && row.amount > 0;
                return (
                  <div key={row.id ?? `new-${i}`} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        value={row.label}
                        onChange={(e) => updateExpense(i, { label: e.target.value })}
                        placeholder="Label"
                        className="flex-1 bg-transparent border-0 p-0 text-xs text-muted-foreground focus:outline-none focus:text-white h-auto min-h-0"
                      />
                      <button
                        type="button"
                        onClick={() => removeExpense(i)}
                        aria-label={`Remove ${row.label || "row"}`}
                        className="text-muted-foreground/40 hover:text-red-400 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        value={row.amount || ""}
                        onChange={(e) => updateExpense(i, { amount: parseFloat(e.target.value) || 0 })}
                        className="flex-1 bg-zinc-900 border-white/10 rounded-lg min-h-[40px] focus:border-nocturn/50"
                      />
                      <select
                        value={row.currency}
                        onChange={(e) => updateExpense(i, { currency: e.target.value })}
                        aria-label={`${row.label || "Row"} currency`}
                        className="bg-zinc-900 border border-white/10 rounded-lg px-2 text-sm text-white focus:border-nocturn/50 focus:outline-none min-h-[40px] min-w-[72px]"
                      >
                        {SUPPORTED_CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>{c.code.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                    {showFxHint && (
                      <p className="text-[10px] text-muted-foreground/60">
                        Converts to {eventCurrency.toUpperCase()} on save
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Chip tray — hide chips already present */}
          <div className="flex flex-wrap gap-2 border-t border-white/5 pt-4">
            {EXPENSE_CHIPS.filter((c) => !expenses.some((e) => e.category === c.category)).map((c) => (
              <button
                key={c.category}
                type="button"
                onClick={() => addExpense(c.category, c.label)}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-nocturn/40 hover:bg-nocturn/10 hover:text-white transition-all active:scale-[0.97] min-h-[36px]"
              >
                <Plus className="h-3 w-3" />
                {c.label}
              </button>
            ))}
            <button
              type="button"
              onClick={addCustomExpense}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:border-nocturn/40 hover:bg-nocturn/10 hover:text-white transition-all active:scale-[0.97] min-h-[36px]"
            >
              <Sparkles className="h-3 w-3" />
              Custom
            </button>
          </div>

          {expenses.length === 0 && (
            <p className="text-[11px] text-muted-foreground/60">
              Tap a chip to add an expense row. Stored per-event — edits here update the P&amp;L.
            </p>
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
                  className="h-7 w-7 min-h-[44px] min-w-[44px] text-destructive hover:text-destructive"
                  onClick={() => removeTier(index)}
                  aria-label={`Remove tier ${index + 1}`}
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
            className="w-full border-dashed min-h-[44px]"
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
          <Button variant="outline" className="min-h-[44px]">Cancel</Button>
        </Link>
        <Button
          className="bg-nocturn hover:bg-nocturn-light min-h-[44px]"
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
