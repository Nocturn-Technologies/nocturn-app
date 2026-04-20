"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MessageSquareHeart, CheckCircle2, Loader2 } from "lucide-react";
import { startCollabChat } from "@/app/actions/collab";
import { haptic } from "@/lib/haptics";

interface PitchCollabButtonProps {
  myCollectiveId?: string;
  targetCollectiveId: string;
  targetName: string;
}

export function PitchCollabButton({
  myCollectiveId,
  targetCollectiveId,
  targetName,
}: PitchCollabButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = !myCollectiveId || loading || connected;

  async function handleClick() {
    if (!myCollectiveId) {
      setError("You need to be part of a collective to pitch a collab.");
      return;
    }
    haptic("medium");
    setLoading(true);
    setError(null);
    const result = await startCollabChat(myCollectiveId, targetCollectiveId);
    setLoading(false);
    if (result.error || !result.channelId) {
      setError(result.error ?? "Couldn't start the chat");
      return;
    }
    setConnected(true);
    router.push(`/dashboard/chat?channel=${result.channelId}`);
  }

  return (
    <div className="rounded-2xl border border-nocturn/20 bg-gradient-to-r from-nocturn/10 via-nocturn/5 to-transparent p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold font-heading">Want to throw something together?</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Start a collab chat with {targetName}. We&apos;ll pre-fill an intro.
        </p>
      </div>
      <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
        <Button
          size="xl"
          className={`min-w-[180px] ${
            connected
              ? "bg-emerald-600 hover:bg-emerald-500 text-white"
              : "bg-nocturn hover:bg-nocturn-light text-white"
          }`}
          disabled={disabled}
          onClick={handleClick}
        >
          {connected ? (
            <>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Opening chat…
            </>
          ) : loading ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Starting chat…
            </>
          ) : (
            <>
              <MessageSquareHeart className="mr-1.5 h-4 w-4" />
              Pitch a collab
            </>
          )}
        </Button>
        {error && <p className="text-[11px] text-red-400 text-right">{error}</p>}
        {!myCollectiveId && !error && (
          <p className="text-[11px] text-muted-foreground text-right">
            Join or create a collective first.
          </p>
        )}
      </div>
    </div>
  );
}
