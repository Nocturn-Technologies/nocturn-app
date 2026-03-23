import Stripe from "stripe";

// Server-side Stripe key — set via Vercel env vars
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

// Client-side publishable key — set via Vercel env vars
export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!_stripe) {
    _stripe = new Stripe(STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return _stripe;
}

// Platform fee: 7% + $0.50 per ticket (buyer pays, organizer keeps 100%)
export const PLATFORM_FEE_PERCENT = 7;
export const PLATFORM_FEE_FLAT_CENTS = 50; // $0.50 per ticket
