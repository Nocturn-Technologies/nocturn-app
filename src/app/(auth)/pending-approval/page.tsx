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
      if (user) {
        setEmail(user.email ?? null);
      }
    });
  }, [supabase]);

  async function handleCheck() {
    setChecking(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase.from("users")
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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#09090B] px-4 overflow-x-hidden">
      {/* Subtle background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-nocturn/[0.04] blur-[120px]" />
      </div>

      <div className="relative w-full max-w-[380px]">
        {/* Logo — centered */}
        <div className="flex justify-center mb-10">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🌙</span>
            <span className="text-3xl font-bold tracking-tight font-heading text-white">
              nocturn.
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.06] bg-card p-6">
          {/* Status icon */}
          <div className="flex justify-center mb-5">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-500/20"
            >
              <Clock className="h-7 w-7 text-amber-400" />
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-center text-lg font-semibold text-white mb-2">Pending approval</h1>

          {/* Description */}
          <p className="text-center text-sm text-zinc-400 leading-relaxed mb-1">
            We review every account to keep quality high. You'll get an email once approved — usually within 24 hours.
          </p>

          {/* Email badge */}
          {email && (
            <div className="flex items-center justify-center gap-1.5 mt-4 mb-6">
              <div className="flex items-center gap-2 rounded-full bg-white/[0.04] border border-white/[0.06] px-3 py-1.5">
                <Mail className="h-3 w-3 text-zinc-500" />
                <span className="text-xs text-zinc-300">{email}</span>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-white/[0.06] mb-5" />

          {/* Actions */}
          <div className="space-y-2.5">
            <Button
              className="w-full h-11 rounded-xl bg-nocturn hover:bg-nocturn-light text-white text-sm font-medium"
              onClick={handleCheck}
              disabled={checking}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`}
              />
              {checking ? "Checking..." : "Check Approval Status"}
            </Button>

            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 w-full py-2.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors min-h-[44px]"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
