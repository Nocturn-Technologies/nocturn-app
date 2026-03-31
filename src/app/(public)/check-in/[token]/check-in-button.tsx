"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkInTicket } from "@/app/actions/check-in";
import { Button } from "@/components/ui/button";

interface PublicCheckInButtonProps {
  ticketToken: string;
  eventId: string;
}

export function PublicCheckInButton({
  ticketToken,
  eventId,
}: PublicCheckInButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  async function handleCheckIn() {
    setLoading(true);
    const res = await checkInTicket(ticketToken, eventId);

    if (res.success) {
      setResult({ success: true, message: "Checked in successfully!" });
      // Refresh the page data so server component reflects checked-in state
      router.refresh();
    } else {
      setResult({ success: false, message: res.error ?? "Check-in failed" });
    }
    setLoading(false);
  }

  if (result) {
    return (
      <div
        className={`w-full rounded-xl p-4 text-center ${
          result.success
            ? "bg-green-500/10 border border-green-500/30"
            : "bg-red-500/10 border border-red-500/30"
        }`}
      >
        <p
          className={`font-semibold ${
            result.success ? "text-green-500" : "text-red-500"
          }`}
        >
          {result.message}
        </p>
        {result.success && (
          <p className="text-xs text-muted-foreground mt-1">
            You may now enter the venue
          </p>
        )}
      </div>
    );
  }

  return (
    <Button
      onClick={handleCheckIn}
      disabled={loading}
      className="w-full bg-nocturn hover:bg-nocturn-light text-white font-semibold py-6 text-base"
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          Checking in...
        </span>
      ) : (
        "Check In Now"
      )}
    </Button>
  );
}
