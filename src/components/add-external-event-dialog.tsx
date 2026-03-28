"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, Check, ExternalLink } from "lucide-react";
import { addExternalEvent } from "@/app/actions/external-events";

export function AddExternalEventDialog({ onAdded }: { onAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [venueName, setVenueName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    setLoading(true);
    setError(null);

    const result = await addExternalEvent({
      title: title.trim(),
      externalUrl: url.trim(),
      eventDate: eventDate || undefined,
      venueName: venueName || undefined,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.link) {
      // Copy to clipboard
      await navigator.clipboard.writeText(result.link);
      setCopiedLink(result.link);
      setTimeout(() => {
        setCopiedLink(null);
        setOpen(false);
        setTitle("");
        setUrl("");
        setEventDate("");
        setVenueName("");
        onAdded?.();
      }, 2000);
    }
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        Add External Event
      </Button>
    );
  }

  if (copiedLink) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 space-y-2 animate-fade-in-up">
        <div className="flex items-center gap-2 text-green-400">
          <Check className="h-4 w-4" />
          <p className="text-sm font-medium">Link copied to clipboard!</p>
        </div>
        <p className="text-xs text-muted-foreground break-all">{copiedLink}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-nocturn" />
          <p className="text-sm font-semibold">Add External Event</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ext-url" className="text-xs">Event URL *</Label>
          <Input
            id="ext-url"
            type="url"
            placeholder="https://eventbrite.com/e/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ext-title" className="text-xs">Event Name *</Label>
          <Input
            id="ext-title"
            type="text"
            placeholder="e.g. Saturday Night Live at CODA"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="ext-date" className="text-xs">Date (optional)</Label>
            <Input
              id="ext-date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ext-venue" className="text-xs">Venue (optional)</Label>
            <Input
              id="ext-venue"
              type="text"
              placeholder="e.g. CODA"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button
          type="submit"
          className="w-full bg-nocturn hover:bg-nocturn-light"
          disabled={loading || !title.trim() || !url.trim()}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating link...
            </>
          ) : (
            "Create Tracked Link"
          )}
        </Button>
      </form>
    </div>
  );
}
