"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { publishEvent, cancelEvent, completeEvent } from "@/app/actions/events";
import { Button } from "@/components/ui/button";
import { Send, XCircle, CheckCircle } from "lucide-react";

export function EventStatusActions({
  eventId,
  status,
}: {
  eventId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(
    action: (id: string) => Promise<{ error: string | null }>,
    actionName: string
  ) {
    setLoading(actionName);
    setError(null);

    const result = await action(eventId);

    if (result.error) {
      setError(result.error);
      setLoading(null);
      return;
    }

    setLoading(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive animate-in fade-in duration-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <Button
            className="bg-green-600 hover:bg-green-700 active:scale-95 text-white transition-all duration-200"
            onClick={() => handleAction(publishEvent, "publish")}
            disabled={loading !== null}
          >
            {loading === "publish" ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Publishing...
              </span>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Publish Event
              </>
            )}
          </Button>
        )}

        {status === "published" && (
          <>
            <Button
              className="bg-nocturn hover:bg-nocturn-light active:scale-95 transition-all duration-200"
              onClick={() => handleAction(completeEvent, "complete")}
              disabled={loading !== null}
            >
              {loading === "complete" ? (
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Completing...
                </span>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark Complete
                </>
              )}
            </Button>

            <Button
              variant="destructive"
              className="active:scale-95 transition-all duration-200"
              onClick={() => handleAction(cancelEvent, "cancel")}
              disabled={loading !== null}
            >
              {loading === "cancel" ? (
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Cancelling...
                </span>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel Event
                </>
              )}
            </Button>
          </>
        )}

        {(status === "completed" || status === "cancelled") && (
          <p className="text-sm text-muted-foreground italic">
            This event is {status}. No further actions available.
          </p>
        )}
      </div>
    </div>
  );
}
