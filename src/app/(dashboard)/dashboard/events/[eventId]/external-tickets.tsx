"use client";

import { useState } from "react";
import { saveExternalTicketData } from "@/app/actions/external-tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Check, Loader2, ChevronDown, ChevronUp } from "lucide-react";

const PLATFORMS = [
  "Eventbrite",
  "Posh",
  "Dice",
  "RA",
  "Shotgun",
  "Partiful",
  "Humanitix",
  "Other",
];

interface ExternalTicketsFormProps {
  eventId: string;
  initial?: {
    platform: string;
    ticketsSold: number;
    revenue: number;
    ticketUrl: string | null;
  } | null;
}

export function ExternalTicketsForm({ eventId, initial }: ExternalTicketsFormProps) {
  const [expanded, setExpanded] = useState(!!initial);
  const [platform, setPlatform] = useState(initial?.platform ?? "");
  const [ticketsSold, setTicketsSold] = useState(initial?.ticketsSold?.toString() ?? "");
  const [revenue, setRevenue] = useState(initial?.revenue?.toString() ?? "");
  const [ticketUrl, setTicketUrl] = useState(initial?.ticketUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const result = await saveExternalTicketData({
      eventId,
      platform,
      ticketsSold: parseInt(ticketsSold) || 0,
      revenue: parseFloat(revenue) || 0,
      ticketUrl: ticketUrl.trim() || null,
    });

    setSaving(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full rounded-2xl border border-dashed border-nocturn/20 p-4 text-left hover:border-nocturn/40 hover:bg-nocturn/[0.03] transition-all duration-200 min-h-[44px]"
      >
        <div className="flex items-center gap-3">
          <ExternalLink className="h-4 w-4 text-nocturn shrink-0" />
          <div>
            <p className="text-sm font-medium">Selling tickets elsewhere?</p>
            <p className="text-xs text-muted-foreground">
              Import your numbers so analytics stay complete
            </p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
        </div>
      </button>
    );
  }

  return (
    <Card className="rounded-2xl border-nocturn/20 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <ExternalLink className="h-4 w-4 text-nocturn" />
            External Ticket Data
          </CardTitle>
          <button
            onClick={() => setExpanded(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent active:scale-95 transition-all duration-200"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Ticketing on another platform? Enter your numbers here so Nocturn can include them in analytics.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          {/* Platform */}
          <div className="space-y-2">
            <Label className="text-xs">Platform</Label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 min-h-[36px] active:scale-95 ${
                    platform === p
                      ? "bg-nocturn text-white shadow-sm shadow-nocturn/20"
                      : "bg-accent text-muted-foreground hover:text-foreground hover:bg-accent/80"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Numbers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="extTickets" className="text-xs">Tickets Sold</Label>
              <Input
                id="extTickets"
                type="number"
                min="0"
                placeholder="0"
                value={ticketsSold}
                onChange={(e) => setTicketsSold(e.target.value)}
                className="text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="extRevenue" className="text-xs">Revenue ($)</Label>
              <Input
                id="extRevenue"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                className="text-base"
              />
            </div>
          </div>

          {/* Ticket URL */}
          <div className="space-y-1.5">
            <Label htmlFor="extUrl" className="text-xs">Ticket Link (optional)</Label>
            <Input
              id="extUrl"
              type="url"
              placeholder="https://eventbrite.com/e/your-event"
              value={ticketUrl}
              onChange={(e) => setTicketUrl(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            type="submit"
            disabled={saving || !platform}
            className="w-full bg-nocturn hover:bg-nocturn-light min-h-[44px] active:scale-[0.98] transition-all duration-200"
          >
            {saving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
            ) : saved ? (
              <><Check className="mr-2 h-4 w-4" /> Saved</>
            ) : initial ? (
              "Update Numbers"
            ) : (
              "Save Ticket Data"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
