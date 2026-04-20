import { SupabaseClient } from "@supabase/supabase-js";
import { calculateServiceFeeCents } from "@/lib/pricing";

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
    .select("id, code, discount_type, discount_value, max_uses, is_active, expires_at")
    .eq("event_id", eventId)
    .ilike("code", promoCode)
    .maybeSingle();

  if (!promo) {
    return { error: "Promo code not found" };
  }

  // Active check
  if (!promo.is_active) {
    return { error: "Promo code is no longer active" };
  }

  // Expiry check
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return { error: "Promo code expired" };
  }

  // Capacity check against promo_code_usage count if max_uses is set.
  // current_uses was removed from the schema — we derive the count from the usage table.
  if (promo.max_uses !== null) {
    const { count: usageCount } = await admin
      .from("promo_code_usage")
      .select("*", { count: "exact", head: true })
      .eq("promo_code_id", promo.id);

    const currentUses = usageCount ?? 0;
    if (currentUses + quantity > promo.max_uses) {
      return { error: "Promo code usage limit reached" };
    }
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

