"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NocturnLogo } from "@/components/nocturn-logo";
import { Button } from "@/components/ui/button";
import { Clock, LogOut, RefreshCw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PendingApprovalPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [isDenied, setIsDenied] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? null);
        if (user.user_metadata?.is_denied) {
          setIsDenied(true);
        }
      }
    });
  }, [supabase]);

  // Auto-redirect to login 5 seconds after denial
  useEffect(() => {
    if (!isDenied) return;
    const timer = setTimeout(() => {
      router.push("/login");
    }, 5000);
    return () => clearTimeout(timer);
  }, [isDenied, router]);

  async function handleCheck() {
    setChecking(true);
    // Re-fetch user metadata to see if approved
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.is_denied) {
      setIsDenied(true);
      setChecking(false);
      return;
    }

    if (user?.user_metadata?.is_approved) {
      router.push("/dashboard");
      return;
    }

    // Also check the users table directly
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("users") as any)
        .select("is_approved, is_denied")
        .eq("id", user.id)
        .maybeSingle();

      if (data?.is_denied) {
        setIsDenied(true);
        setChecking(false);
        return;
      }

      if (data?.is_approved) {
        router.push("/dashboard");
        return;
      }
    }

    setChecking(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-8 text-center">
        <NocturnLogo size="lg" />

        <div className="flex justify-center">
          <div className={`flex h-20 w-20 items-center justify-center rounded-full ${isDenied ? "bg-red-500/10" : "bg-amber-500/10"}`}>
            {isDenied ? (
              <XCircle className="h-10 w-10 text-red-500" />
            ) : (
              <Clock className="h-10 w-10 text-amber-500" />
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold">
            {isDenied ? "Your application was not approved" : "Your account is pending approval"}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            {isDenied
              ? "Unfortunately, your account application was not approved at this time. If you believe this is an error, please contact us at shawn@trynocturn.com."
              : "We review every collective and promoter account to keep the platform quality high. You'll get an email once you're approved — usually within 24 hours."}
          </p>
          {email && (
            <p className="text-sm text-muted-foreground">
              Signed up as <span className="text-foreground font-medium">{email}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Button
            className="bg-nocturn hover:bg-nocturn-light w-full"
            onClick={handleCheck}
            disabled={checking || isDenied}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking..." : "Check Approval Status"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
