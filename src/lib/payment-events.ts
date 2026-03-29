/**
 * Payment event logging utility.
 *
 * Writes structured records to the payment_events table for auditing,
 * debugging, and manual resolution of failed operations (e.g. refund failures).
 *
 * All calls are fire-and-forget — logging errors never block the payment flow.
 */

import { createAdminClient } from "@/lib/supabase/config";

export type PaymentEventType =
  | "payment_created"
  | "payment_succeeded"
  | "tickets_fulfilled"
  | "fulfillment_failed"
  | "refund_issued"
  | "refund_failed"
  | "capacity_exceeded";

export interface LogPaymentEventParams {
  event_type: PaymentEventType;
  payment_intent_id?: string | null;
  event_id?: string | null;
  tier_id?: string | null;
  quantity?: number | null;
  amount_cents?: number | null;
  currency?: string | null;
  buyer_email?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Log a payment lifecycle event to the payment_events table.
 * Never throws — all errors are swallowed and logged to console only.
 */
export async function logPaymentEvent(params: LogPaymentEventParams): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("payment_events").insert({
      event_type: params.event_type,
      payment_intent_id: params.payment_intent_id ?? null,
      event_id: params.event_id ?? null,
      tier_id: params.tier_id ?? null,
      quantity: params.quantity ?? null,
      amount_cents: params.amount_cents ?? null,
      currency: params.currency ?? "usd",
      buyer_email: params.buyer_email ?? null,
      error_message: params.error_message ?? null,
      metadata: params.metadata ?? {},
    });
    if (error) {
      console.error("[payment-events] Failed to log event:", params.event_type, error.message);
    }
  } catch (err) {
    console.error("[payment-events] Unexpected error logging event:", params.event_type, err);
  }
}
