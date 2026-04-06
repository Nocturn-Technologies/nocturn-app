"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, RotateCcw, AlertTriangle, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { getRefundableTickets, getRefundedTickets, refundTicket, getRefundPolicy, toggleRefundPolicy } from "@/app/actions/refunds";

interface RefundableTicket {
  id: string;
  email: string;
  tierName: string;
  pricePaid: number;
  status: string;
  purchasedAt: string;
}

interface RefundedTicket {
  id: string;
  email: string;
  tierName: string;
  amountRefunded: number;
  refundedAt: string;
}

export default function RefundsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [tickets, setTickets] = useState<RefundableTicket[]>([]);
  const [refundHistory, setRefundHistory] = useState<RefundedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [refunded, setRefunded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [refundsEnabled, setRefundsEnabled] = useState(true);
  const [togglingPolicy, setTogglingPolicy] = useState(false);

  const loadTickets = useCallback(async () => {
    const [ticketResult, refundedResult, policyResult] = await Promise.all([
      getRefundableTickets(eventId),
      getRefundedTickets(eventId),
      getRefundPolicy(eventId),
    ]);
    if (ticketResult.tickets) setTickets(ticketResult.tickets);
    if (refundedResult.tickets) setRefundHistory(refundedResult.tickets);
    setRefundsEnabled(policyResult.enabled);
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
      // Move to refund history after animation
      const refundedTicket = tickets.find((t) => t.id === ticketId);
      setTimeout(() => {
        setTickets((prev) => prev.filter((t) => t.id !== ticketId));
        if (refundedTicket) {
          setRefundHistory((prev) => [{
            id: refundedTicket.id,
            email: refundedTicket.email,
            tierName: refundedTicket.tierName,
            amountRefunded: result.refundedAmount ?? refundedTicket.pricePaid,
            refundedAt: new Date().toISOString(),
          }, ...prev]);
        }
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
          <Button variant="ghost" size="icon" aria-label="Go back" className="min-h-[44px] min-w-[44px]">
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

      {/* Refund policy toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium">Refund policy</p>
          <p className="text-xs text-muted-foreground">
            {refundsEnabled ? "Attendees can request refunds" : "No refunds — all sales are final"}
          </p>
        </div>
        <button
          onClick={async () => {
            if (!confirm("Change the refund policy for this event?")) return;
            setTogglingPolicy(true);
            const result = await toggleRefundPolicy(eventId, !refundsEnabled);
            if (!result.error) setRefundsEnabled(!refundsEnabled);
            setTogglingPolicy(false);
          }}
          disabled={togglingPolicy}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
            refundsEnabled ? "bg-nocturn" : "bg-muted"
          } ${togglingPolicy ? "opacity-50" : ""}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
              refundsEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
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
                    onClick={() => handleRefund(ticket.id)}
                    disabled={isRefunding}
                    className="shrink-0 h-10 px-4 text-red-400 border-red-500/30 hover:bg-red-500/10"
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

      {/* Refund History */}
      <div className="space-y-2 pt-4 border-t border-border">
        <h2 className="text-sm font-semibold text-foreground">Refund History</h2>
        {refundHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center">No refunds yet</p>
        ) : (
          refundHistory.map((ticket) => (
            <div
              key={ticket.id}
              className="rounded-lg border border-border p-3 flex items-center justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{ticket.email}</p>
                <p className="text-xs text-muted-foreground">
                  {ticket.tierName} · ${ticket.amountRefunded.toFixed(2)} refunded · {new Date(ticket.refundedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 shrink-0">
                <RotateCcw className="h-3 w-3" /> Refunded
              </span>
            </div>
          ))
        )}
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        Refunds are processed via Stripe. Buyers receive the ticket price back within 5-10 business days. The service fee is non-refundable.
      </p>
    </div>
  );
}
