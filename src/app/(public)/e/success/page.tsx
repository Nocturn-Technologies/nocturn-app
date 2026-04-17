"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { getTicketsBySessionId, fulfillPaymentIntent } from "@/app/actions/tickets";
import { useConfetti } from "@/components/celebrations";

interface TicketStub {
  ticket_token: string;
  status: string;
  created_at: string;
  price_paid?: number | null;
  ticket_tiers?: { name: string; price: number } | null;
  events?: { id: string; title: string; starts_at: string; venues: { name: string; city: string | null } | null } | null;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const paymentIntentId = searchParams.get("payment_intent");
  const redirectStatus = searchParams.get("redirect_status");
  const isFree = searchParams.get("free") === "true";
  const freeCount = searchParams.get("tickets");
  const freeTokens = searchParams.get("tokens");
  const [tickets, setTickets] = useState<TicketStub[]>([]);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [confettiFired, setConfettiFired] = useState(false);
  const fireConfetti = useConfetti();

  // Determine if we have a valid purchase
  const hasValidPurchase =
    sessionId || isFree || (paymentIntentId && redirectStatus === "succeeded");

  // Fire confetti on successful purchase
  useEffect(() => {
    if (hasValidPurchase && !confettiFired) {
      fireConfetti({ duration: 4000 });
      setConfettiFired(true);
    }
  }, [hasValidPurchase, confettiFired, fireConfetti]);

  useEffect(() => {
    // For free tickets, build ticket stubs from the tokens query param
    if (isFree && freeTokens) {
      let decoded = freeTokens;
      try { decoded = decodeURIComponent(freeTokens); } catch { /* malformed encoding, use raw */ }
      const tokens = decoded.split(",").filter(Boolean);
      setTickets(
        tokens.map((token) => ({
          ticket_token: token,
          status: "paid",
          created_at: new Date().toISOString(),
        }))
      );
      return;
    }

    // For payment intent redirects (3D Secure), fulfill tickets directly
    if (paymentIntentId && redirectStatus === "succeeded" && !sessionId) {
      setLoading(true);
      let cancelled = false;
      (async () => {
        try {
          const { tickets: fulfilled } = await fulfillPaymentIntent(paymentIntentId);
          if (cancelled) return;
          if (fulfilled && fulfilled.length > 0) {
            setTickets(fulfilled.map(t => ({
              ticket_token: t.ticket_token,
              status: t.status ?? "paid",
              created_at: t.created_at ?? new Date().toISOString(),
            })));
            setLoading(false);
            return;
          }
        } catch {
          if (cancelled) return;
        }

        let attempts = 0;
        const poll = async () => {
          if (cancelled) return;
          attempts++;
          try {
            const { tickets: found } = await getTicketsBySessionId(paymentIntentId);
            if (cancelled) return;
            if (found && found.length > 0) {
              setTickets(found);
              setLoading(false);
            } else if (attempts < 5) {
              setTimeout(poll, 2000);
            } else {
              setTimedOut(true);
              setLoading(false);
            }
          } catch {
            if (cancelled) return;
            if (attempts < 5) {
              setTimeout(poll, 2000);
            } else {
              setTimedOut(true);
              setLoading(false);
            }
          }
        };
        poll();
      })();
      return () => { cancelled = true; };
    }

    if (!sessionId) return;
    setLoading(true);

    // Poll up to 5 times with 2-second delays (same as paymentIntentId path)
    let attempts = 0;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const { tickets: found } = await getTicketsBySessionId(sessionId);
        if (found && found.length > 0) {
          setTickets(found);
          setLoading(false);
        } else if (attempts < 5) {
          setTimeout(poll, 2000);
        } else {
          setTimedOut(true);
          setLoading(false);
        }
      } catch {
        if (attempts < 5) {
          setTimeout(poll, 2000);
        } else {
          setTimedOut(true);
          setLoading(false);
        }
      }
    };
    poll();

    return () => { cancelled = true; };
  }, [sessionId, isFree, freeTokens, paymentIntentId, redirectStatus]);

  if (!hasValidPurchase) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-4 overflow-x-hidden">
        <div className="max-w-md w-full text-center space-y-6">
          <h1 className="text-2xl font-bold tracking-tight font-heading text-foreground">
            No order found.
          </h1>
          <p className="text-muted-foreground">
            It looks like you arrived here without a valid session. If you purchased tickets, check your email for confirmation.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-nocturn hover:bg-nocturn-light text-white font-medium px-6 py-3 transition-colors"
          >
            Back to Nocturn
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4 overflow-x-hidden">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Confetti-style decorative element */}
        <div className="text-6xl mb-2">
          <span className="inline-block animate-bounce">
            {"\u{1F389}"}
          </span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight font-heading text-foreground">
          You&apos;re in!
        </h1>

        <p className="text-muted-foreground text-lg">
          {isFree
            ? `You're registered${freeCount && Number(freeCount) > 1 ? ` (${freeCount} spots)` : ""}! Check your email for your QR code.`
            : "Your tickets have been confirmed. Check your email for the receipt and ticket details."}
        </p>

        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-nocturn/10 px-4 py-1.5 text-sm font-medium text-nocturn-light">
            <span className="h-2 w-2 rounded-full bg-nocturn animate-pulse" />
            {isFree ? "Registration confirmed" : "Payment confirmed"}
          </div>
          {sessionId && (
            <p className="text-xs text-muted-foreground break-all">
              Reference: {sessionId}
            </p>
          )}
        </div>

        {/* Event Details */}
        {!loading && tickets.length > 0 && tickets[0].events && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-1 text-left">
            <p className="text-base font-semibold text-foreground font-heading">
              {tickets[0].events.title}
            </p>
            <p className="text-sm text-muted-foreground">
              {new Date(tickets[0].events.starts_at).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}{" "}
              at{" "}
              {new Date(tickets[0].events.starts_at).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            {tickets[0].events.venues && (
              <p className="text-sm text-muted-foreground">
                {tickets[0].events.venues.name}
                {tickets[0].events.venues.city ? `, ${tickets[0].events.venues.city}` : ""}
              </p>
            )}
          </div>
        )}

        {/* Ticket Links */}
        {loading ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground animate-pulse">
              Loading your tickets...
            </p>
          </div>
        ) : timedOut && tickets.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Your tickets are being processed. Check your email for confirmation, or refresh this page in a moment.
            </p>
          </div>
        ) : tickets.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">
              Your Tickets ({tickets.length})
            </p>
            <div className="space-y-2">
              {tickets.map((t, i) => (
                <Link
                  key={t.ticket_token}
                  href={`/ticket/${t.ticket_token}`}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-muted/50 transition-colors group"
                >
                  <span className="text-sm text-foreground">
                    Ticket {i + 1}
                    {t.ticket_tiers?.name && (
                      <span className="text-muted-foreground ml-1.5">
                        — {t.ticket_tiers.name}
                        {t.ticket_tiers.price != null && ` ($${Number(t.ticket_tiers.price).toFixed(2)})`}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-nocturn group-hover:text-nocturn-light transition-colors flex items-center gap-1">
                    View
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m8.25 4.5 7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <div className="pt-4 space-y-3">
          {!loading && tickets.length > 0 && tickets[0].events && (
            <Link
              href={`/ticket/${tickets[0].ticket_token}`}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted/50 text-foreground font-medium px-6 py-3 transition-colors w-full"
            >
              View Your Ticket
            </Link>
          )}
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-nocturn hover:bg-nocturn-light text-white font-medium px-6 py-3 transition-colors w-full"
          >
            Back to Nocturn
          </Link>
        </div>

        <p className="text-xs text-muted-foreground">
          Questions? Reach out to the event organizer or contact us at{" "}
          <a
            href="mailto:shawn@trynocturn.com"
            className="underline hover:text-foreground"
          >
            shawn@trynocturn.com
          </a>
        </p>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center bg-background overflow-x-hidden">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
