import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
});

// Platform fee percentage (Nocturn's cut)
export const PLATFORM_FEE_PERCENT = 5; // 5% per ticket
