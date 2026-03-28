"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Plus,
  ClipboardList,
  Loader2,
  Search,
  UserCheck,
  UserX,
  Trash2,
  Users,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import {
  addGuest,
  getGuestList,
  checkInGuest,
  updateGuestStatus,
  removeGuest,
  type Guest,
} from "@/app/actions/guest-list";

const statusConfig: Record<
  string,
  { label: string; color: string; dotColor: string }
> = {
  pending: {
    label: "Pending",
    color: "bg-yellow-500/10 text-yellow-500 ring-yellow-500/20",
    dotColor: "bg-yellow-500",
  },
  confirmed: {
    label: "Confirmed",
    color: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
    dotColor: "bg-blue-500",
  },
  checked_in: {
    label: "Checked In",
    color: "bg-green-500/10 text-green-500 ring-green-500/20",
    dotColor: "bg-green-500",
  },
  no_show: {
    label: "No Show",
    color: "bg-red-500/10 text-red-500 ring-red-500/20",
    dotColor: "bg-red-500",
  },
};

export default function GuestListPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plusOnes, setPlusOnes] = useState("0");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadGuests();
  }, [eventId]);

  async function loadGuests() {
    setLoading(true);
    const data = await getGuestList(eventId);
    setGuests(data);
    setLoading(false);
  }

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setPlusOnes("0");
    setNotes("");
    setFormError(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }

    setSaving(true);
    const result = await addGuest({
      eventId,
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      plusOnes: parseInt(plusOnes) || 0,
      notes: notes.trim() || null,
    });

    if (result.error) {
      setFormError(result.error);
      setSaving(false);
      return;
    }

    resetForm();
    setShowForm(false);
    await loadGuests();
    setSaving(false);
  }

  async function handleCheckIn(guestId: string) {
    await checkInGuest(guestId);
    await loadGuests();
  }

  async function handleStatusChange(
    guestId: string,
    status: "pending" | "confirmed" | "checked_in" | "no_show"
  ) {
    await updateGuestStatus(guestId, status);
    await loadGuests();
  }

  async function handleRemove(guestId: string) {
    await removeGuest(guestId);
    await loadGuests();
  }

  const filteredGuests = useMemo(() => {
    if (!searchQuery.trim()) return guests;
    const q = searchQuery.toLowerCase();
    return guests.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.email && g.email.toLowerCase().includes(q))
    );
  }, [guests, searchQuery]);

  // Summary stats
  const totalGuests = guests.length;
  const totalPlusOnes = guests.reduce((sum, g) => sum + g.plus_ones, 0);
  const totalHeadcount = totalGuests + totalPlusOnes;
  const checkedInCount = guests.filter((g) => g.status === "checked_in").length;
  const confirmedCount = guests.filter((g) => g.status === "confirmed").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10 animate-pulse-glow">
            <ClipboardList className="h-6 w-6 text-nocturn" />
          </div>
          <p className="text-sm text-muted-foreground">Loading guest list...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Guest List</h1>
          <p className="text-sm text-muted-foreground">
            Manage your door list and check-ins
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-nocturn">{totalGuests}</p>
            <p className="text-xs text-muted-foreground">Guests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold">{totalPlusOnes}</p>
            <p className="text-xs text-muted-foreground">+Ones</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-blue-500">{confirmedCount}</p>
            <p className="text-xs text-muted-foreground">Confirmed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-green-500">{checkedInCount}</p>
            <p className="text-xs text-muted-foreground">Checked In</p>
          </CardContent>
        </Card>
      </div>

      {/* Headcount bar */}
      {totalGuests > 0 && (
        <div className="text-sm text-muted-foreground text-center">
          Total headcount:{" "}
          <span className="font-semibold text-foreground">{totalHeadcount}</span>{" "}
          people ({totalGuests} guests + {totalPlusOnes} plus-ones)
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowForm(!showForm);
            if (showForm) resetForm();
          }}
        >
          <Plus className="mr-1 h-3 w-3" />
          {showForm ? "Cancel" : "Add Guest"}
        </Button>

        {guests.length > 0 && (
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        )}
      </div>

      {/* Add Guest Form */}
      {showForm && (
        <Card className="animate-scale-in border-nocturn/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-nocturn" />
              Add Guest
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              {formError && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-500">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="guestName">Name *</Label>
                  <Input
                    id="guestName"
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guestEmail">Email</Label>
                  <Input
                    id="guestEmail"
                    type="email"
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="guestPhone">Phone</Label>
                  <Input
                    id="guestPhone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plusOnes">Plus Ones</Label>
                  <Input
                    id="plusOnes"
                    type="number"
                    min="0"
                    max="10"
                    value={plusOnes}
                    onChange={(e) => setPlusOnes(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input
                  id="notes"
                  placeholder="VIP, backstage access, birthday, etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-nocturn hover:bg-nocturn-light"
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Add to Guest List
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Guest List */}
      {guests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
              <ClipboardList className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center">
              <p className="font-medium">No guests yet</p>
              <p className="text-sm text-muted-foreground">
                Add your first guest to start building the door list.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredGuests.length === 0 && searchQuery && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No guests matching &ldquo;{searchQuery}&rdquo;
            </div>
          )}

          {filteredGuests.map((guest) => {
            const status = statusConfig[guest.status] ?? statusConfig.pending;

            return (
              <Card key={guest.id} className="transition-colors">
                <CardContent className="flex items-center gap-3 py-3">
                  {/* Avatar initial */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nocturn/10 text-nocturn text-sm font-bold">
                    {guest.name[0]?.toUpperCase() ?? "?"}
                  </div>

                  {/* Guest info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {guest.name}
                      </span>
                      {guest.plus_ones > 0 && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          +{guest.plus_ones}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${status.color}`}
                      >
                        <span
                          className={`h-1 w-1 rounded-full ${status.dotColor}`}
                        />
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {guest.email && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {guest.email}
                        </span>
                      )}
                      {guest.notes && (
                        <span className="text-[10px] text-muted-foreground italic truncate">
                          {guest.notes}
                        </span>
                      )}
                      {guest.checked_in_at && (
                        <span className="text-[10px] text-green-500">
                          In @{" "}
                          {new Date(guest.checked_in_at).toLocaleTimeString(
                            "en",
                            { hour: "numeric", minute: "2-digit" }
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {guest.status !== "checked_in" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-500 hover:bg-green-500/10 h-7 px-2"
                        onClick={() => handleCheckIn(guest.id)}
                        title="Check in"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {guest.status === "pending" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-500 hover:bg-blue-500/10 h-7 px-2"
                        onClick={() =>
                          handleStatusChange(guest.id, "confirmed")
                        }
                        title="Confirm"
                      >
                        <Users className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {guest.status !== "no_show" &&
                      guest.status !== "checked_in" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:bg-red-500/10 h-7 px-2"
                          onClick={() =>
                            handleStatusChange(guest.id, "no_show")
                          }
                          title="Mark no-show"
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10 h-7 px-2"
                      onClick={() => handleRemove(guest.id)}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
