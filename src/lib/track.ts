import { track as vercelTrack } from "@vercel/analytics";

/**
 * Track key product events for analytics.
 * Uses Vercel Analytics (free tier).
 * Safe to call on server or client — gracefully no-ops if unavailable.
 */
export function trackEvent(
  event: "event_created" | "event_published" | "ticket_purchased" | "ticket_free_registered" | "checkin_scanned" | "settlement_generated" | "promo_code_applied" | "email_campaign_sent",
  properties?: Record<string, string | number | boolean>
) {
  try {
    vercelTrack(event, properties);
  } catch {
    // Silently fail — analytics should never break the app
  }
}
