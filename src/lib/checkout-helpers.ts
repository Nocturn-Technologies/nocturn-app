import { SupabaseClient } from "@supabase/supabase-js";
import { calculateServiceFeeCents } from "@/lib/pricing";
import { randomUUID } from "crypto";

// ── Promo code validation ────────────────────────────────────────────

export interface PromoResult {
  promoId: string;
  promoCode: string;
  discountCents: number;
}

export interface PromoError {
  error: string;
}

/**
 * Validate a promo code, atomically claim uses, and calculate its discount.
 * Claims uses BEFORE payment to prevent race conditions where two users
 * both see capacity and both pay, exceeding max_uses.
 * If payment fails, the webhook (payment_intent.payment_failed) decrements.
 * Returns the validated promo info or an error string.
 */
export async function validatePromo(
  admin: SupabaseClient,
  promoCode: string,
  eventId: string,
  basePriceCents: number,
  quantity: number
): Promise<PromoResult | PromoError> {
  // Sanitize input
  if (typeof promoCode !== "string" || promoCode.length === 0 || promoCode.length > 50) {
    return { error: "Invalid promo code" };
  }

  const { data: promo } = await admin
    .from("promo_codes")
    .select("id, code, discount_type, discount_value, max_uses, current_uses, valid_until")
    .eq("event_id", eventId)
    .ilike("code", promoCode)
    .maybeSingle();

  if (!promo) {
    return { error: "Promo code not found" };
  }

  // Active check: valid_until in the past means deactivated
  if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
    return { error: "Promo code expired" };
  }

  // Atomic claim: increment current_uses only if under max_uses.
  // This prevents race conditions where two users validate the same promo code
  // simultaneously and both see capacity available.
  if (promo.max_uses !== null) {
    const { data: claimResult, error: claimError } = await admin
      .from("promo_codes")
      .update({ current_uses: (promo.current_uses ?? 0) + quantity })
      .eq("id", promo.id)
      .lt("current_uses", promo.max_uses - quantity + 1) // atomic guard: current_uses + quantity <= max_uses
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error("[checkout-helpers] Promo claim failed:", claimError);
      return { error: "Failed to apply promo code" };
    }

    if (!claimResult) {
      return { error: "Promo code usage limit reached" };
    }
  } else {
    // No max_uses limit — just increment for tracking
    await admin
      .from("promo_codes")
      .update({ current_uses: (promo.current_uses ?? 0) + quantity })
      .eq("id", promo.id);
  }

  // Calculate discount in cents
  let discountCents: number;
  if (promo.discount_type === "percentage") {
    const pct = Number(promo.discount_value);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { error: "Invalid promo code configuration" };
    }
    discountCents = Math.round(basePriceCents * (pct / 100));
  } else {
    // Fixed amount — stored in dollars, convert to cents
    discountCents = Math.round(Number(promo.discount_value) * 100);
  }

  return {
    promoId: promo.id,
    promoCode: promo.code,
    discountCents,
  };
}

export function isPromoError(result: PromoResult | PromoError): result is PromoError {
  return "error" in result;
}

// ── Pricing calculation ──────────────────────────────────────────────

export interface CheckoutPricing {
  basePriceCents: number;
  discountCents: number;
  unitAmountCents: number;
  serviceFeePerTicketCents: number;
  totalPerTicketCents: number;
}

/**
 * Calculate checkout pricing from tier price, quantity, and discount.
 * All math is cents-based to avoid floating-point drift.
 */
export function calculateCheckoutPricing(
  tierPriceDollars: number,
  discountCents: number
): CheckoutPricing {
  const basePriceNumber = Number(tierPriceDollars);
  const basePriceCents = Number.isFinite(basePriceNumber) && basePriceNumber >= 0
    ? Math.round(basePriceNumber * 100)
    : 0;

  const clampedDiscount = Math.min(discountCents, basePriceCents);
  const unitAmountCents = Math.max(basePriceCents - clampedDiscount, 0);
  const serviceFeePerTicketCents = calculateServiceFeeCents(unitAmountCents);
  const totalPerTicketCents = unitAmountCents + serviceFeePerTicketCents;

  return {
    basePriceCents,
    discountCents: clampedDiscount,
    unitAmountCents,
    serviceFeePerTicketCents,
    totalPerTicketCents,
  };
}

// ── Pending ticket insertion ─────────────────────────────────────────

export interface PendingTicketResult {
  pendingTicketIds: string[];
  pendingTokens: string[];
}

/**
 * Insert pending tickets to reserve capacity.
 * These are upgraded to "paid" on webhook fulfillment or cleaned up after 30 min.
 */
export async function insertPendingTickets(
  admin: SupabaseClient,
  opts: {
    eventId: string;
    tierId: string;
    quantity: number;
    email: string;
    phone?: string | null;
    expiresInMs?: number;
  }
): Promise<PendingTicketResult> {
  const expiresAt = new Date(Date.now() + (opts.expiresInMs ?? 30 * 60 * 1000)).toISOString();

  const tickets = Array.from({ length: opts.quantity }, () => ({
    event_id: opts.eventId,
    ticket_tier_id: opts.tierId,
    user_id: null,
    status: "pending" as const,
    price_paid: 0,
    currency: "usd",
    stripe_payment_intent_id: null,
    ticket_token: randomUUID(),
    metadata: {
      customer_email: opts.email,
      ...(opts.phone && { customer_phone: opts.phone }),
      pending_expires_at: expiresAt,
    },
  }));

  const { data: inserted, error } = await admin
    .from("tickets")
    .insert(tickets)
    .select("id, ticket_token");

  if (error) {
    throw new Error(`Failed to insert pending tickets: ${error.message}`);
  }

  return {
    pendingTicketIds: inserted?.map((t) => t.id) ?? [],
    pendingTokens: inserted?.map((t) => t.ticket_token) ?? [],
  };
}
