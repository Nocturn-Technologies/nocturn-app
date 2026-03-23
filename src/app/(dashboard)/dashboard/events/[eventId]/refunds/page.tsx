"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, RotateCcw, AlertTriangle, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { getRefundableTickets, refundTicket } from "@/app/actions/refunds";

interface RefundableTicket {
  id: string;
  email: string;
  tierName: string;
  pricePaid: number;
  status: string;
  purchasedAt: string;
}

export default function RefundsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [tickets, setTickets] = useState<RefundableTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [refunded, setRefunded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    const result = await getRefundableTickets(eventId);
    if (result.tickets) setTickets(result.tickets);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  async function handleRefund(ticketId: string) {
    if (!confirm("Are you sure you want to refund this ticket? This cannot be undone.")) return;

    setRefunding(ticketId);
    setError(null);

    const result = await refundTicket(ticketId);

    if (result.error) {
      setError(result.error);
    } else {
      setRefunded((prev) => new Set(prev).add(ticketId));
      // Remove from list after animation
      setTimeout(() => {
        setTickets((prev) => prev.filter((t) => t.id !== ticketId));
      }, 1500);
    }

    setRefunding(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-nocturn" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}`}>
          <Button variant="ghost" size="icon" aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-nocturn" />
            Refunds
          </h1>
          <p className="text-sm text-muted-foreground">{tickets.length} refundable ticket{tickets.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Check className="h-10 w-10 text-green-400" />
            <p className="font-medium">No refundable tickets</p>
            <p className="text-sm text-muted-foreground">All tickets for this event are either free or already refunded.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => {
            const isRefunded = refunded.has(ticket.id);
            const isRefunding = refunding === ticket.id;

            return (
              <div
                key={ticket.id}
                className={`rounded-lg border p-3 flex items-center justify-between transition-all ${
                  isRefunded
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-border"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{ticket.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ticket.tierName} · ${ticket.pricePaid.toFixed(2)} · {new Date(ticket.purchasedAt).toLocaleDateString("en", { month: "short", day: "numeric" })}
                  </p>
                </div>
                {isRefunded ? (
                  <span className="text-xs text-green-400 font-medium flex items-center gap-1">
                    <Check className="h-3 w-3" /> Refunded
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRefund(ticket.id)}
                    disabled={isRefunding}
                    className="shrink-0 text-red-400 border-red-500/30 hover:bg-red-500/10"
                  >
                    {isRefunding ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Refund
                      </>
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Refunds are processed via Stripe. Buyers receive the ticket price back within 5-10 business days. The service fee is non-refundable.
      </p>
    </div>
  );
}
