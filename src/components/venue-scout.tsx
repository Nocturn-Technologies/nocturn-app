"use client";

import { useState } from "react";
import { X, Star, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveVenueScoutNotes } from "@/app/actions/venue-scout";

interface VenueScoutProps {
  venuePlaceId: string;
  venueName: string;
  onClose: () => void;
}

export function VenueScout({ venuePlaceId, venueName, onClose }: VenueScoutProps) {
  const [soundQuality, setSoundQuality] = useState(0);
  const [crowdEstimate, setCrowdEstimate] = useState("");
  const [vibeNotes, setVibeNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (saving) return;
    setSaving(true);

    const { error } = await saveVenueScoutNotes({
      place_id: venuePlaceId,
      sound_quality: soundQuality,
      crowd_estimate: crowdEstimate ? parseInt(crowdEstimate, 10) : null,
      vibe_notes: vibeNotes,
      scouted_at: new Date().toISOString(),
    });

    setSaving(false);

    if (!error) {
      setSaved(true);
      setTimeout(onClose, 1200);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-t-2xl bg-card p-6 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold">Scout Report</h2>
            <p className="text-sm text-muted-foreground">{venueName}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Sound Quality */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Sound Quality</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setSoundQuality(n)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors"
                >
                  <Star
                    className={`h-6 w-6 transition-colors ${
                      n <= soundQuality
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Crowd Estimate */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Crowd Size Estimate</label>
            <input
              type="number"
              value={crowdEstimate}
              onChange={(e) => setCrowdEstimate(e.target.value)}
              placeholder="e.g. 250"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-nocturn"
            />
          </div>

          {/* Vibe Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Vibe Notes</label>
            <textarea
              value={vibeNotes}
              onChange={(e) => setVibeNotes(e.target.value)}
              placeholder="Sound system hits hard, lighting needs work, great energy from the crowd..."
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-nocturn resize-none"
            />
          </div>

          {/* Photo upload placeholder */}
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Photo upload coming soon
            </p>
          </div>

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={saving || saved}
            className="w-full bg-nocturn hover:bg-nocturn-light text-white"
          >
            {saved ? (
              "Saved!"
            ) : saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Scout Report
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
