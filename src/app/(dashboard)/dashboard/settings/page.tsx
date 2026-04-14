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
import { Loader2, AlertCircle } from "lucide-react";

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
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [instagram, setInstagram] = useState("");
  const [website, setWebsite] = useState("");
  const [collectiveMetadata, setCollectiveMetadata] = useState<Record<string, unknown> | null>(null);

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
          const c = memberships[0].collectives as unknown as {
            id: string;
            name: string;
            slug: string;
            description: string | null;
            instagram: string | null;
            website: string | null;
            metadata: { city?: string } | null;
          };
          setCollectiveId(c.id);
          setName(c.name);
          setSlug(c.slug);
          setBio(c.description ?? "");
          setCity(c.metadata?.city ?? "");
          setInstagram(c.instagram ?? "");
          setWebsite(c.website ?? "");
          setCollectiveMetadata(c.metadata ?? null);
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
    setSaving(false);
    router.refresh();
  }

  async function handleSaveCollective(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const { error: collectiveError } = await supabase
      .from("collectives")
      .update({
        name,
        slug,
        description: bio || null,
        instagram: instagram || null,
        website: website || null,
        metadata: { ...(collectiveMetadata ?? {}), city },
      })
      .eq("id", collectiveId);

    if (collectiveError) {
      setError(collectiveError.message);
      setSaving(false);
      return;
    }

    setSuccess(true);
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
    <div className="space-y-6 overflow-x-hidden animate-in fade-in duration-300">
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

      <Separator />

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

      <Separator />

      {/* Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            Ticket payments are processed by Nocturn. Payouts are handled manually after each event settlement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                <svg
                  className="h-3 w-3 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <span className="text-sm font-medium text-emerald-500">
                Payments Active
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Your events can accept ticket payments. After each event, generate a settlement
              in the Finance tab and mark it as paid once you&apos;ve sent the payout.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
