"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Ticket, Minus, Plus, Loader2 } from "lucide-react";
import { haptic } from "@/lib/haptics";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (!selectedTier || !email) return;
    haptic('medium');
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          tierId: selectedTier,
          quantity,
          buyerEmail: email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      setError("Failed to start checkout. Please try again.");
      setLoading(false);
    }
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
                className="h-8 w-8"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-8 text-center font-medium">{quantity}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setQuantity(Math.min(10, quantity + 1))}
                disabled={quantity >= 10}
              >
                <Plus className="h-3 w-3" />
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

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Total + CTA */}
          <Button
            className="w-full bg-nocturn py-6 text-lg hover:bg-nocturn-light"
            size="lg"
            onClick={handleCheckout}
            disabled={loading || !email}
          >
            {loading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Ticket className="mr-2 h-5 w-5" />
            )}
            {loading
              ? "Redirecting to checkout..."
              : `Get Tickets — $${(
                  Number(
                    tiers.find((t) => t.id === selectedTier)?.price ?? 0
                  ) * quantity
                ).toFixed(2)}`}
          </Button>
        </div>
      )}
    </div>
  );
}
