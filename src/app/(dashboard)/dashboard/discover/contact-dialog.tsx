"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { sendInquiry } from "@/app/actions/marketplace";
import { posthog } from "@/lib/posthog";
import { Loader2, CheckCircle } from "lucide-react";

interface ContactDialogProps {
  profileId: string;
  profileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactDialog({
  profileId,
  profileName,
  open,
  onOpenChange,
}: ContactDialogProps) {
  const [message, setMessage] = useState("");
  const [eventId, setEventId] = useState("");
  const [events, setEvents] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user's upcoming events
  useEffect(() => {
    if (!open) return;

    async function fetchEvents() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("events")
          .select("id, title")
          .gt("starts_at", new Date().toISOString())
          .is("deleted_at", null)
          .order("starts_at", { ascending: true })
          .limit(20);

        setEvents((data as { id: string; title: string }[]) ?? []);
      } catch {
        // Ignore — events selector is optional
      }
    }

    fetchEvents();
  }, [open]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMessage("");
      setEventId("");
      setSuccess(false);
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await sendInquiry({
        toProfileId: profileId,
        eventId: eventId || null,
        message: message.trim(),
        inquiryType: "general",
      });

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        posthog.capture("marketplace_inquiry_sent", {
          category: "marketplace",
          city: null,
          has_event: !!eventId,
        });
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Contact {profileName}</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-7 w-7 text-green-400" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">Inquiry sent!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                They&apos;ll receive an email notification.
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-2 min-h-[44px]"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Event selector (optional) */}
            {events.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="event-select">
                  Related event{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <select
                  id="event-select"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base md:text-sm text-foreground transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  <option value="">No event</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Message textarea */}
            <div className="space-y-2">
              <Label htmlFor="inquiry-message">Message</Label>
              <textarea
                id="inquiry-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                required
                placeholder="Introduce yourself and what you're looking for..."
                rows={4}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none dark:bg-input/30"
              />
              <p className="text-xs text-muted-foreground text-right">
                {message.length}/500
              </p>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading || !message.trim()}
              className="w-full bg-nocturn hover:bg-nocturn-light text-white min-h-[44px]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Inquiry"
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
