"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertCircle, Check } from "lucide-react";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { getMyCollectiveDefaults, updateCollectiveCurrency } from "@/app/actions/collective-settings";
import { PayoutsCard } from "@/components/settings/payouts-card";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collective fields
  const [collectiveId, setCollectiveId] = useState("");
  const [collectivePartyId, setCollectivePartyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [instagram, setInstagram] = useState("");
  const [website, setWebsite] = useState("");

  // User profile fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Load user profile
        const { data: profile } = await supabase
          .from("users")
          .select("full_name, phone")
          .eq("id", user.id)
          .maybeSingle();
        if (profile) {
          setFullName(profile.full_name ?? "");
          setPhone(profile.phone ?? "");
        }

        // Load first collective
        const { data: memberships } = await supabase
          .from("collective_members")
          .select("collective_id, collectives(*)")
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .limit(1);

        if (memberships && memberships.length > 0) {
          // Post-PR #93: collectives shape is lean. bio + city are first-class
          // columns on `collectives`. Instagram / website / other socials live
          // in `party_contact_methods` keyed by the collective's `party_id`
          // (DB_Data_Governance § 3 + Part 2.A). One row per (party_id, type).
          const c = memberships[0].collectives as unknown as {
            id: string;
            name: string;
            slug: string;
            bio: string | null;
            city: string | null;
            party_id: string | null;
          };
          setCollectiveId(c.id);
          setCollectivePartyId(c.party_id);
          setName(c.name);
          setSlug(c.slug);
          setBio(c.bio ?? "");
          setCity(c.city ?? "");

          if (c.party_id) {
            const { data: contacts } = await supabase
              .from("party_contact_methods")
              .select("type, value")
              .eq("party_id", c.party_id)
              .in("type", ["instagram", "website"]);
            const ig = contacts?.find((m) => m.type === "instagram");
            const web = contacts?.find((m) => m.type === "website");
            setInstagram(ig?.value ?? "");
            setWebsite(web?.value ?? "");
          } else {
            setInstagram("");
            setWebsite("");
          }
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [supabase]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error: profileError } = await supabase
      .from("users")
      .update({ full_name: fullName, phone: phone || null })
      .eq("id", user.id);

    if (profileError) {
      setError(profileError.message);
      setSaving(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => setSuccess(false), 5000);
    setSaving(false);
    router.refresh();
  }

  async function handleSaveCollective(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    // Post-PR #93: collectives carries name/slug/bio/city only.
    // Socials (instagram/website) write to `party_contact_methods` keyed by
    // the collective's `party_id` per DB_Data_Governance § 3.
    const { error: collectiveError } = await supabase
      .from("collectives")
      .update({
        name,
        slug,
        bio: bio || null,
        city: city || null,
      })
      .eq("id", collectiveId);

    if (collectiveError) {
      setError(collectiveError.message);
      setSaving(false);
      return;
    }

    if (collectivePartyId) {
      // For each social, upsert if a value is present, delete the row otherwise.
      // UNIQUE(party_id, type) makes onConflict deterministic.
      const upserts: Array<Promise<unknown>> = [];
      for (const [type, value] of [["instagram", instagram], ["website", website]] as const) {
        if (value && value.trim().length > 0) {
          upserts.push(
            supabase
              .from("party_contact_methods")
              .upsert(
                { party_id: collectivePartyId, type, value: value.trim(), is_primary: true },
                { onConflict: "party_id,type" }
              )
          );
        } else {
          upserts.push(
            supabase
              .from("party_contact_methods")
              .delete()
              .eq("party_id", collectivePartyId)
              .eq("type", type)
          );
        }
      }
      const results = await Promise.allSettled(upserts);
      const firstErr = results
        .map((r) => (r.status === "fulfilled" ? (r.value as { error: { message: string } | null }).error : null))
        .find((e) => e != null);
      if (firstErr) {
        setError(firstErr.message);
        setSaving(false);
        return;
      }
    }

    setSuccess(true);
    setTimeout(() => setSuccess(false), 5000);
    setSaving(false);
    router.refresh();
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="space-y-2">
          <div className="h-7 w-24 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-48 rounded-lg bg-muted animate-pulse" />
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
              </div>
            </div>
            <div className="h-10 w-28 rounded-md bg-muted animate-pulse" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
              </div>
            </div>
            <div className="h-10 w-32 rounded-md bg-muted animate-pulse" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 animate-in fade-in duration-300">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold font-heading">Couldn&apos;t load settings</h2>
          <p className="text-sm text-muted-foreground max-w-sm truncate">{loadError}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="min-h-[44px] transition-all duration-200 active:scale-[0.98]"
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden animate-in fade-in duration-300 max-w-3xl mx-auto">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold font-heading truncate">Settings</h1>
        <p className="text-sm text-muted-foreground truncate">
          Manage your profile and collective
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-500 animate-in fade-in slide-in-from-top-1 duration-200">
          Saved successfully!
        </div>
      )}

      {/* Profile + Collective: stacked on mobile, side-by-side on desktop */}
      <div className="grid gap-6 md:grid-cols-2">
      {/* Profile settings */}
      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
          <CardDescription>Personal information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="submit"
              className="bg-nocturn hover:bg-nocturn-light min-h-[44px] transition-all duration-200 active:scale-[0.98] disabled:active:scale-100"
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Saving..." : "Save Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator className="md:hidden" />

      {/* Collective settings */}
      <Card>
        <CardHeader>
          <CardTitle>Collective Settings</CardTitle>
          <CardDescription>
            Manage your collective&apos;s details and social presence
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveCollective} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="collectiveName">Collective name</Label>
                <Input
                  id="collectiveName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2 min-w-0">
                <Label htmlFor="collectiveSlug">URL slug</Label>
                <Input
                  id="collectiveSlug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground truncate">
                  nocturn.app/{slug}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="collectiveBio">Bio</Label>
              <Input
                id="collectiveBio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="What your collective is about"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="collectiveCity">City</Label>
                <Input
                  id="collectiveCity"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collectiveInstagram">Instagram</Label>
                <Input
                  id="collectiveInstagram"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@yourcollective"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collectiveWebsite">Website</Label>
                <Input
                  id="collectiveWebsite"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>
            <Button
              type="submit"
              className="bg-nocturn hover:bg-nocturn-light min-h-[44px] transition-all duration-200 active:scale-[0.98] disabled:active:scale-100"
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Saving..." : "Save Collective"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Default currency — set once, applies to every new event's budget P&L */}
      <CurrencyCard />
      </div>

      <Separator />

      {/* Payouts — Stripe Connect (Express) */}
      {collectiveId ? (
        <PayoutsCard collectiveId={collectiveId} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Payouts</CardTitle>
            <CardDescription>
              Create or join a collective to set up payouts.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}


// ─── Currency Card ──────────────────────────────────────────────────────────
// Sets the collective's default reporting currency for event budget P&L.
// Per-event override still lives in the event-creation wizard; this is just
// the starting value so Toronto collectives don't have to flip to CAD on
// every new event.

function CurrencyCard() {
  const [currency, setCurrency] = useState<string>("usd");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getMyCollectiveDefaults()
      .then(d => { if (d) setCurrency(d.defaultCurrency); })
      .catch(() => { /* keep USD default */ })
      .finally(() => setLoading(false));
  }, []);

  async function onSave() {
    setSaving(true);
    setErr(null);
    setSaved(false);
    const res = await updateCollectiveCurrency({ currency });
    if (res.error) setErr(res.error);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default currency</CardTitle>
        <CardDescription>
          The currency your event budgets report in. Each event can still override this
          in the Budget step — handy when you throw in a different country.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-sm">
          <Label htmlFor="defaultCurrency">Currency</Label>
          <select
            id="defaultCurrency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={loading || saving}
            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 text-sm text-white focus:border-nocturn/50 focus:outline-none min-h-[44px] disabled:opacity-50"
          >
            {SUPPORTED_CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>

        {err && (
          <p className="text-sm text-red-500 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" />
            {err}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={onSave}
            disabled={loading || saving}
            className="bg-nocturn hover:bg-nocturn-light min-h-[44px] transition-all duration-200 active:scale-[0.98] disabled:active:scale-100"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Saving..." : "Save currency"}
          </Button>
          {saved && (
            <span className="text-sm text-emerald-500 flex items-center gap-1.5 animate-fade-in">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
