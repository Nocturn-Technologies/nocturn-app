"use client";

import { useState, useMemo } from "react";
import { Minus, Plus, Ticket, Check, AlertCircle, Bell, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
const StripeCheckout = dynamic(() => import("@/components/stripe-checkout").then(m => m.StripeCheckout), { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#7B2FF7] border-t-transparent" /></div> });
import { joinWaitlist } from "@/app/actions/ticket-waitlist";
import { validatePromoCode } from "@/app/actions/promo-codes";
import { haptic } from "@/lib/haptics";

interface Tier {
  id: string;
  name: string;
  price: number;
  capacity: number;
  sold?: number;
  remaining?: number;
}

export function TicketSection({
  tiers,
  eventId,
  accentColor = "#7B2FF7",
  referrerToken,
}: {
  tiers: Tier[];
  eventId: string;
  accentColor?: string;
  referrerToken?: string;
}) {
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);

  const [buying, setBuying] = useState(false);
  const [freeCheckoutLoading, setFreeCheckoutLoading] = useState(false);
  const [freeCheckoutError, setFreeCheckoutError] = useState<string | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [waitlistTierId, setWaitlistTierId] = useState<string | null>(null);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  // Promo code state
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState<{
    code: string;
    discountType: string;
    discountValue: number;
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);

  const selected = tiers.find((t) => t.id === selectedTier);
  const baseTicketPrice = selected ? Number(selected.price) : 0;

  // Apply promo discount to ticket price
  const promoDiscount = promoApplied
    ? promoApplied.discountType === "percentage"
      ? Math.round(baseTicketPrice * (Math.min(promoApplied.discountValue, 100) / 100) * 100) / 100
      : Math.min(promoApplied.discountValue, baseTicketPrice)
    : 0;
  const ticketPrice = Math.max(baseTicketPrice - promoDiscount, 0);

  const isFree = ticketPrice === 0;
  const serviceFeePerTicket = isFree ? 0 : (Math.round(ticketPrice * 100 * 0.07) + 50) / 100;
  const subtotal = ticketPrice * quantity;
  const totalFees = serviceFeePerTicket * quantity;
  const total = subtotal + totalFees;

  const emailValid = useMemo(() => {
    if (!email) return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }, [email]);

  const waitlistEmailValid = useMemo(() => {
    if (!waitlistEmail) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(waitlistEmail);
  }, [waitlistEmail]);

  async function handleFreeCheckout() {
    if (!selectedTier || !email || emailValid !== true || freeCheckoutLoading) return;
    setFreeCheckoutLoading(true);
    setFreeCheckoutError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          tierId: selectedTier,
          quantity,
          buyerEmail: email,
          ...(promoApplied?.code && { promoCode: promoApplied.code }),
          ...(referrerToken && { referrerToken }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFreeCheckoutError(data.error || "Failed to register. Please try again.");
        setFreeCheckoutLoading(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setFreeCheckoutError("Something went wrong. Please try again.");
      setFreeCheckoutLoading(false);
    }
  }

  // Show embedded Stripe checkout
  if (showCheckout && selectedTier && selected) {
    return (
      <div className="space-y-4">
        <h2 className="font-heading text-[10px] font-semibold uppercase tracking-[0.25em] text-white/15">
          Complete Payment
        </h2>
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-heading text-base font-semibold text-white">
                {quantity}x {selected.name}
              </p>
              <p className="text-sm text-white/40">{email}</p>
            </div>
            <p
              className="font-heading text-xl font-bold"
              style={{ color: accentColor }}
            >
              ${total.toFixed(2)}
            </p>
          </div>
          <StripeCheckout
            eventId={eventId}
            tierId={selectedTier}
            tierName={selected.name}
            quantity={quantity}
            buyerEmail={email}
            totalAmount={total}
            referrerToken={referrerToken}
            promoCode={promoApplied?.code}
            onSuccess={() => {
              // Success handled inside StripeCheckout component
            }}
            onCancel={() => setShowCheckout(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">
        Tickets
      </h2>

      <div className="space-y-2">
        {(() => {
          // Progressive tier unlock logic:
          // Sort tiers by price (cheapest first = Early Bird → Tier 1 → Tier 2 → Tier 3)
          const sortedTiers = [...tiers].sort((a, b) => Number(a.price) - Number(b.price));

          // Find the first tier that still has availability — that's the "active" tier
          let activeFound = false;

          return sortedTiers.map((tier, idx) => {
            const isSelected = selectedTier === tier.id;
            const price = Number(tier.price);
            const remaining = Math.max(0, tier.remaining ?? tier.capacity);
            const isSoldOut = remaining <= 0;

            // A tier is "locked" if it's not sold out AND a cheaper tier before it still has availability
            const isActive = !isSoldOut && !activeFound;
            if (isActive) activeFound = true;
            const isLocked = !isSoldOut && !isActive;

            return (
              <div key={tier.id}>
                <button
                  onClick={() => {
                    if (isSoldOut) {
                      setWaitlistTierId(waitlistTierId === tier.id ? null : tier.id);
                      setWaitlistJoined(false);
                      return;
                    }
                    if (isLocked) return;
                    haptic('select');
                    setSelectedTier(tier.id);
                    setQuantity(1);
                    setShowCheckout(false);
                    setWaitlistTierId(null);
                  }}
                  className={`w-full rounded-2xl border p-5 text-left transition-all duration-300 ease-out ${
                    isSoldOut
                      ? "border-white/[0.04] bg-white/[0.01] hover:border-amber-500/20 cursor-pointer"
                      : isLocked
                        ? "border-white/[0.04] bg-white/[0.01] cursor-not-allowed opacity-40"
                        : isSelected
                          ? "border-2 bg-white/[0.04] backdrop-blur-sm scale-[1.01] shadow-lg shadow-black/20 active:scale-[0.99]"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04] active:scale-[0.99]"
                  }`}
                  style={isSelected && !isSoldOut && !isLocked ? { borderColor: accentColor } : undefined}
                  disabled={isLocked}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isSelected && !isSoldOut && !isLocked && (
                        <div
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full animate-scale-in"
                          style={{ backgroundColor: accentColor }}
                        >
                          <Check className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                      <div className="space-y-0.5 min-w-0">
                        <p className={`font-heading text-base font-semibold truncate ${isSoldOut || isLocked ? "text-white/50" : "text-white"}`}>
                          {tier.name}
                        </p>
                        <p className="text-sm text-white/40">
                          {isSoldOut
                            ? "Sold out — tap to join waitlist"
                            : isLocked
                              ? `Unlocks when ${sortedTiers[idx - 1]?.name ?? "previous tier"} sells out`
                              : remaining <= 10
                                ? `Only ${remaining} left`
                                : `${remaining} remaining`}
                        </p>
                      </div>
                    </div>
                    {isSoldOut ? (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 flex items-center gap-1">
                        <Bell className="h-3 w-3" />
                        Waitlist
                      </span>
                    ) : isLocked ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/30">
                        ${price.toFixed(0)}
                      </span>
                    ) : (
                      <p
                        className="font-heading text-xl font-bold"
                        style={{ color: accentColor }}
                      >
                        {price === 0 ? "Free" : `$${price.toFixed(2)}`}
                      </p>
                    )}
                  </div>
                </button>

                {/* Waitlist form — shows when sold-out tier is tapped */}
                {isSoldOut && waitlistTierId === tier.id && (
                  <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3 animate-fade-in-up">
                    {waitlistJoined ? (
                      <div className="flex items-center gap-2 text-amber-400">
                        <Check className="h-4 w-4" />
                        <p className="text-sm font-medium">You&apos;re on the waitlist! We&apos;ll email you if a spot opens.</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-white/60">Get notified if a spot opens up:</p>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            placeholder="your@email.com"
                            value={waitlistEmail}
                            onChange={(e) => { setWaitlistEmail(e.target.value); setWaitlistError(null); }}
                            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-amber-500/50"
                          />
                          <button
                            onClick={async () => {
                              if (!waitlistEmailValid || joiningWaitlist) return;
                              setWaitlistError(null);
                              setJoiningWaitlist(true);
                              const result = await joinWaitlist(eventId, tier.id, waitlistEmail);
                              if (result.error) {
                                setWaitlistError(result.error);
                              } else {
                                setWaitlistJoined(true);
                              }
                              setJoiningWaitlist(false);
                            }}
                            disabled={!waitlistEmailValid || joiningWaitlist}
                            className="shrink-0 rounded-xl bg-amber-500 px-5 py-3 font-semibold text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
                          >
                            {joiningWaitlist ? <Loader2 className="h-4 w-4 animate-spin" /> : "Notify Me"}
                          </button>
                        </div>
                        {waitlistError && (
                          <p className="text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {waitlistError}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* Expanded section when tier selected */}
      {selectedTier && (() => {
        const selectedTierData = tiers.find(t => t.id === selectedTier);
        const remaining = selectedTierData ? (selectedTierData.remaining ?? selectedTierData.capacity) : 10;
        const maxQuantity = Math.min(10, remaining);
        return (
        <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-5 animate-fade-in-up">
          {/* Quantity selector */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white/60">Quantity</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { haptic('light'); setQuantity(Math.max(1, quantity - 1)); }}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white transition-all duration-200 hover:bg-white/[0.08] hover:border-white/[0.15] disabled:opacity-20"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-heading text-xl font-bold text-white tabular-nums">
                {quantity}
              </span>
              <button
                onClick={() => { haptic('light'); setQuantity(Math.min(maxQuantity, quantity + 1)); }}
                disabled={quantity >= maxQuantity}
                aria-label="Increase quantity"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white transition-all duration-200 hover:bg-white/[0.08] hover:border-white/[0.15] disabled:opacity-20"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-white/60" htmlFor="ticket-email">
              Email for tickets
            </label>
            <div className="relative">
              <input
                id="ticket-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full rounded-xl border bg-white/[0.03] px-4 py-3.5 pr-10 text-[16px] text-white placeholder:text-white/25 outline-none focus:ring-1 transition-all duration-200 ${
                  emailValid === true
                    ? "border-green-500/40 focus:border-green-500/60 focus:ring-green-500/10"
                    : emailValid === false
                      ? "border-red-500/40 focus:border-red-500/60 focus:ring-red-500/10"
                      : "border-white/[0.08] focus:border-white/20 focus:ring-white/5"
                }`}
              />
              {emailValid === true && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
              )}
              {emailValid === false && (
                <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
              )}
            </div>
          </div>

          {/* Promo code */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-white/60" htmlFor="promo-code">
              Promo code
            </label>
            {promoApplied ? (
              <div className="flex items-center justify-between rounded-xl border border-green-500/30 bg-green-500/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-medium text-green-400">
                    {promoApplied.code} —{" "}
                    {promoApplied.discountType === "percentage"
                      ? `${promoApplied.discountValue}% off`
                      : `$${promoApplied.discountValue.toFixed(2)} off`}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setPromoApplied(null);
                    setPromoCode("");
                    setPromoError(null);
                  }}
                  className="text-xs text-white/40 hover:text-white/60 transition-colors"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  id="promo-code"
                  type="text"
                  placeholder="Enter code"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase());
                    setPromoError(null);
                  }}
                  className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[16px] text-white placeholder:text-white/25 outline-none focus:border-white/20 focus:ring-1 focus:ring-white/5 transition-all duration-200"
                />
                <button
                  onClick={async () => {
                    if (!promoCode.trim() || promoValidating) return;
                    setPromoValidating(true);
                    setPromoError(null);
                    try {
                      const result = await validatePromoCode(eventId, promoCode.trim());
                      if (result.valid && result.discount) {
                        haptic("confirm");
                        setPromoApplied(result.discount);
                      } else {
                        setPromoError(result.error || "Invalid code");
                      }
                    } catch {
                      setPromoError("Failed to validate code");
                    } finally {
                      setPromoValidating(false);
                    }
                  }}
                  disabled={!promoCode.trim() || promoValidating}
                  aria-label="Apply promo code"
                  className="shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white hover:bg-white/[0.08] transition-colors disabled:opacity-40"
                >
                  {promoValidating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Apply"
                  )}
                </button>
              </div>
            )}
            {promoError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {promoError}
              </p>
            )}
          </div>
        </div>
        );
      })()}

      {/* Sticky CTA */}
      {selectedTier && !showCheckout && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/5 bg-[#09090B]/95 backdrop-blur-lg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <div className="mx-auto max-w-[640px]">
            <button
              onClick={() => {
                if (!email || emailValid !== true || buying || freeCheckoutLoading) return;
                haptic('confirm');
                if (isFree) {
                  handleFreeCheckout();
                  return;
                }
                setBuying(true);
                setTimeout(() => {
                  setShowCheckout(true);
                  setBuying(false);
                }, 400);
              }}
              disabled={!email || emailValid !== true || buying || freeCheckoutLoading}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-lg font-bold text-white transition-all duration-200 hover:brightness-110 hover:shadow-lg hover:shadow-black/30 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
              style={{ backgroundColor: accentColor }}
            >
              {(buying || freeCheckoutLoading) && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
              )}
              {freeCheckoutLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Ticket className="h-5 w-5" />
              )}
              {freeCheckoutLoading
                ? "Registering..."
                : buying
                  ? "Securing your spot..."
                  : isFree
                    ? "RSVP — Free"
                    : `Get Tickets — $${total.toFixed(2)}`}
            </button>
            {freeCheckoutError && (
              <p className="mt-2 text-center text-sm text-red-400 flex items-center justify-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {freeCheckoutError}
              </p>
            )}
            {totalFees > 0 && (
              <p className="mt-2.5 text-center text-[11px] text-white/20 tracking-wide">
                ${subtotal.toFixed(2)} + ${totalFees.toFixed(2)} service fee
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
