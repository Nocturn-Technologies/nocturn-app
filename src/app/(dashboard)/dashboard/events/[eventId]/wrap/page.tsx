"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  DollarSign,
  Ticket,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Share2,
  Copy,
} from "lucide-react";
import Link from "next/link";

interface WrapData {
  eventTitle: string;
  eventDate: string;
  venueName: string;
  // Numbers
  totalRevenue: number;
  forecast: number;
  ticketsSold: number;
  capacity: number;
  checkIns: number;
  avgTicketPrice: number;
  // Timeline
  firstTicketSold: string | null;
  peakSalesHour: string | null;
  doorsOpened: string | null;
  peakCheckIn: string | null;
  lastCheckIn: string | null;
  // Tier breakdown
  tierBreakdown: Array<{ name: string; sold: number; capacity: number }>;
  // Promo codes used
  promoCodesUsed: number;
  // Settlement status
  hasSettlement: boolean;
}

function generateInsights(data: WrapData) {
  const sellThrough = data.capacity > 0 ? data.ticketsSold / data.capacity : 0;
  const checkInRate = data.ticketsSold > 0 ? data.checkIns / data.ticketsSold : 0;
  const vipTier = data.tierBreakdown.find(
    (t) => t.name.toLowerCase().includes("vip")
  );
  const vipSoldOut = vipTier ? vipTier.sold >= vipTier.capacity : false;

  const whatWorked: string[] = [];
  const whatToImprove: string[] = [];

  // What worked
  if (sellThrough > 0.8) {
    whatWorked.push("Strong demand -- consider higher pricing next time");
  }
  if (sellThrough > 0.5 && sellThrough <= 0.8) {
    whatWorked.push("Solid turnout -- room to grow with better promotion");
  }
  if (vipSoldOut) {
    whatWorked.push("VIP was popular -- add more VIP capacity");
  }
  if (checkInRate > 0.9) {
    whatWorked.push("Great show rate -- your audience is committed");
  }
  if (checkInRate > 0.75 && checkInRate <= 0.9) {
    whatWorked.push("Good attendance rate -- keep building loyalty");
  }
  if (data.totalRevenue > data.forecast && data.forecast > 0) {
    whatWorked.push("Beat your revenue forecast -- great execution");
  }
  if (whatWorked.length === 0) {
    whatWorked.push("Event completed successfully -- keep building momentum");
  }

  // What to improve
  if (sellThrough < 0.5) {
    whatToImprove.push("Low turnout -- review your promo strategy");
  }
  if (checkInRate < 0.7 && data.ticketsSold > 0) {
    const noShowPercent = Math.round((1 - checkInRate) * 100);
    whatToImprove.push(
      `${noShowPercent}% no-shows -- consider overbooking by 15%`
    );
  }
  if (data.promoCodesUsed === 0) {
    whatToImprove.push("No promo codes used -- try influencer codes next time");
  }
  if (data.totalRevenue < data.forecast && data.forecast > 0) {
    whatToImprove.push("Missed revenue forecast -- refine pricing or marketing");
  }
  if (whatToImprove.length === 0) {
    whatToImprove.push("No major issues detected -- keep up the great work");
  }

  return { whatWorked, whatToImprove };
}

function generateShareText(data: WrapData) {
  const sellThrough =
    data.capacity > 0
      ? Math.round((data.ticketsSold / data.capacity) * 100)
      : 0;
  const checkInRate =
    data.ticketsSold > 0
      ? Math.round((data.checkIns / data.ticketsSold) * 100)
      : 0;

  return [
    `Post-Event Wrap: ${data.eventTitle}`,
    `${data.eventDate} at ${data.venueName}`,
    "",
    `Tickets: ${data.ticketsSold}/${data.capacity} (${sellThrough}% sold)`,
    `Check-ins: ${data.checkIns} (${checkInRate}% show rate)`,
    `Revenue: $${data.totalRevenue.toLocaleString()}`,
    "",
    "Powered by Nocturn",
  ].join("\n");
}

export default function WrapPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [data, setData] = useState<WrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checklist, setChecklist] = useState<boolean[]>([
    false,
    false,
    false,
    false,
    false,
  ]);

  useEffect(() => {
    async function loadWrapData() {
      const supabase = createClient();

      try {
        // Fetch event
        const { data: event } = await supabase
          .from("events")
          .select(
            "id, title, starts_at, ends_at, doors_at, status, venue_id, collective_id, venues(name)"
          )
          .eq("id", eventId)
          .is("deleted_at", null)
          .maybeSingle();

        if (!event) {
          setError("Event not found");
          setLoading(false);
          return;
        }

        if (event.status !== "completed" && event.status !== "settled") {
          setError("This event has not completed yet");
          setLoading(false);
          return;
        }

        const venue = event.venues as unknown as { name: string } | null;

        // Ticket tiers
        const { data: tiers } = await supabase
          .from("ticket_tiers")
          .select("id, name, price, capacity")
          .eq("event_id", eventId);

        const totalCapacity = (tiers ?? []).reduce(
          (sum, t) => sum + (t.capacity ?? 0),
          0
        );

        // Tickets
        const { data: tickets } = await supabase
          .from("tickets")
          .select("id, price_paid, status, checked_in_at, created_at, ticket_tier_id, promo_code_id")
          .eq("event_id", eventId)
          .in("status", ["paid", "checked_in"]);

        const allTickets = tickets ?? [];
        const ticketsSold = allTickets.length;
        const totalRevenue = allTickets.reduce(
          (sum, t) => sum + (Number(t.price_paid) || 0),
          0
        );
        const checkIns = allTickets.filter(
          (t) => t.status === "checked_in"
        ).length;
        const avgPrice = ticketsSold > 0 ? totalRevenue / ticketsSold : 0;
        const promoCodesUsed = allTickets.filter(
          (t) => t.promo_code_id
        ).length;

        // Tier breakdown
        const tierBreakdown = (tiers ?? []).map((tier) => {
          const sold = allTickets.filter(
            (t) => t.ticket_tier_id === tier.id
          ).length;
          return { name: tier.name, sold, capacity: tier.capacity ?? 0 };
        });

        // Timeline calculations
        const ticketDates = allTickets
          .map((t) => t.created_at)
          .filter(Boolean)
          .sort();
        const firstTicketSold = ticketDates[0] ?? null;

        // Peak sales hour — group by hour, find max
        let peakSalesHour: string | null = null;
        if (ticketDates.length > 0) {
          const hourCounts: Record<string, number> = {};
          for (const d of ticketDates) {
            const hour = new Date(d).toLocaleTimeString("en", {
              hour: "numeric",
              minute: "2-digit",
            });
            hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
          }
          const maxHour = Object.entries(hourCounts).sort(
            (a, b) => b[1] - a[1]
          )[0];
          peakSalesHour = maxHour ? maxHour[0] : null;
        }

        // Doors opened
        const doorsOpened = event.doors_at
          ? new Date(event.doors_at).toLocaleTimeString("en", {
              hour: "numeric",
              minute: "2-digit",
            })
          : null;

        // Check-in times
        const checkInTimes = allTickets
          .map((t) => t.checked_in_at)
          .filter(Boolean)
          .sort() as string[];

        let peakCheckIn: string | null = null;
        if (checkInTimes.length > 0) {
          const ciHourCounts: Record<string, number> = {};
          for (const d of checkInTimes) {
            const hour = new Date(d).toLocaleTimeString("en", {
              hour: "numeric",
              minute: "2-digit",
            });
            ciHourCounts[hour] = (ciHourCounts[hour] ?? 0) + 1;
          }
          const maxCiHour = Object.entries(ciHourCounts).sort(
            (a, b) => b[1] - a[1]
          )[0];
          peakCheckIn = maxCiHour ? maxCiHour[0] : null;
        }

        const lastCheckIn = checkInTimes[checkInTimes.length - 1]
          ? new Date(
              checkInTimes[checkInTimes.length - 1]
            ).toLocaleTimeString("en", {
              hour: "numeric",
              minute: "2-digit",
            })
          : null;

        // Check settlement
        const { data: settlement } = await supabase
          .from("settlements")
          .select("id")
          .eq("event_id", eventId)
          .maybeSingle();

        setData({
          eventTitle: event.title,
          eventDate: new Date(event.starts_at).toLocaleDateString("en", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
          venueName: venue?.name ?? "Unknown Venue",
          totalRevenue,
          forecast: 0, // Could be extended to use actual forecast
          ticketsSold,
          capacity: totalCapacity,
          checkIns,
          avgTicketPrice: avgPrice,
          firstTicketSold: firstTicketSold
            ? new Date(firstTicketSold).toLocaleDateString("en", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : null,
          peakSalesHour,
          doorsOpened,
          peakCheckIn,
          lastCheckIn,
          tierBreakdown,
          promoCodesUsed,
          hasSettlement: !!settlement,
        });
      } catch (err) {
        console.error("[wrap] Failed to load data:", err);
        setError("Failed to load event data");
      }

      setLoading(false);
    }

    loadWrapData();
  }, [eventId]);

  function toggleChecklist(index: number) {
    setChecklist((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }

  async function handleShare() {
    if (!data) return;
    const text = generateShareText(data);

    if (navigator.share) {
      try {
        await navigator.share({ title: `Wrap: ${data.eventTitle}`, text });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <div className="text-4xl">☕</div>
        <p className="text-sm text-muted-foreground">
          Brewing your post-event wrap...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/events/${eventId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Post-Event Wrap</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {error || "Could not generate wrap"}
          </CardContent>
        </Card>
      </div>
    );
  }

  const sellThrough =
    data.capacity > 0
      ? Math.round((data.ticketsSold / data.capacity) * 100)
      : 0;
  const checkInRate =
    data.ticketsSold > 0
      ? Math.round((data.checkIns / data.ticketsSold) * 100)
      : 0;
  const { whatWorked, whatToImprove } = generateInsights(data);

  const actionItems = [
    "Settle with artists",
    "Send thank-you to venue",
    "Post recap on Instagram",
    "Review expenses and close out",
    "Send attendee survey",
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 animate-fade-in-up">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">☕</span>
            <h1 className="text-2xl font-bold">Post-Event Wrap</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data.eventTitle} &middot; {data.eventDate}
          </p>
          <p className="text-xs text-muted-foreground">{data.venueName}</p>
        </div>
      </div>

      {/* Section 1: The Numbers */}
      <Card className="animate-fade-in-up delay-100">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-green-500" />
            The Numbers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="text-xl font-bold">
                ${data.totalRevenue.toLocaleString()}
              </p>
              {data.forecast > 0 && (
                <p
                  className={`text-xs ${data.totalRevenue >= data.forecast ? "text-green-500" : "text-red-500"}`}
                >
                  {data.totalRevenue >= data.forecast ? "Above" : "Below"}{" "}
                  forecast
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Tickets Sold</p>
              <p className="text-xl font-bold">
                {data.ticketsSold}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {data.capacity}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {sellThrough}% sold
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Check-ins</p>
              <p className="text-xl font-bold">
                {data.checkIns}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {data.ticketsSold}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {checkInRate}% show rate
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Avg Ticket Price</p>
              <p className="text-xl font-bold">
                ${data.avgTicketPrice.toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Timeline */}
      <Card className="animate-fade-in-up delay-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-nocturn" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              {
                label: "First ticket sold",
                value: data.firstTicketSold,
              },
              {
                label: "Peak sales hour",
                value: data.peakSalesHour,
              },
              { label: "Doors opened", value: data.doorsOpened },
              { label: "Peak check-in", value: data.peakCheckIn },
              { label: "Last check-in", value: data.lastCheckIn },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium">{item.value ?? "--"}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: What Worked */}
      <Card className="border-l-4 border-l-green-500 animate-fade-in-up delay-300">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle className="h-4 w-4 text-green-500" />
            What Worked
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {whatWorked.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <TrendingUp className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-500" />
              <span>{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Section 4: What to Improve */}
      <Card className="border-l-4 border-l-yellow-500 animate-fade-in-up delay-400">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            What to Improve
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {whatToImprove.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-yellow-500" />
              <span>{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Section 5: Action Items */}
      <Card className="animate-fade-in-up delay-500">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-4 w-4 text-nocturn" />
            Action Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {actionItems.map((item, i) => (
            <button
              key={i}
              onClick={() => toggleChecklist(i)}
              className="flex items-center gap-3 w-full text-left text-sm py-1.5 min-h-[44px] group"
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                  checklist[i]
                    ? "bg-nocturn border-nocturn"
                    : "border-muted-foreground/30 group-hover:border-nocturn/50"
                }`}
              >
                {checklist[i] && (
                  <CheckCircle className="h-3.5 w-3.5 text-white" />
                )}
              </div>
              <span
                className={`transition-colors ${
                  checklist[i]
                    ? "line-through text-muted-foreground"
                    : "text-foreground"
                }`}
              >
                {item}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Section 6: Share Wrap */}
      <div className="animate-fade-in-up delay-700">
        <Button
          onClick={handleShare}
          className="w-full bg-nocturn hover:bg-nocturn-light min-h-[48px] rounded-2xl text-base font-semibold"
        >
          {copied ? (
            <>
              <Copy className="mr-2 h-4 w-4" />
              Copied to clipboard!
            </>
          ) : (
            <>
              <Share2 className="mr-2 h-4 w-4" />
              Share Wrap
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
