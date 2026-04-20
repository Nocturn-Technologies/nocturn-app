/**
 * Payment event logging utility.
 *
 * Writes structured records to the payment_events table for auditing,
 * debugging, and manual resolution of failed operations (e.g. refund failures).
 *
 * All calls are fire-and-forget — logging errors never block the payment flow.
 *
 * Schema (payment_events):
 *   stripe_event_id  TEXT UNIQUE NOT NULL — Stripe event or synthetic dedup key
 *   event_type       TEXT NOT NULL        — e.g. "payment_succeeded", "refund_issued"
 *   stripe_payment_intent_id TEXT         — Stripe PaymentIntent ID
 *   event_id         UUID → events        — Nocturn event FK
 *   order_id         UUID → orders        — Nocturn order FK
 *   amount           NUMERIC              — amount in dollars
 *   currency         TEXT                 — e.g. "cad"
 *   status           TEXT                 — e.g. "succeeded", "failed"
 *   customer_email   TEXT
 *   metadata         JSONB
 *   raw_payload      JSONB
 */

import { createAdminClient } from "@/lib/supabase/config";
import type { Json } from "@/lib/supabase/database.types";

export type PaymentEventType =
  | "payment_created"
  | "payment_succeeded"
  | "tickets_fulfilled"
  | "fulfillment_failed"
  | "refund_issued"
  | "refund_failed"
  | "capacity_exceeded";

export interface LogPaymentEventParams {
  /** Unique dedup key — use the Stripe event ID when available, otherwise construct a synthetic key. */
  stripe_event_id: string;
  event_type: PaymentEventType;
  stripe_payment_intent_id?: string | null;
  /** Nocturn event UUID */
  event_id?: string | null;
  /** Nocturn order UUID */
  order_id?: string | null;
  /** Amount in dollars (matches orders.total / NUMERIC column) */
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  customer_email?: string | null;
  metadata?: Record<string, unknown>;
  raw_payload?: Record<string, unknown>;
}

/**
 * Log a payment lifecycle event to the payment_events table.
 * Never throws — all errors are swallowed and logged to console only.
 */
export async function logPaymentEvent(params: LogPaymentEventParams): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("payment_events").insert({
      stripe_event_id: params.stripe_event_id,
      event_type: params.event_type,
      stripe_payment_intent_id: params.stripe_payment_intent_id ?? null,
      event_id: params.event_id ?? null,
      order_id: params.order_id ?? null,
      amount: params.amount ?? null,
      currency: params.currency ?? "cad",
      status: params.status ?? null,
      customer_email: params.customer_email ?? null,
      metadata: (params.metadata ?? {}) as Json,
      raw_payload: (params.raw_payload ?? null) as Json | null,
    });
    if (error) {
      console.error("[payment-events] Failed to log event:", params.event_type, error.message);
    }
  } catch (err) {
    console.error("[payment-events] Unexpected error logging event:", params.event_type, err);
  }
}
