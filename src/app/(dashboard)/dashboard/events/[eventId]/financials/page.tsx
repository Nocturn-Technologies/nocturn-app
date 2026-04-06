import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ArrowLeft, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getEventFinancials } from "@/app/actions/event-financials";
import { EventPnlSpreadsheet } from "@/components/event-pnl-spreadsheet";

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

  const { error, data: financials } = await getEventFinancials(eventId);

  if (error || !financials) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 hover:bg-accent active:scale-95 transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-nocturn" />
            <h1 className="text-2xl font-bold font-heading truncate">P&L</h1>
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {financials.eventTitle}
          </p>
        </div>
      </div>

      {/* Spreadsheet */}
      <EventPnlSpreadsheet financials={financials} />
    </div>
  );
}
