"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Ticket, Minus, Plus, Tag, Check, X, Loader2 } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { StripeCheckout } from "@/components/stripe-checkout";
import { validatePromoCode } from "@/app/actions/promo-codes";

interface Tier {
  id: string;
  name: string;
  price: number;
  capacity: number;
}

interface AppliedDiscount {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
}

export function TicketPurchase({
  tiers,
  eventId,
}: {
  tiers: Tier[];
  eventId: string;
}) {
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);

  // Promo code state
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);

  const selectedTierData = tiers.find((t) => t.id === selectedTier);
  const ticketPrice = Number(selectedTierData?.price ?? 0);

  // Apply discount to ticket price BEFORE calculating service fee
  let discountedPrice = ticketPrice;
  let discountAmount = 0;
  if (appliedDiscount && ticketPrice > 0) {
    if (appliedDiscount.discountType === "percentage") {
      discountAmount = Math.round(ticketPrice * (appliedDiscount.discountValue / 100) * 100) / 100;
    } else {
      discountAmount = Math.min(appliedDiscount.discountValue, ticketPrice);
    }
    discountedPrice = Math.max(0, ticketPrice - discountAmount);
  }

  const isFree = discountedPrice === 0;
  const serviceFeePerTicket = isFree ? 0 : Math.round((discountedPrice * 0.07 + 0.50) * 100) / 100;
  const subtotal = discountedPrice * quantity;
  const totalDiscount = discountAmount * quantity;
  const totalFees = serviceFeePerTicket * quantity;
  const totalAmount = subtotal + totalFees;

  async function handleApplyPromo() {
    if (!promoInput.trim() || !eventId) return;
    setPromoLoading(true);
    setPromoError(null);

    const result = await validatePromoCode(eventId, promoInput.trim());

    if (result.valid && result.discount) {
      setAppliedDiscount(result.discount as AppliedDiscount);
      haptic("light");
    } else {
      setPromoError(result.error || "Invalid code");
    }
    setPromoLoading(false);
  }

  function handleRemovePromo() {
    setAppliedDiscount(null);
    setPromoInput("");
    setPromoError(null);
  }

  function handleProceed() {
    if (!selectedTier || !email) return;
    haptic("medium");
    setShowCheckout(true);
  }

  // Show embedded Stripe checkout
  if (showCheckout && selectedTier && selectedTierData) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Complete Payment
        </h2>
        <div className="rounded-lg border border-border p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span>{quantity}x {selectedTierData.name}</span>
            <span className={`font-medium ${totalDiscount > 0 ? "line-through text-muted-foreground" : ""}`}>
              ${(ticketPrice * quantity).toFixed(2)}
            </span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-green-400">
              <span>Discount ({appliedDiscount?.code})</span>
              <span>-${totalDiscount.toFixed(2)}</span>
            </div>
          )}
          {totalFees > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Service fee</span>
              <span>${totalFees.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1 font-semibold">
            <span>Total</span>
            <span>${totalAmount.toFixed(2)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{email}</p>
        </div>
        <StripeCheckout
          eventId={eventId}
          tierId={selectedTier}
          tierName={selectedTierData.name}
          quantity={quantity}
          buyerEmail={email}
          totalAmount={totalAmount}
          onSuccess={() => {
            haptic("heavy");
          }}
          onCancel={() => setShowCheckout(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Tickets
      </h2>

      {tiers.map((tier) => {
        const isSelected = selectedTier === tier.id;
        const price = Number(tier.price);

        return (
          <Card
            key={tier.id}
            className={`cursor-pointer transition-colors ${
              isSelected
                ? "border-nocturn ring-1 ring-nocturn"
                : "hover:border-nocturn/30"
            }`}
            onClick={() => {
              setSelectedTier(tier.id);
              setQuantity(1);
              setShowCheckout(false);
            }}
          >
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{tier.name}</p>
                <p className="text-xs text-muted-foreground">
                  {tier.capacity} available
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-nocturn">
                  {price === 0 ? "Free" : `$${price.toFixed(2)}`}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {selectedTier && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          {/* Quantity */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Quantity</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-10 text-center text-lg font-medium">{quantity}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setQuantity(Math.min(10, quantity + 1))}
                disabled={quantity >= 10}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="buyer-email">
              Email for tickets
            </label>
            <Input
              id="buyer-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Promo code */}
          {!isFree && (
            <div className="space-y-1">
              {appliedDiscount ? (
                <div className="flex items-center justify-between rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">{appliedDiscount.code}</span>
                    <span className="text-xs text-muted-foreground">
                      {appliedDiscount.discountType === "percentage"
                        ? `${appliedDiscount.discountValue}% off`
                        : `$${appliedDiscount.discountValue} off`}
                    </span>
                  </div>
                  <button onClick={handleRemovePromo} className="p-1 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Promo code"
                      value={promoInput}
                      onChange={(e) => {
                        setPromoInput(e.target.value.toUpperCase());
                        setPromoError(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
                      className="pl-9 text-sm uppercase"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleApplyPromo}
                    disabled={!promoInput.trim() || promoLoading}
                    className="shrink-0"
                  >
                    {promoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
              )}
              {promoError && (
                <p className="text-xs text-destructive">{promoError}</p>
              )}
            </div>
          )}

          {/* CTA */}
          <Button
            className="w-full bg-nocturn py-6 text-lg hover:bg-nocturn-light"
            size="lg"
            onClick={handleProceed}
            disabled={!email}
          >
            <Ticket className="mr-2 h-5 w-5" />
            {isFree
              ? `Register — Free`
              : `Get Tickets — $${totalAmount.toFixed(2)}`}
          </Button>
          {totalFees > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Includes ${totalFees.toFixed(2)} service fee
            </p>
          )}
        </div>
      )}
    </div>
  );
}
