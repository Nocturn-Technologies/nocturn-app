"use client";

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useConfetti } from "@/components/celebrations";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
);

interface StripeCheckoutProps {
  eventId: string;
  tierId: string;
  tierName: string;
  quantity: number;
  buyerEmail: string;
  totalAmount: number; // in dollars
  eventTitle?: string;
  eventDate?: string;
  eventVenue?: string;
  referrerToken?: string;
  promoCode?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

// 🎟️ Beautiful ticket card — designed to be screenshot bait
function TicketSuccess({
  eventTitle,
  eventDate,
  eventVenue,
  tierName,
  quantity,
}: {
  eventTitle?: string;
  eventDate?: string;
  eventVenue?: string;
  tierName?: string;
  quantity?: number;
}) {
  const fireConfetti = useConfetti();

  useEffect(() => {
    fireConfetti({ duration: 4000 });
  }, [fireConfetti]);

  const ticketCount = quantity || 1;

  return (
    <div className="flex flex-col items-center gap-5 py-4 animate-fade-in-up">
      {/* Header */}
      <div className="text-center">
        <p className="text-xl font-bold">You're in! 🎉</p>
        <p className="text-xs text-muted-foreground mt-1">
          Screenshot your ticket and share it on your story
        </p>
      </div>

      {/* ── The Ticket — screenshot bait ── */}
      <div className="w-full max-w-sm mx-auto">
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#7B2FF7] via-[#6B1FE7] to-[#4A0EAF] shadow-xl shadow-[#7B2FF7]/20">
          {/* Top section */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold uppercase tracking-[3px] text-white/50">
                🌙 nocturn.
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[3px] text-white/50">
                {ticketCount > 1 ? `${ticketCount} tickets` : "admit one"}
              </span>
            </div>

            <h2 className="text-2xl font-black text-white leading-tight tracking-tight">
              {eventTitle || "Event"}
            </h2>

            <div className="mt-4 space-y-2">
              {eventDate && (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-[10px]">📅</span>
                  </div>
                  <span className="text-sm text-white/80 font-medium">{eventDate}</span>
                </div>
              )}
              {eventVenue && (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-[10px]">📍</span>
                  </div>
                  <span className="text-sm text-white/80 font-medium">{eventVenue}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                  <span className="text-[10px]">🎟️</span>
                </div>
                <span className="text-sm text-white/80 font-medium">
                  {tierName || "General Admission"}
                </span>
              </div>
            </div>
          </div>

          {/* Tear line */}
          <div className="relative h-6 flex items-center">
            <div className="absolute -left-3 w-6 h-6 rounded-full bg-[#09090B]" />
            <div className="flex-1 border-t-2 border-dashed border-white/20 mx-5" />
            <div className="absolute -right-3 w-6 h-6 rounded-full bg-[#09090B]" />
          </div>

          {/* Bottom section */}
          <div className="px-6 pb-6 pt-2 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Status</p>
              <p className="text-sm font-bold text-green-300 flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Confirmed
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Check email for</p>
              <p className="text-sm font-bold text-white/80">QR Code</p>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle share hint */}
      <p className="text-[11px] text-muted-foreground/50 text-center">
        📸 Screenshot and post to your story
      </p>
    </div>
  );
}

function CheckoutForm({
  totalAmount,
  eventTitle,
  eventDate,
  eventVenue,
  tierName,
  quantity,
  onSuccess,
  onCancel,
}: {
  totalAmount: number;
  eventTitle?: string;
  eventDate?: string;
  eventVenue?: string;
  tierName?: string;
  quantity?: number;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/e/success`,
      },
      redirect: "if_required",
    });

    if (submitError) {
      setError(submitError.message ?? "Payment failed. Please try again.");
      setProcessing(false);
    } else {
      setSucceeded(true);
      setProcessing(false);
      onSuccess();
    }
  }

  if (succeeded) {
    return (
      <TicketSuccess
        eventTitle={eventTitle}
        eventDate={eventDate}
        eventVenue={eventVenue}
        tierName={tierName}
        quantity={quantity}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={processing}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1 bg-nocturn hover:bg-nocturn-light"
          disabled={!stripe || processing}
        >
          {processing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            `Pay $${totalAmount.toFixed(2)}`
          )}
        </Button>
      </div>

      <p className="text-center text-[11px] text-muted-foreground/60">
        By purchasing, you agree to the{" "}
        <a href="/legal/terms" target="_blank" className="underline hover:text-muted-foreground">Terms of Service</a>
        {" "}and{" "}
        <a href="/legal/privacy" target="_blank" className="underline hover:text-muted-foreground">Privacy Policy</a>.
        Payments processed securely by Stripe.
      </p>
    </form>
  );
}

export function StripeCheckout({
  eventId,
  tierId,
  tierName,
  quantity,
  buyerEmail,
  totalAmount,
  eventTitle,
  eventDate,
  eventVenue,
  referrerToken,
  promoCode,
  onSuccess,
  onCancel,
}: StripeCheckoutProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function createIntent() {
      try {
        const res = await fetch("/api/create-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, tierId, quantity, buyerEmail, ...(referrerToken && { referrerToken }), ...(promoCode && { promoCode }) }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to initialize payment");
          setLoading(false);
          return;
        }

        setClientSecret(data.clientSecret);
        setLoading(false);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to connect to payment service");
        setLoading(false);
      }
    }

    createIntent();

    return () => controller.abort();
  }, [eventId, tierId, quantity, buyerEmail, referrerToken, promoCode]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-nocturn" />
        <p className="text-sm text-muted-foreground">Setting up payment...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
        <Button variant="outline" onClick={onCancel} className="w-full">
          Go Back
        </Button>
      </div>
    );
  }

  if (!clientSecret) return null;

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "night",
          variables: {
            colorPrimary: "#7B2FF7",
            colorBackground: "#18181B",
            colorText: "#FFFFFF",
            colorDanger: "#ef4444",
            fontFamily: "Inter, system-ui, sans-serif",
            borderRadius: "8px",
          },
        },
      }}
    >
      <CheckoutForm
        totalAmount={totalAmount}
        eventTitle={eventTitle}
        eventDate={eventDate}
        eventVenue={eventVenue}
        tierName={tierName}
        quantity={quantity}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </Elements>
  );
}
