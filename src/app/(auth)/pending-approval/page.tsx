"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Clock, LogOut, RefreshCw, Mail } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PendingApprovalPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setEmail(user.email ?? null);
    });
  }, [supabase]);

  async function handleCheck() {
    setChecking(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from("users")
        .select("is_approved")
        .eq("id", user.id)
        .maybeSingle();

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
    <div className="rounded-2xl border border-white/[0.06] bg-card/80 backdrop-blur-xl p-6 md:p-7 shadow-[0_20px_60px_-20px_rgba(123,47,247,0.25)]">
      <div className="flex flex-col items-center">
        <div
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-500/20"
          style={{ animation: "pulseGlow 3s ease-in-out infinite" }}
        >
          <Clock className="h-7 w-7 text-amber-400" />
        </div>

        <h1 className="mt-5 text-lg font-bold font-heading text-foreground">
          Pending approval
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground leading-relaxed max-w-[300px]">
          We review every account to keep quality high. You&apos;ll get an email once approved — usually within 24 hours.
        </p>

        {email && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-zinc-300">{email}</span>
          </div>
        )}
      </div>

      <div className="my-6 h-px bg-white/[0.06]" />

      <div className="space-y-2.5">
        <Button
          className="w-full h-11 rounded-xl bg-nocturn hover:bg-nocturn-light text-white text-sm font-medium"
          onClick={handleCheck}
          disabled={checking}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Checking..." : "Check approval status"}
        </Button>

        <button
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 w-full h-11 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
