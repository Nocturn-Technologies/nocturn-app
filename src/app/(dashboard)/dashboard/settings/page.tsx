"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  createConnectAccount,
  getConnectAccountStatus,
  createConnectLoginLink,
} from "@/app/actions/stripe";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
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

  // Stripe Connect state
  const searchParams = useSearchParams();
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<{
    hasAccount: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  } | null>(null);
  const stripeParam = searchParams.get("stripe");

  // User profile fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    async function load() {
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

        // Load Stripe Connect status
        const status = await getConnectAccountStatus(c.id);
        setStripeStatus(status);
      }
      setLoading(false);
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
        metadata: { city },
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
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and collective
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-500">
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
            <Button type="submit" className="bg-nocturn hover:bg-nocturn-light" disabled={saving}>
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
              <div className="space-y-2">
                <Label htmlFor="collectiveSlug">URL slug</Label>
                <Input
                  id="collectiveSlug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
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
            <Button type="submit" className="bg-nocturn hover:bg-nocturn-light" disabled={saving}>
              {saving ? "Saving..." : "Save Collective"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      {/* Stripe Connect */}
      <Card>
        <CardHeader>
          <CardTitle>Stripe Connect</CardTitle>
          <CardDescription>
            Connect a Stripe account to accept payments and receive payouts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stripeParam === "connected" && (
            <div className="mb-4 rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-500">
              Stripe onboarding complete! Your account status will update
              shortly.
            </div>
          )}

          {!stripeStatus || !stripeStatus.hasAccount ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect a Stripe Express account to start accepting ticket
                payments for your events.
              </p>
              <Button
                className="bg-nocturn hover:bg-nocturn-light"
                disabled={stripeLoading || !collectiveId}
                onClick={async () => {
                  setStripeLoading(true);
                  const result = await createConnectAccount(collectiveId);
                  if (result.url) {
                    window.location.href = result.url;
                  } else {
                    setError(result.error ?? "Failed to create Stripe account");
                    setStripeLoading(false);
                  }
                }}
              >
                {stripeLoading ? "Connecting..." : "Connect Stripe"}
              </Button>
            </div>
          ) : stripeStatus.chargesEnabled && stripeStatus.payoutsEnabled ? (
            <div className="space-y-3">
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
                  Stripe Connected
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Your account is fully set up. Charges and payouts are enabled.
              </p>
              <Button
                variant="outline"
                disabled={stripeLoading}
                onClick={async () => {
                  setStripeLoading(true);
                  const result = await createConnectLoginLink(collectiveId);
                  if (result.url) {
                    window.open(result.url, "_blank");
                  } else {
                    setError(
                      result.error ?? "Failed to open Stripe Dashboard"
                    );
                  }
                  setStripeLoading(false);
                }}
              >
                Open Stripe Dashboard
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
                Your Stripe account setup is incomplete. Please complete the
                onboarding to start accepting payments.
              </div>
              <Button
                className="bg-nocturn hover:bg-nocturn-light"
                disabled={stripeLoading}
                onClick={async () => {
                  setStripeLoading(true);
                  const result = await createConnectAccount(collectiveId);
                  if (result.url) {
                    window.location.href = result.url;
                  } else {
                    setError(result.error ?? "Failed to resume Stripe setup");
                    setStripeLoading(false);
                  }
                }}
              >
                {stripeLoading ? "Loading..." : "Complete Setup"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
