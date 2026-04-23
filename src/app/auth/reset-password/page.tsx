"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// B22: gate the form on a valid Supabase recovery session.
// Previously this page would render the New/Confirm inputs unconditionally,
// so users who hit the URL directly (no email flow) got a form that looked
// functional but the submit would always fail server-side. Now we wait for
// `getSession()` to confirm a recovery session exists; if it doesn't, show a
// clear expired/invalid-link state with a way to request a new one.

// B25: password minimum lifted from 6 → 8 to match signup placeholder.
const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // "checking" = awaiting initial session read; "ready" = recovery session is
  // valid (form can render); "invalid" = no valid recovery → show the expired
  // link empty state.
  const [gateState, setGateState] = useState<"checking" | "ready" | "invalid">(
    "checking",
  );

  useEffect(() => {
    let cancelled = false;

    // Supabase fires onAuthStateChange(event='PASSWORD_RECOVERY', session)
    // when the user lands via a reset email. Listen for that, and also check
    // the current session on mount for the hash-already-consumed case.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        setGateState("ready");
      }
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      // If we already have a session AND the URL came from a recovery flow,
      // treat it as ready. Otherwise show the invalid-link state.
      const hasRecoveryHash =
        typeof window !== "undefined" &&
        window.location.hash.includes("type=recovery");
      if (data.session && hasRecoveryHash) {
        setGateState("ready");
      } else if (!data.session) {
        setGateState("invalid");
      }
      // If we have a session but no recovery hash, wait for the auth state
      // event to fire — leave state as "checking" for a brief moment.
      setTimeout(() => {
        if (!cancelled && gateState === "checking") {
          setGateState((prev) => (prev === "checking" ? (data.session ? "ready" : "invalid") : prev));
        }
      }, 800);
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 2000);
  }

  if (done) {
    return (
      <div className="flex min-h-dvh overflow-x-hidden items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>Password updated</CardTitle>
            <CardDescription>Redirecting to dashboard...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (gateState === "checking") {
    return (
      <div className="flex min-h-dvh overflow-x-hidden items-center justify-center px-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (gateState === "invalid") {
    return (
      <div className="flex min-h-dvh overflow-x-hidden items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>Reset link expired</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired. Request a new one from the sign-in page.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link href="/login">
              <Button variant="ghost" className="min-h-[44px]">
                Back to login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh overflow-x-hidden items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set new password</CardTitle>
          <CardDescription>Enter your new password below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="Repeat your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full bg-nocturn hover:bg-nocturn-light"
              disabled={loading}
            >
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
