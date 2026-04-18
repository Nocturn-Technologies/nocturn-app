import Stripe from "stripe";

// Server-side Stripe key — set via Vercel env vars
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

// Client-side publishable key — set via Vercel env vars
export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// Separate secret for Connect events (account.updated, transfer.*, payout.*).
// Stripe delivers these from a different endpoint and signs them with a
// different secret — configure both in the Stripe dashboard pointing to the
// same /api/webhooks/stripe route.
export const STRIPE_CONNECT_WEBHOOK_SECRET =
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET || "";

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

// Re-export platform fee constants from single source of truth
export { PLATFORM_FEE_PERCENT, PLATFORM_FEE_FLAT_CENTS } from "@/lib/pricing";
