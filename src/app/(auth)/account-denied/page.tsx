"use client";

import { createClient } from "@/lib/supabase/client";
import { NocturnLogo } from "@/components/nocturn-logo";
import { Button } from "@/components/ui/button";
import { LogOut, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AccountDeniedPage() {
  const supabase = createClient();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-8 text-center">
        <NocturnLogo size="lg" />

        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
            <XCircle className="h-10 w-10 text-red-500" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold">Your account application was denied</h1>
          <p className="text-muted-foreground leading-relaxed">
            Unfortunately, your account was not approved at this time.
            If you believe this was a mistake, please reach out to us at{" "}
            <a href="mailto:shawn@trynocturn.com" className="text-nocturn hover:underline">
              shawn@trynocturn.com
            </a>.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button variant="ghost" className="w-full" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
