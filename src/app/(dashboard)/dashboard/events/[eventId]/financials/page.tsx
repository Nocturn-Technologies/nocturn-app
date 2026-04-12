import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ArrowLeft, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getEventFinancials } from "@/app/actions/event-financials";
import { generateEventForecast } from "@/app/actions/ai-finance";
import { EventPnlSpreadsheet } from "@/components/event-pnl-spreadsheet";
import { EventFinancialsDashboard } from "@/components/event-financials-dashboard";

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function EventFinancialsPage({ params }: Props) {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  // Parallel fetch — financials is the source of truth for the spreadsheet,
  // forecast powers the scenario projections. skipNarrative avoids the slow
  // Claude call on SSR since we only render the rule-based insights.
  const [financialsResult, forecastResult] = await Promise.all([
    getEventFinancials(eventId),
    generateEventForecast(eventId, { skipNarrative: true }),
  ]);

  if (financialsResult.error || !financialsResult.data) {
    notFound();
  }

  const financials = financialsResult.data;
  const forecast = forecastResult.error ? null : forecastResult.forecast ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in fade-in duration-500 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 hover:bg-accent active:scale-95 transition-all duration-200 min-h-[44px] min-w-[44px]"
            aria-label="Back to event"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-nocturn" />
            <h1 className="text-2xl font-bold font-heading truncate">Financials</h1>
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {financials.eventTitle}
          </p>
        </div>
      </div>

      {/* At-a-glance dashboard: P&L + forecast + AI insights */}
      <EventFinancialsDashboard financials={financials} forecast={forecast} />

      {/* Full editable spreadsheet for line-item management */}
      <EventPnlSpreadsheet financials={financials} />
    </div>
  );
}
