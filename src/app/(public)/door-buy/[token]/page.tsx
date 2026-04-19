import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/config";
import { calculateServiceFeeCents } from "@/lib/pricing";
import { DoorBuyForm } from "./door-buy-form";

export const metadata: Metadata = {
  title: "Pay at the Door — Nocturn",
  robots: "noindex",
};

interface Props {
  params: Promise<{ token: string }>;
}

function isValidNonce(token: string): boolean {
  return /^[A-Za-z0-9_-]{10,64}$/.test(token);
}

function formatMoney(cents: number, currency: string): string {
  const upper = currency.toUpperCase();
  const symbol = upper === "USD" || upper === "CAD" ? "$" : upper === "GBP" ? "£" : upper === "EUR" ? "€" : "$";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export default async function DoorBuyPage({ params }: Props) {
  const { token } = await params;

  if (!isValidNonce(token)) {
    notFound();
  }

  const admin = createAdminClient();

  // Read the token row WITHOUT consuming. Consumption happens atomically
  // inside /api/checkout on form submit. Reading here just powers the UI —
  // shows "expired" if past TTL or already used.
  const { data: tokenRow } = await admin
    .from("door_buy_tokens")
    .select("nonce, event_id, tier_id, quantity, expires_at, consumed_at")
    .eq("nonce", token)
    .maybeSingle();

  if (!tokenRow) {
    notFound();
  }

  const expired = new Date(tokenRow.expires_at as string).getTime() < Date.now();
  const consumed = tokenRow.consumed_at != null;

  // Look up event + tier for display
  const [{ data: event }, { data: tier }] = await Promise.all([
    admin
      .from("events")
      .select("id, title, slug, starts_at, currency, venues(name, city), collectives(default_currency)")
      .eq("id", tokenRow.event_id as string)
      .is("deleted_at", null)
      .maybeSingle(),
    admin
      .from("ticket_tiers")
      .select("id, name, price")
      .eq("id", tokenRow.tier_id as string)
      .maybeSingle(),
  ]);

  if (!event || !tier) {
    notFound();
  }

  const collective = event.collectives as unknown as { default_currency: string | null } | null;
  const currency = ((event.currency as string | null) || collective?.default_currency || "usd").toLowerCase();

  const priceCents = Math.round(Number(tier.price) * 100);
  const serviceFeeCents = calculateServiceFeeCents(priceCents);
  const totalPerTicketCents = priceCents + serviceFeeCents;
  const quantity = (tokenRow.quantity as number) || 1;
  const grandTotalCents = totalPerTicketCents * quantity;

  const eventDate = event.starts_at
    ? new Date(event.starts_at as string).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : null;

  const venue = event.venues as unknown as { name: string; city: string } | null;

  return (
    <div className="min-h-dvh bg-background overflow-x-hidden">
      <header className="border-b border-border px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link href="/" className="text-nocturn font-heading font-bold text-xl min-h-[44px] inline-flex items-center">
            Nocturn
          </Link>
          <span className="text-xs text-muted-foreground">Door Purchase</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="bg-nocturn px-6 py-5">
            <h1 className="text-xl font-bold font-heading text-white">{event.title}</h1>
            {eventDate && <p className="text-white/80 text-sm mt-1">{eventDate}</p>}
            {venue && <p className="text-white/70 text-xs mt-0.5">{venue.name}, {venue.city}</p>}
          </div>

          <div className="px-6 py-5 space-y-4">
            {expired || consumed ? (
              <div className="rounded-xl border-2 border-red-500/30 bg-red-500/10 p-5 text-center">
                <p className="text-base font-semibold text-red-400">
                  {consumed ? "This link has already been used." : "This payment link has expired."}
                </p>
                <p className="text-sm text-muted-foreground mt-2">Ask door staff to scan a new QR.</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-border bg-background/40 p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-semibold">{tier.name}</p>
                      <p className="text-xs text-muted-foreground">Quantity: {quantity}</p>
                    </div>
                    <p className="text-sm font-semibold">{formatMoney(priceCents * quantity, currency)}</p>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground pt-1 border-t border-border">
                    <span>Service fee</span>
                    <span>{formatMoney(serviceFeeCents * quantity, currency)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="font-bold text-base">Total</span>
                    <span className="font-bold text-lg text-nocturn">{formatMoney(grandTotalCents, currency)}</span>
                  </div>
                </div>

                <DoorBuyForm
                  doorBuyToken={token}
                  eventId={event.id as string}
                  tierId={tier.id as string}
                  quantity={quantity}
                />
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Powered by Nocturn &middot; You&apos;ll get your ticket QR via email
        </p>
      </main>
    </div>
  );
}
