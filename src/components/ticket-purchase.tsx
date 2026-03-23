"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Ticket, Minus, Plus } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { StripeCheckout } from "@/components/stripe-checkout";

interface Tier {
  id: string;
  name: string;
  price: number;
  capacity: number;
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

  const selectedTierData = tiers.find((t) => t.id === selectedTier);
  const ticketPrice = Number(selectedTierData?.price ?? 0);
  const isFree = ticketPrice === 0;
  const serviceFeePerTicket = isFree ? 0 : Math.round((ticketPrice * 0.07 + 0.50) * 100) / 100;
  const subtotal = ticketPrice * quantity;
  const totalFees = serviceFeePerTicket * quantity;
  const totalAmount = subtotal + totalFees;

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
            <span className="font-medium">${subtotal.toFixed(2)}</span>
          </div>
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
