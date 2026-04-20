import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ArrowLeft, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getEventFinancials } from "@/app/actions/event-financials";
import { generateEventForecast, getTicketSalesTrajectory } from "@/app/actions/ai-finance";
import { EventPnlSpreadsheet } from "@/components/event-pnl-spreadsheet";
import { EventFinancialsDashboard } from "@/components/event-financials-dashboard";
import { SettlementActions } from "@/components/finance/settlement-actions";
import { createAdminClient } from "@/lib/supabase/config";

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
  // Settlement lookup is a direct DB read — no dedicated action exists for
  // "settlement by event id" and spinning one up just for this path is not
  // worth it.
  const admin = createAdminClient();
  const [financialsResult, forecastResult, trajectoryResult, settlementResult] = await Promise.all([
    getEventFinancials(eventId),
    generateEventForecast(eventId, { skipNarrative: true }),
    getTicketSalesTrajectory(eventId),
    admin
      .from("settlements")
      .select("id, status, collective_id, net_payout")
      .eq("event_id", eventId)
      .maybeSingle(),
  ]);

  if (financialsResult.error || !financialsResult.data) {
    notFound();
  }

  const financials = financialsResult.data;
  const forecast = forecastResult.error ? null : forecastResult.forecast ?? null;
  const trajectory = trajectoryResult.error ? null : trajectoryResult.trajectory ?? null;
  const settlement = settlementResult.data;

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
      <EventFinancialsDashboard financials={financials} forecast={forecast} trajectory={trajectory} />

      {/* Full editable spreadsheet for line-item management */}
      <EventPnlSpreadsheet financials={financials} />

      {/* Settlement actions — approve + payout via Stripe Connect */}
      {settlement && (
        <SettlementActions
          settlementId={settlement.id}
          collectiveId={settlement.collective_id}
          eventId={eventId}
          status={settlement.status as "draft" | "pending_approval" | "approved" | "paid_out"}
          profit={Number(settlement.net_payout) || 0}
        />
      )}
    </div>
  );
}
