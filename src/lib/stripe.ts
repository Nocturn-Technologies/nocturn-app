import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return _stripe;
}

// Platform fee percentage (Nocturn's cut)
export const PLATFORM_FEE_PERCENT = 5;
