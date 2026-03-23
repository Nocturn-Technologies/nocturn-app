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
import { Loader2, CheckCircle, AlertCircle, Share2, Download } from "lucide-react";
import { useConfetti, generateTicketShareCard } from "@/components/celebrations";

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
  onSuccess: () => void;
  onCancel: () => void;
}

// 🎉 Post-purchase celebration + share to story
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
  const [shareCardUrl, setShareCardUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Fire confetti on mount
  useEffect(() => {
    fireConfetti({ duration: 4000 });
  }, [fireConfetti]);

  async function handleGenerateShareCard() {
    setGenerating(true);
    try {
      const url = await generateTicketShareCard({
        title: eventTitle || "Event",
        date: eventDate || "",
        venue: eventVenue || "",
        tierName: tierName || "General Admission",
        quantity: quantity || 1,
      });
      setShareCardUrl(url);
    } catch {
      // Silently fail — share is optional
    }
    setGenerating(false);
  }

  async function handleShare() {
    if (!shareCardUrl) return;

    // Convert data URL to blob for native share
    const res = await fetch(shareCardUrl);
    const blob = await res.blob();
    const file = new File([blob], "ticket.png", { type: "image/png" });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: `I'm going to ${eventTitle}!`,
        text: `Just got tickets to ${eventTitle} 🎟️🔥`,
        files: [file],
      });
    } else {
      // Fallback: download the image
      const a = document.createElement("a");
      a.href = shareCardUrl;
      a.download = `${eventTitle || "ticket"}-story.png`;
      a.click();
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 py-6 animate-fade-in-up">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
        <CheckCircle className="h-10 w-10 text-green-500" />
      </div>
      <div className="text-center">
        <p className="text-xl font-bold">You're in! 🎉</p>
        <p className="text-sm text-muted-foreground mt-1">
          {quantity && quantity > 1 ? `${quantity} tickets` : "Your ticket"} for{" "}
          <span className="text-white font-medium">{eventTitle || "the event"}</span>
          {" "}confirmed.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Check your email for details + QR code.
        </p>
      </div>

      {/* Share to Story CTA */}
      {!shareCardUrl ? (
        <Button
          onClick={handleGenerateShareCard}
          disabled={generating}
          className="w-full bg-gradient-to-r from-[#7B2FF7] to-[#E040FB] hover:opacity-90 text-white font-semibold py-5"
          size="lg"
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="mr-2 h-4 w-4" />
          )}
          {generating ? "Creating your story..." : "Share to Story 📸"}
        </Button>
      ) : (
        <div className="w-full space-y-3">
          {/* Preview */}
          <div className="mx-auto w-40 rounded-xl overflow-hidden border border-white/10 shadow-lg shadow-nocturn/20">
            <img src={shareCardUrl} alt="Share card" className="w-full" />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleShare}
              className="flex-1 bg-gradient-to-r from-[#7B2FF7] to-[#E040FB] hover:opacity-90"
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
            <Button
              onClick={() => {
                const a = document.createElement("a");
                a.href = shareCardUrl;
                a.download = `${eventTitle || "ticket"}-story.png`;
                a.click();
              }}
              variant="outline"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
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
  onSuccess,
  onCancel,
}: StripeCheckoutProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function createIntent() {
      try {
        const res = await fetch("/api/create-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, tierId, quantity, buyerEmail }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to initialize payment");
          setLoading(false);
          return;
        }

        setClientSecret(data.clientSecret);
        setLoading(false);
      } catch {
        setError("Failed to connect to payment service");
        setLoading(false);
      }
    }

    createIntent();
  }, [eventId, tierId, quantity, buyerEmail]);

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
