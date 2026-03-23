"use client";

import { useState } from "react";
import { Minus, Plus, Ticket } from "lucide-react";
import { StripeCheckout } from "@/components/stripe-checkout";

interface Tier {
  id: string;
  name: string;
  price: number;
  capacity: number;
}

export function TicketSection({
  tiers,
  eventId,
  accentColor = "#7B2FF7",
}: {
  tiers: Tier[];
  eventId: string;
  accentColor?: string;
}) {
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);

  const selected = tiers.find((t) => t.id === selectedTier);
  const total = selected ? Number(selected.price) * quantity : 0;
  const isFree = selected ? Number(selected.price) === 0 : false;

  // Show embedded Stripe checkout
  if (showCheckout && selectedTier && selected) {
    return (
      <div className="space-y-4">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-white/40">
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
    <div className="space-y-4">
      <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-white/40">
        Tickets
      </h2>

      <div className="space-y-3">
        {tiers.map((tier) => {
          const isSelected = selectedTier === tier.id;
          const price = Number(tier.price);

          return (
            <button
              key={tier.id}
              onClick={() => {
                setSelectedTier(tier.id);
                setQuantity(1);
                setShowCheckout(false);
              }}
              className={`w-full rounded-2xl border p-4 text-left transition-all ${
                isSelected
                  ? "border-2 bg-white/5"
                  : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
              }`}
              style={isSelected ? { borderColor: accentColor } : undefined}
            >
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="font-heading text-base font-semibold text-white">
                    {tier.name}
                  </p>
                  <p className="text-sm text-white/40">
                    {tier.capacity} remaining
                  </p>
                </div>
                <p
                  className="font-heading text-xl font-bold"
                  style={{ color: accentColor }}
                >
                  {price === 0 ? "Free" : `$${price.toFixed(2)}`}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Expanded section when tier selected */}
      {selectedTier && (
        <div className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-5 animate-fade-in-up">
          {/* Quantity selector */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white/60">Quantity</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 disabled:opacity-30"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-heading text-lg font-semibold text-white">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity(Math.min(10, quantity + 1))}
                disabled={quantity >= 10}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 disabled:opacity-30"
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
            <input
              id="ticket-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-white/20 focus:ring-1 transition-colors"
              style={{ focusRingColor: accentColor } as React.CSSProperties}
            />
          </div>
        </div>
      )}

      {/* Sticky CTA */}
      {selectedTier && !showCheckout && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/5 bg-[#09090B]/95 backdrop-blur-lg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <div className="mx-auto max-w-[640px]">
            <button
              onClick={() => {
                if (!email) return;
                setShowCheckout(true);
              }}
              disabled={!email}
              className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-lg font-bold text-white transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: accentColor }}
            >
              <Ticket className="h-5 w-5" />
              {isFree
                ? "RSVP — Free"
                : `Get Tickets — $${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
