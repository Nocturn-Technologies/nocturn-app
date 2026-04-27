"use client";

import { useState, useMemo, useEffect } from "react";
import { Minus, Plus, Ticket, Check, AlertCircle, Bell, Loader2, Phone } from "lucide-react";
import dynamic from "next/dynamic";
const StripeCheckout = dynamic(() => import("@/components/stripe-checkout").then(m => m.StripeCheckout), { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-nocturn border-t-transparent" /></div> });
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
  sales_start?: string | null;
  sales_end?: string | null;
}

export function TicketSection({
  tiers,
  eventId,
  accentColor = "#7B2FF7",
  eventTitle,
  eventDate,
  eventVenue,
  referrerToken,
}: {
  tiers: Tier[];
  eventId: string;
  accentColor?: string;
  eventTitle?: string;
  eventDate?: string;
  eventVenue?: string;
  referrerToken?: string;
}) {
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);

  const [buying, setBuying] = useState(false);
  const [resolvedAmount, setResolvedAmount] = useState<string | null>(null);
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
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [liveRemaining, setLiveRemaining] = useState<Record<string, number> | null>(null);

  // Sort tiers by price (cheapest first = Early Bird → Tier 1 → Tier 2 → Tier 3)
  const sortedTiers = useMemo(() => [...tiers].sort((a, b) => Number(a.price) - Number(b.price)), [tiers]);

  // Auto-select first available tier on mount so the printed price list has a default
  // selection with running totals visible (matches V1.1 mockup behavior)
  useEffect(() => {
    if (selectedTier) return;
    const firstAvailable = sortedTiers.find((t) => {
      const remaining = liveRemaining ? Math.max(0, liveRemaining[t.id] ?? t.remaining ?? t.capacity) : Math.max(0, t.remaining ?? t.capacity);
      return remaining > 0 && !(t.sales_start && new Date(t.sales_start) > new Date()) && !(t.sales_end && new Date(t.sales_end) < new Date());
    });
    if (firstAvailable) setSelectedTier(firstAvailable.id);
  }, [sortedTiers, selectedTier, liveRemaining]);

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

  const phoneValid = useMemo(() => {
    if (!phone) return null;
    const digits = phone.replace(/[^0-9]/g, "");
    return digits.length >= 7 && digits.length <= 15;
  }, [phone]);

  const contactValid = emailValid === true && phoneValid === true;

  const waitlistEmailValid = useMemo(() => {
    if (!waitlistEmail) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(waitlistEmail);
  }, [waitlistEmail]);

  // Poll for capacity updates every 30s to catch sold-out-mid-browse (#10)
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/tier-availability?eventId=${eventId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.remaining && !cancelled) {
          setLiveRemaining(data.remaining);
        }
      } catch { /* non-critical */ }
    };
    // First poll after 15s, then every 30s
    const firstTimeout = setTimeout(poll, 15_000);
    const interval = setInterval(poll, 30_000);
    return () => { cancelled = true; clearTimeout(firstTimeout); clearInterval(interval); };
  }, [eventId]);

  async function handleFreeCheckout() {
    if (!selectedTier || !email || !phone || !contactValid || freeCheckoutLoading) return;
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
          buyerPhone: phone,
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
        <div className="brutalist-chapter">COMPLETE PAYMENT</div>
        <div className="brutalist-hairline" />
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-heading text-base font-semibold text-white">
                {quantity}x {selected.name}
              </p>
              <p className="text-sm text-white/60">{email}</p>
            </div>
            <div className="text-right">
              <p
                className="font-heading text-xl font-bold brutalist-mono"
                style={{ color: accentColor }}
              >
                {resolvedAmount ?? `$${total.toFixed(2)}`}
              </p>
              {!resolvedAmount && (
                <p className="text-[11px] text-white/50 mt-0.5">
                  Final amount in local currency
                </p>
              )}
            </div>
          </div>
          <StripeCheckout
            eventId={eventId}
            tierId={selectedTier}
            tierName={selected.name}
            quantity={quantity}
            buyerEmail={email}
            buyerPhone={phone}
            totalAmount={total}
            eventTitle={eventTitle}
            eventDate={eventDate}
            eventVenue={eventVenue}
            referrerToken={referrerToken}
            promoCode={promoApplied?.code}
            onAmountResolved={(amount) => setResolvedAmount(amount)}
            onSuccess={() => {
              // Success handled inside StripeCheckout component
            }}
            onCancel={() => { setShowCheckout(false); setResolvedAmount(null); }}
          />
        </div>
      </div>
    );
  }

  // Progressive tier unlock logic — first non-soldout tier is "active",
  // anything cheaper that's sold out stays visible but locked.
  let activeFound = false;

  return (
    <div className="space-y-10">
      {/* Heading: just "ENTRY." with purple period — no standfirst */}
      <h2
        className="font-heading font-bold text-white"
        style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)", letterSpacing: "-0.04em", lineHeight: 0.92 }}
      >
        ENTRY<span style={{ color: accentColor }}>.</span>
      </h2>

      {/* Tier list — printed price list with click-to-select */}
      <div className="border-t border-b border-white/[0.08]">
        {sortedTiers.map((tier, idx) => {
          const isSelected = selectedTier === tier.id;
          const price = Number(tier.price);
          const remaining = liveRemaining ? Math.max(0, liveRemaining[tier.id] ?? tier.remaining ?? tier.capacity) : Math.max(0, tier.remaining ?? tier.capacity);
          const isSoldOut = remaining <= 0;
          const isActive = !isSoldOut && !activeFound;
          if (isActive) activeFound = true;
          const isLocked = !isSoldOut && !isActive;
          const salesNotStarted = tier.sales_start && new Date(tier.sales_start) > new Date();
          const salesEnded = tier.sales_end && new Date(tier.sales_end) < new Date();
          const blockedFromSelect = isLocked || !!salesNotStarted || !!salesEnded;
          const sold = Math.max(0, tier.capacity - remaining);

          const subLine = salesNotStarted
            ? `Sales start ${new Date(tier.sales_start!).toLocaleDateString("en", { month: "short", day: "numeric" })}`
            : salesEnded
              ? "Sales ended"
              : isSoldOut
                ? `${tier.capacity} / ${tier.capacity} sold`
                : isLocked
                  ? `Unlocks when ${sortedTiers[idx - 1]?.name ?? "previous tier"} sells out`
                  : `${remaining} of ${tier.capacity} left`;

          return (
            <div key={tier.id}>
              <div
                role="button"
                tabIndex={blockedFromSelect ? -1 : 0}
                onClick={() => {
                  if (isSoldOut) {
                    setWaitlistTierId(waitlistTierId === tier.id ? null : tier.id);
                    setWaitlistJoined(false);
                    if (email && !waitlistEmail) setWaitlistEmail(email);
                    return;
                  }
                  if (blockedFromSelect) return;
                  haptic("select");
                  setSelectedTier(tier.id);
                  if (quantity < 1) setQuantity(1);
                  setShowCheckout(false);
                  setShowConfirmation(false);
                  setWaitlistTierId(null);
                }}
                onKeyDown={(e) => {
                  if (blockedFromSelect || isSoldOut) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    haptic("select");
                    setSelectedTier(tier.id);
                    if (quantity < 1) setQuantity(1);
                    setWaitlistTierId(null);
                  }
                }}
                aria-pressed={isSelected}
                aria-disabled={blockedFromSelect}
                className={`brutalist-tier-row grid grid-cols-12 gap-3 py-6 sm:py-7 px-2 sm:px-3 relative items-center ${
                  isSelected ? "is-selected" : ""
                } ${isSoldOut ? "is-soldout" : ""} ${isLocked || salesNotStarted || salesEnded ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-white/[0.02]"}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: undefined, // overridden by Tailwind grid below
                }}
              >
                {/* Tier index */}
                <div className="col-span-12 sm:col-span-1 brutalist-mono text-[11px] tracking-[0.28em] uppercase text-white/45">
                  {String(idx + 1).padStart(2, "0")}
                </div>

                {/* Name + sub-line */}
                <div className="col-span-12 sm:col-span-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="font-heading font-bold text-white text-[22px] sm:text-[26px] tracking-[-0.02em]">
                      {tier.name}
                    </div>
                    {isSelected && !isSoldOut && !isLocked && (
                      <div
                        className="brutalist-mono text-[10px] tracking-[0.28em] uppercase font-bold"
                        style={{ color: accentColor }}
                      >
                        · SELECTED
                      </div>
                    )}
                  </div>
                  <div className="brutalist-mono text-[11px] uppercase tracking-[0.22em] text-white/55 mt-1">
                    {subLine}
                    {!isSoldOut && !isLocked && !salesNotStarted && !salesEnded && remaining <= 10 && remaining > 0 && (
                      <span className="ml-2" style={{ color: accentColor }}>· only {remaining} left</span>
                    )}
                    {isSoldOut && sold > 0 && " · tap to join waitlist"}
                  </div>
                </div>

                {/* Quantity stepper / waitlist button / locked label */}
                <div className="col-span-7 sm:col-span-3 flex items-center gap-2">
                  {isSoldOut ? (
                    <span className="inline-flex items-center gap-1.5 rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.22em] text-amber-400">
                      <Bell className="h-3 w-3" />
                      Waitlist
                    </span>
                  ) : isLocked || salesNotStarted || salesEnded ? (
                    <span className="brutalist-mono text-[11px] uppercase tracking-[0.22em] text-white/40">
                      {salesNotStarted ? "Soon" : salesEnded ? "Ended" : "Locked"}
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          haptic("light");
                          if (isSelected) {
                            setQuantity(Math.max(1, quantity - 1));
                          } else {
                            setSelectedTier(tier.id);
                            setQuantity(1);
                          }
                          setShowConfirmation(false);
                        }}
                        disabled={isSelected ? quantity <= 1 : false}
                        aria-label="Decrease quantity"
                        className="qty-btn w-9 h-9 border border-white/15 rounded-sm font-mono text-white/55 hover:bg-white/[0.08] hover:text-white hover:border-white/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        −
                      </button>
                      <div className="w-10 text-center brutalist-mono text-[16px] text-white">
                        {isSelected ? quantity : 0}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          haptic("light");
                          const maxQ = Math.min(10, remaining);
                          if (isSelected) {
                            setQuantity(Math.min(maxQ, quantity + 1));
                          } else {
                            setSelectedTier(tier.id);
                            setQuantity(1);
                          }
                          setShowConfirmation(false);
                        }}
                        disabled={isSelected && quantity >= Math.min(10, remaining)}
                        aria-label="Increase quantity"
                        className="qty-btn w-9 h-9 border border-white/15 rounded-sm font-mono text-white hover:bg-white/[0.08] hover:border-white/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        +
                      </button>
                    </>
                  )}
                </div>

                {/* Price right-aligned */}
                <div className="col-span-5 sm:col-span-3 text-right">
                  <div
                    className={`brutalist-mono text-[22px] sm:text-[26px] font-medium ${
                      isSoldOut ? "text-white/35 line-through" : "text-white"
                    }`}
                  >
                    {price === 0 ? "Free" : `$${price.toFixed(2)}`}
                  </div>
                  {isSoldOut && (
                    <div className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 brutalist-sold-stamp text-[11px] uppercase font-bold px-3 py-1.5 rounded-sm pointer-events-none hidden sm:block">
                      SOLD OUT
                    </div>
                  )}
                </div>
              </div>

              {/* Waitlist form — shows when sold-out tier is tapped */}
              {isSoldOut && waitlistTierId === tier.id && (
                <div className="mt-2 mx-2 sm:mx-3 mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3 animate-fade-in-up">
                  {waitlistJoined ? (
                    <div className="flex items-center gap-2 text-amber-400">
                      <Check className="h-4 w-4" />
                      <p className="text-sm font-medium">You&apos;re on the waitlist! We&apos;ll email you if a spot opens.</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-white/60">Get notified if a spot opens up:</p>
                      <div className="flex gap-2">
                        <label htmlFor="waitlist-email" className="sr-only">Waitlist email address</label>
                        <input
                          id="waitlist-email"
                          type="email"
                          placeholder="your@email.com"
                          value={waitlistEmail}
                          onChange={(e) => { setWaitlistEmail(e.target.value); setWaitlistError(null); }}
                          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/40 outline-none focus:border-amber-500/50"
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
        })}
      </div>

      {/* Buyer contact + promo + totals */}
      {selectedTier && selected && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8 sm:mt-10">
          {/* Left col: contact + promo */}
          <div className="lg:col-span-7 space-y-5">
            <div className="brutalist-chapter">BUYER DETAILS</div>
            <div className="brutalist-hairline" />

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
                  className={`w-full rounded-xl border bg-white/[0.03] px-4 py-3.5 pr-10 text-[16px] text-white placeholder:text-white/40 outline-none focus:ring-1 transition-all duration-200 ${
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

            {/* Phone */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-white/60" htmlFor="ticket-phone">
                Phone number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <input
                  id="ticket-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={32}
                  className={`w-full rounded-xl border bg-white/[0.03] pl-10 pr-10 py-3.5 text-[16px] text-white placeholder:text-white/40 outline-none focus:ring-1 transition-all duration-200 ${
                    phoneValid === true
                      ? "border-green-500/40 focus:border-green-500/60 focus:ring-green-500/10"
                      : phoneValid === false
                        ? "border-red-500/40 focus:border-red-500/60 focus:ring-red-500/10"
                        : "border-white/[0.08] focus:border-white/20 focus:ring-white/5"
                  }`}
                />
                {phoneValid === true && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                )}
                {phoneValid === false && (
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
                    className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[16px] text-white placeholder:text-white/40 outline-none focus:border-white/20 focus:ring-1 focus:ring-white/5 transition-all duration-200"
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
                    {promoValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
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

          {/* Right col: totals + CTA */}
          <div className="lg:col-span-5 space-y-3">
            <div className="space-y-2.5 brutalist-mono text-[12px] uppercase tracking-[0.22em] text-white/55">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                <span>{quantity} × {selected.name}</span>
                <span className="text-white">${subtotal.toFixed(2)}</span>
              </div>
              {totalFees > 0 && (
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                  <span>+ Service fee (7% + $0.50)</span>
                  <span className="text-white">${totalFees.toFixed(2)}</span>
                </div>
              )}
              {promoDiscount > 0 && (
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                  <span className="text-green-400">Promo discount</span>
                  <span className="text-green-400">-${(promoDiscount * quantity).toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5">
                <span className="text-white">Total</span>
                <span className="brutalist-mono text-[20px] text-white font-bold">${total.toFixed(2)}</span>
              </div>
              <div
                className="text-[10.5px] tracking-[0.18em] text-white/40 pt-3 normal-case font-medium brutalist-mono"
                style={{ letterSpacing: "0.18em" }}
              >
                Nocturn absorbs Stripe — what you see is what you pay.
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => {
                if (!email || !phone || !contactValid || buying || freeCheckoutLoading) return;
                haptic("confirm");
                if (isFree) {
                  handleFreeCheckout();
                  return;
                }
                if (!showConfirmation) {
                  setShowConfirmation(true);
                  return;
                }
                setBuying(true);
                setTimeout(() => {
                  setShowCheckout(true);
                  setBuying(false);
                  setShowConfirmation(false);
                }, 400);
              }}
              disabled={!email || !phone || !contactValid || buying || freeCheckoutLoading}
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-[14px] px-8 py-[20px] text-[16px] font-bold text-white transition-all duration-300 hover:brightness-[1.12] hover:translate-y-[-2px] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
              style={{ backgroundColor: accentColor, letterSpacing: "-0.005em" }}
            >
              {(buying || freeCheckoutLoading) && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
              )}
              {freeCheckoutLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Ticket className="h-5 w-5" />
              )}
              <span>
                {freeCheckoutLoading
                  ? "Registering..."
                  : buying
                    ? "Securing your spot..."
                    : isFree
                      ? "RSVP — Free"
                      : showConfirmation
                        ? `Confirm & Pay — $${total.toFixed(2)}`
                        : `Get tickets — $${total.toFixed(2)}`}
              </span>
              <span className="text-[18px] leading-none">→</span>
            </button>
            {freeCheckoutError && (
              <p className="mt-2 text-center text-sm text-red-400 flex items-center justify-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {freeCheckoutError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
