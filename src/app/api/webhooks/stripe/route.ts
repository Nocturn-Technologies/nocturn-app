/**
 * Stripe Webhook Handler
 *
 * Handled events (configure in Stripe Dashboard → Webhooks):
 *
 * Platform webhook endpoint (STRIPE_WEBHOOK_SECRET):
 *   - checkout.session.completed    — Fulfill tickets from Checkout Sessions
 *   - payment_intent.succeeded      — Fulfill tickets from embedded/direct PaymentIntents
 *   - payment_intent.payment_failed — Update order status to failed
 *   - charge.refunded               — Mark order/tickets as refunded
 *   - charge.failed                 — Mark order as failed
 *   - charge.dispute.created        — Mark tickets as disputed
 *   - charge.dispute.closed         — Restore tickets if dispute won
 *
 * Both endpoints POST to this same route; we try both signatures in turn
 * and branch on event.type.
 *
 * Deduplication: webhook_events table with unique stripe_event_id constraint.
 * Orders are looked up by stripe_payment_intent_id. Tickets are fulfilled via
 * the fulfill_tickets_atomic RPC and tracked via the ticket_events lifecycle table.
 */
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  getStripe,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_CONNECT_WEBHOOK_SECRET,
} from "@/lib/stripe";
import Stripe from "stripe";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/config";
import type { Json } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Log a raw Stripe event to the payment_events table. Fire-and-forget. */
async function logStripePaymentEvent(
  supabase: AdminClient,
  opts: {
    stripeEventId: string;
    stripePaymentIntentId: string | null;
    eventType: string;
    eventId: string | null;
    orderId: string | null;
    amountDollars: number | null;
    currency: string | null;
    customerEmail: string | null;
    status: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from("payment_events").insert({
      stripe_event_id: opts.stripeEventId,
      stripe_payment_intent_id: opts.stripePaymentIntentId,
      event_type: opts.eventType,
      event_id: opts.eventId,
      order_id: opts.orderId,
      amount: opts.amountDollars,
      currency: opts.currency ?? "cad",
      customer_email: opts.customerEmail,
      status: opts.status,
      metadata: (opts.metadata ?? {}) as unknown as Json,
    });
  } catch (err) {
    console.error("[stripe-webhook] payment_events log failed (non-fatal):", err);
  }
}

/** Look up an order by Stripe payment intent ID. */
async function getOrderByPaymentIntent(
  supabase: AdminClient,
  paymentIntentId: string
) {
  const { data } = await supabase
    .from("orders")
    .select("id, event_id, party_id, status, promo_code_id, currency")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  return data;
}

export async function POST(request: NextRequest) {
  // NOTE: No replay-window check on event.created — Stripe's constructEvent()
  // already validates the signature header timestamp (`t=`) against a 300s
  // tolerance, which is freshly generated on each delivery (including retries).
  // Adding an event.created check would reject legitimate Stripe retries, which
  // can arrive up to 3 days after the original event.
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  if (!STRIPE_WEBHOOK_SECRET && !STRIPE_CONNECT_WEBHOOK_SECRET) {
    console.error(
      "[stripe-webhook] No webhook secrets configured (STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET both empty)"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  // Try platform signature first, then Connect. Stripe signs each webhook
  // with exactly one of the two secrets — the one from the endpoint that
  // delivered the event. We accept both so we can register both endpoints
  // against this single route.
  const allSecrets: { key: "platform" | "connect"; value: string }[] = [
    { key: "platform", value: STRIPE_WEBHOOK_SECRET },
    { key: "connect", value: STRIPE_CONNECT_WEBHOOK_SECRET },
  ];
  const secretsToTry = allSecrets.filter((s) => s.value.length > 0);

  let lastErr: unknown = null;
  let verified: Stripe.Event | null = null;
  let matchedSecretKey: "platform" | "connect" | null = null;
  for (const { key, value } of secretsToTry) {
    try {
      verified = getStripe().webhooks.constructEvent(body, signature, value);
      matchedSecretKey = key;
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!verified) {
    const message =
      lastErr instanceof Error ? lastErr.message : "Unknown error";
    console.error("[stripe-webhook] Signature verification failed:", message);

    // Diagnostic: if only ONE of the two secrets is configured, the event
    // might be legit but addressed to the OTHER endpoint we forgot to
    // register.
    const hasPlatform = STRIPE_WEBHOOK_SECRET.length > 0;
    const hasConnect = STRIPE_CONNECT_WEBHOOK_SECRET.length > 0;
    if (!hasPlatform || !hasConnect) {
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureMessage(
          `Stripe webhook signature rejected — only ${hasPlatform ? "platform" : "connect"} secret is configured. If the event is a Connect (or platform) event, set the other secret in Vercel env.`,
          {
            level: "warning",
            tags: {
              area: "stripe-webhook",
              has_platform_secret: String(hasPlatform),
              has_connect_secret: String(hasConnect),
            },
          }
        );
      } catch {
        // Non-fatal — don't block the 400 response on Sentry failure.
      }
    }

    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  event = verified;

  // Cross-check: Connect-scoped events (envelope has `account`) should
  // have been signed with the Connect secret.
  if (event.account && matchedSecretKey === "platform") {
    console.warn(
      `[stripe-webhook] Connect-scoped event ${event.type} (${event.id}) verified via PLATFORM secret. If you intended to separate endpoints, check your Stripe Dashboard webhook config.`
    );
  }

  // Dedup via webhook_events table — INSERT-first, rely on unique stripe_event_id constraint.
  // Handles Stripe retries so a replayed event doesn't re-fulfill tickets.
  const supabaseForDedup = createAdminClient();
  try {
    const { error: dedupErr } = await supabaseForDedup
      .from("webhook_events")
      .insert({ stripe_event_id: event.id, event_type: event.type });
    if (dedupErr) {
      if (dedupErr.code === "23505") {
        console.info(`[stripe-webhook] Duplicate event ${event.id} (${event.type}) — skipping`);
        return NextResponse.json({ received: true, duplicate: true });
      }
      console.warn(`[stripe-webhook] webhook_events insert failed (non-fatal): ${dedupErr.message}`);
    }
  } catch (dedupErr) {
    console.warn("[stripe-webhook] Dedup pre-check failed (non-fatal):", dedupErr);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const result = await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.id
        );
        if (result?.backgroundWork) {
          after(result.backgroundWork);
        }
        break;
      }
      case "payment_intent.succeeded": {
        const result = await handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent,
          event.id
        );
        if (result?.backgroundWork) {
          after(result.backgroundWork);
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const failureReason = pi.last_payment_error?.message ?? "unknown";
        console.warn(
          `[stripe-webhook] Payment failed for PI ${pi.id}: ${failureReason}`
        );
        const supabase = createAdminClient();

        // Update order status to 'failed' and release pending tickets
        if (pi.id) {
          const order = await getOrderByPaymentIntent(supabase, pi.id);
          if (order) {
            await supabase
              .from("orders")
              .update({ status: "failed" })
              .eq("id", order.id);
            console.info(`[stripe-webhook] Order ${order.id} marked failed for PI ${pi.id}`);

            await logStripePaymentEvent(supabase, {
              stripeEventId: event.id,
              stripePaymentIntentId: pi.id,
              eventType: "payment_intent.payment_failed",
              eventId: order.event_id,
              orderId: order.id,
              amountDollars: pi.amount ? pi.amount / 100 : null,
              currency: pi.currency ?? "cad",
              customerEmail: null,
              status: "failed",
              metadata: { failure_reason: failureReason },
            });

            // Delete pending tickets via order_lines to release reserved capacity
            const { data: orderLines } = await supabase
              .from("order_lines")
              .select("id")
              .eq("order_id", order.id);
            const orderLineIds = (orderLines ?? []).map((ol) => ol.id);
            if (orderLineIds.length > 0) {
              const { data: failedTickets, error: failErr } = await supabase
                .from("tickets")
                .delete()
                .in("order_line_id", orderLineIds)
                .eq("status", "pending")
                .select("id");
              if (failErr) {
                console.error("[stripe-webhook] Failed to delete pending tickets:", failErr);
              } else if (failedTickets && failedTickets.length > 0) {
                console.info(
                  `[stripe-webhook] Deleted ${failedTickets.length} pending ticket(s) for PI ${pi.id}`
                );
              }
            }
          }
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const refundPiId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : (charge.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

        if (!refundPiId) {
          console.warn("[stripe-webhook] charge.refunded event has no payment_intent ID, skipping");
          break;
        }

        const isFullRefund = charge.refunded === true;
        console.info(`[stripe-webhook] Charge ${isFullRefund ? "fully" : "partially"} refunded for PI ${refundPiId}`);
        const supabase = createAdminClient();

        // Look up the order
        const order = await getOrderByPaymentIntent(supabase, refundPiId);
        if (!order) {
          console.warn(`[stripe-webhook] No order found for PI ${refundPiId} on charge.refunded`);
          break;
        }

        const newOrderStatus = isFullRefund ? "refunded" : "partially_refunded";
        await supabase
          .from("orders")
          .update({ status: newOrderStatus })
          .eq("id", order.id);

        await logStripePaymentEvent(supabase, {
          stripeEventId: event.id,
          stripePaymentIntentId: refundPiId,
          eventType: "charge.refunded",
          eventId: order.event_id,
          orderId: order.id,
          amountDollars: charge.amount_refunded ? charge.amount_refunded / 100 : null,
          currency: charge.currency ?? "cad",
          customerEmail: charge.billing_details?.email ?? null,
          status: newOrderStatus,
          metadata: { charge_id: charge.id, full_refund: isFullRefund },
        });

        if (isFullRefund) {
          // Mark all paid/checked_in tickets for this order as refunded
          // Tickets are linked to order via order_line_id → order_lines → orders
          const { data: orderLines } = await supabase
            .from("order_lines")
            .select("id")
            .eq("order_id", order.id);

          const orderLineIds = (orderLines ?? []).map((ol) => ol.id);
          if (orderLineIds.length > 0) {
            const { data: refundedTickets, error: refundErr } = await supabase
              .from("tickets")
              .update({ status: "refunded" })
              .in("order_line_id", orderLineIds)
              .in("status", ["paid", "checked_in"])
              .select("id, tier_id, order_line_id");

            if (refundErr) {
              console.error("[stripe-webhook] Failed to update tickets to refunded:", refundErr);
            } else if (refundedTickets && refundedTickets.length > 0) {
              console.info(`[stripe-webhook] Marked ${refundedTickets.length} ticket(s) as refunded for PI ${refundPiId}`);

              // Log ticket_events for each refunded ticket
              const ticketEventRows = refundedTickets.map((t) => ({
                ticket_id: t.id,
                event_type: "refunded" as const,
                metadata: { charge_id: charge.id, order_id: order.id },
              }));
              await supabase.from("ticket_events").insert(ticketEventRows);

              // Promote waitlist per tier — best-effort
              const byTier = new Map<string, number>();
              for (const t of refundedTickets) {
                if (t.tier_id) {
                  byTier.set(t.tier_id, (byTier.get(t.tier_id) ?? 0) + 1);
                }
              }
              const { notifyNextOnWaitlist } = await import("@/app/actions/ticket-waitlist");
              for (const [tierId, count] of byTier.entries()) {
                try {
                  await notifyNextOnWaitlist(order.event_id, tierId, count);
                } catch (err) {
                  console.error("[stripe-webhook] waitlist notify failed (non-fatal):", err);
                }
              }
            }
          }
        } else {
          // Partial refund — update order_lines refunded_quantity based on Stripe refund amount
          // Best-effort: log and let the operator reconcile via refunds page
          console.info(
            `[stripe-webhook] Partial refund ${charge.amount_refunded}¢ for PI ${refundPiId} — order ${order.id} marked partially_refunded. Manual ticket reconciliation may be needed.`
          );
        }
        break;
      }
      case "charge.failed": {
        const charge = event.data.object as Stripe.Charge;
        const failedPiId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : (charge.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;
        if (failedPiId) {
          console.warn(`[stripe-webhook] Charge failed for PI ${failedPiId}: ${charge.failure_message ?? "unknown"}`);
          const supabase = createAdminClient();
          const order = await getOrderByPaymentIntent(supabase, failedPiId);
          if (order) {
            await supabase
              .from("orders")
              .update({ status: "failed" })
              .eq("id", order.id);

            // Delete pending tickets to release reserved capacity
            const { data: orderLines } = await supabase
              .from("order_lines")
              .select("id")
              .eq("order_id", order.id);
            const orderLineIds = (orderLines ?? []).map((ol) => ol.id);
            if (orderLineIds.length > 0) {
              const { data: failedTickets } = await supabase
                .from("tickets")
                .delete()
                .in("order_line_id", orderLineIds)
                .eq("status", "pending")
                .select("id");
              if (failedTickets && failedTickets.length > 0) {
                console.info(`[stripe-webhook] Deleted ${failedTickets.length} pending ticket(s) for charge failure on PI ${failedPiId}`);
              }
            }
          }
        }
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const disputePiId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : (dispute.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;
        const disputeReason = dispute.reason ?? "unknown";
        if (disputePiId) {
          console.warn(
            `[stripe-webhook] Charge disputed for PI ${disputePiId}, reason: ${disputeReason}`
          );
          const supabase = createAdminClient();
          const order = await getOrderByPaymentIntent(supabase, disputePiId);
          if (!order) {
            console.warn(`[stripe-webhook] No order found for PI ${disputePiId} on dispute`);
            break;
          }

          // Get order lines to find tickets
          const { data: orderLines } = await supabase
            .from("order_lines")
            .select("id")
            .eq("order_id", order.id);
          const orderLineIds = (orderLines ?? []).map((ol) => ol.id);

          if (orderLineIds.length > 0) {
            const { data: ticketsToDispute } = await supabase
              .from("tickets")
              .select("id")
              .in("order_line_id", orderLineIds)
              .in("status", ["paid", "checked_in"]);

            const ticketIds = (ticketsToDispute ?? []).map((t) => t.id);
            if (ticketIds.length > 0) {
              const { error: disputeErr } = await supabase
                .from("tickets")
                .update({ status: "cancelled" })
                .in("id", ticketIds);
              if (disputeErr) {
                console.error("[stripe-webhook] Failed to update tickets for dispute:", disputeErr);
              } else {
                console.info(
                  `[stripe-webhook] Marked ${ticketIds.length} ticket(s) as cancelled (dispute) for PI ${disputePiId}`
                );
                // Log ticket_events
                await supabase.from("ticket_events").insert(
                  ticketIds.map((id) => ({
                    ticket_id: id,
                    event_type: "voided" as const,
                    metadata: { dispute_id: dispute.id, dispute_reason: disputeReason },
                  }))
                );
              }
            }
          }
        } else {
          console.warn("[stripe-webhook] charge.dispute.created event has no payment_intent ID, skipping");
        }
        break;
      }
      case "charge.dispute.closed": {
        const closedDispute = event.data.object as Stripe.Dispute;
        const closedPiId =
          typeof closedDispute.payment_intent === "string"
            ? closedDispute.payment_intent
            : (closedDispute.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;
        if (closedPiId && closedDispute.status === "won") {
          console.info(`[stripe-webhook] Dispute won for PI ${closedPiId}, restoring tickets`);
          const supabase = createAdminClient();
          const order = await getOrderByPaymentIntent(supabase, closedPiId);
          if (!order) break;

          const { data: orderLines } = await supabase
            .from("order_lines")
            .select("id")
            .eq("order_id", order.id);
          const orderLineIds = (orderLines ?? []).map((ol) => ol.id);

          if (orderLineIds.length > 0) {
            const { data: ticketsToRestore } = await supabase
              .from("tickets")
              .select("id")
              .in("order_line_id", orderLineIds)
              .eq("status", "cancelled");

            const ticketIds = (ticketsToRestore ?? []).map((t) => t.id);
            if (ticketIds.length > 0) {
              const { error: restoreErr } = await supabase
                .from("tickets")
                .update({ status: "paid" })
                .in("id", ticketIds);
              if (restoreErr) {
                console.error("[stripe-webhook] Failed to restore disputed tickets:", restoreErr);
              } else {
                console.info(`[stripe-webhook] Restored ${ticketIds.length} ticket(s) from dispute for PI ${closedPiId}`);
                // Restore order to paid
                await supabase
                  .from("orders")
                  .update({ status: "paid" })
                  .eq("id", order.id);
              }
            }
          }
        } else if (closedPiId) {
          console.info(`[stripe-webhook] Dispute closed (${closedDispute.status}) for PI ${closedPiId}`);
        }
        break;
      }
      // ──────────────── Connect events ────────────────
      // These arrive from the Connect webhook endpoint (scoped to connected accounts).
      // The payouts table schema has been updated; Stripe Connect columns are
      // managed separately. Log and acknowledge.
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        console.info(
          `[stripe-webhook] account.updated: ${account.id} charges=${account.charges_enabled} payouts=${account.payouts_enabled} details_submitted=${account.details_submitted}`
        );
        // Note: collectives table no longer has denormalized Stripe status columns.
        // Stripe account status should be read directly from the Stripe API on demand.
        break;
      }
      case "account.application.deauthorized": {
        const deauthorizedAccountId = event.account;
        console.warn(
          `[stripe-webhook] account.application.deauthorized for account ${deauthorizedAccountId ?? "unknown"} — manual action required to unlink collective.`
        );
        break;
      }
      case "transfer.created": {
        const transfer = event.data.object as Stripe.Transfer;
        console.info(
          `[stripe-webhook] transfer.created ${transfer.id} -> ${transfer.destination} — recorded for audit.`
        );
        break;
      }
      case "transfer.reversed": {
        const transfer = event.data.object as Stripe.Transfer;
        const isFullReversal =
          (transfer.amount_reversed ?? 0) >= (transfer.amount ?? 0);
        console.warn(
          `[stripe-webhook] transfer.reversed ${transfer.id} ${isFullReversal ? "FULL" : "partial"} reversal — manual reconciliation may be needed.`
        );
        break;
      }
      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        console.info(
          `[stripe-webhook] payout.paid ${payout.id} for account ${event.account ?? "unknown"} — recorded for audit.`
        );
        break;
      }
      case "payout.failed": {
        const payout = event.data.object as Stripe.Payout;
        console.warn(
          `[stripe-webhook] payout.failed ${payout.id} for account ${event.account ?? "unknown"}: ${payout.failure_message ?? payout.failure_code}`
        );
        break;
      }
      default:
        console.info(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error handling ${event.type}:`, err);
    // Only return 500 (triggering Stripe retry) for transient errors like DB connection failures.
    // For logic errors, return 200 to prevent infinite retries and duplicate tickets.
    const errMsg = err instanceof Error ? err.message : "";
    const errMsgLower = errMsg.toLowerCase();
    const isTransient = err instanceof Error && (
      errMsgLower.includes("connect") ||
      errMsgLower.includes("timeout") ||
      errMsgLower.includes("econnrefused") ||
      errMsgLower.includes("econnreset") ||
      errMsgLower.includes("etimedout") ||
      errMsgLower.includes("fetch failed") ||
      errMsgLower.includes("socket hang up") ||
      errMsgLower.includes("network") ||
      errMsgLower.includes("too many connections") ||
      errMsgLower.includes("connection terminated") ||
      errMsgLower.includes("connection pool") ||
      /\b(53[0-9]{3}|57[A-Z0-9]{3}|08[0-9]{3})\b/.test(errMsg) ||
      errMsgLower.includes("could not connect") ||
      errMsgLower.includes("503") ||
      errMsgLower.includes("502")
    );
    if (isTransient) {
      return NextResponse.json(
        { error: "Webhook handler failed (transient)" },
        { status: 500 }
      );
    }
    // Non-retryable error — acknowledge receipt so Stripe doesn't retry
    return NextResponse.json(
      { error: "Webhook handler failed (non-retryable)" },
      { status: 200 }
    );
  }

  return NextResponse.json({ received: true });
}

/**
 * Handle checkout.session.completed — fulfill tickets from a Checkout Session.
 * The checkout route must have created an order + order_lines + pending tickets
 * before redirecting to Stripe. This handler transitions everything to paid.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  stripeEventId: string
) {
  const metadata = session.metadata;

  if (!metadata?.eventId || !metadata?.tierId || !metadata?.quantity) {
    console.error(
      "[stripe-webhook] Missing metadata on checkout session:",
      session.id,
      "metadata:",
      JSON.stringify(metadata)
    );
    throw new Error(
      `Missing required metadata (eventId/tierId/quantity) on checkout session ${session.id}`
    );
  }

  const eventId = metadata.eventId;
  const tierId = metadata.tierId;
  const quantity = parseInt(metadata.quantity, 10);
  if (isNaN(quantity) || quantity < 1) {
    console.error("[stripe-webhook] Invalid quantity in metadata:", metadata.quantity);
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const currency = (
    (metadata.chargeCurrency || session.currency || "cad") as string
  ).toLowerCase();

  const supabase = createAdminClient();

  // Look up the order by payment intent ID
  const order = paymentIntentId
    ? await getOrderByPaymentIntent(supabase, paymentIntentId)
    : null;

  if (!order) {
    console.error(
      `[stripe-webhook] No order found for session ${session.id} (PI: ${paymentIntentId}) — cannot fulfill tickets`
    );
    return;
  }

  // IDEMPOTENCY CHECK: if order is already paid, skip
  if (order.status === "paid") {
    console.info(
      `[stripe-webhook] Idempotency: order ${order.id} already paid for session ${session.id}, skipping`
    );
    return;
  }

  // Mark order as paid
  const { error: orderUpdateErr } = await supabase
    .from("orders")
    .update({ status: "paid" })
    .eq("id", order.id);
  if (orderUpdateErr) {
    console.error("[stripe-webhook] Failed to update order status:", orderUpdateErr);
    throw orderUpdateErr;
  }

  // Log to payment_events
  void logStripePaymentEvent(supabase, {
    stripeEventId,
    stripePaymentIntentId: paymentIntentId,
    eventType: "checkout.session.completed",
    eventId,
    orderId: order.id,
    amountDollars: session.amount_total ? session.amount_total / 100 : null,
    currency,
    customerEmail: session.customer_email ?? session.customer_details?.email ?? null,
    status: "paid",
    metadata: { checkout_session_id: session.id, flow: "checkout_session" },
  });

  // Get order lines for this order
  const { data: orderLines } = await supabase
    .from("order_lines")
    .select("id, tier_id, quantity")
    .eq("order_id", order.id);

  const orderLineIds = (orderLines ?? []).map((ol) => ol.id);

  // Find or create tickets — update pending tickets to paid first
  let fulfilledTickets: { id: string }[] = [];

  if (orderLineIds.length > 0) {
    const { data: pendingTickets, error: pendingErr } = await supabase
      .from("tickets")
      .update({ status: "paid" })
      .in("order_line_id", orderLineIds)
      .eq("status", "pending")
      .select("id");

    if (!pendingErr && pendingTickets && pendingTickets.length > 0) {
      fulfilledTickets = pendingTickets;
      console.info(
        `[stripe-webhook] Updated ${fulfilledTickets.length} pending ticket(s) to paid for session ${session.id}`
      );
    }
  }

  // If no pending tickets were updated, use the atomic RPC to create them
  if (fulfilledTickets.length === 0) {
    const targetOrderLine = orderLines?.[0];
    if (targetOrderLine && order.party_id) {
      try {
        const { data: atomicResult, error: atomicError } = await supabase.rpc(
          "fulfill_tickets_atomic",
          {
            p_event_id: eventId,
            p_holder_party_id: order.party_id,
            p_order_line_id: targetOrderLine.id,
            p_quantity: quantity,
            p_tier_id: tierId,
          }
        );
        if (atomicError) throw atomicError;
        fulfilledTickets = (atomicResult ?? []) as { id: string }[];
        console.info(
          `[stripe-webhook] Atomic fulfillment: ${fulfilledTickets.length} ticket(s) for session ${session.id}`
        );
      } catch (atomicErr) {
        console.error("[stripe-webhook] Atomic fulfillment failed:", atomicErr);
        throw atomicErr;
      }
    }
  }

  // Log ticket_events (purchased) for each fulfilled ticket
  if (fulfilledTickets.length > 0) {
    const ticketEventRows = fulfilledTickets.map((t) => ({
      ticket_id: t.id,
      event_type: "purchased" as const,
      party_id: order.party_id,
      metadata: { checkout_session_id: session.id, order_id: order.id },
    }));
    await supabase.from("ticket_events").insert(ticketEventRows);
  }

  // Return background work to run AFTER the response is sent to Stripe.
  // QR generation + email sending can take 10-30s and would cause Stripe timeouts.
  return {
    backgroundWork: async () => {
      // Analytics tracking
      try {
        const { trackServerEvent } = await import("@/lib/track-server");
        await trackServerEvent("ticket_purchased", {
          eventId,
          quantity,
          sessionId: session.id,
        });
      } catch { /* non-critical */ }

      try {
        const { trackTicketSold } = await import("@/lib/analytics");
        trackTicketSold(tierId, quantity);
      } catch { /* non-critical */ }

      if (fulfilledTickets.length === 0) return;

      // Generate QR codes for each ticket
      const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
      const qrCodes: string[] = [];

      const qrResults = await Promise.allSettled(
        fulfilledTickets.map(async (ticket) => {
          const ticketUrl = `${BASE_URL}/ticket/${ticket.id}`;
          const qrDataUrl = await QRCode.toDataURL(ticketUrl, {
            width: 400,
            margin: 2,
            color: { dark: "#000000", light: "#ffffff" },
            errorCorrectionLevel: "H",
          });
          await supabase
            .from("tickets")
            .update({ qr_code: qrDataUrl })
            .eq("id", ticket.id);
          return qrDataUrl;
        })
      );

      for (const r of qrResults) {
        if (r.status === "fulfilled") qrCodes.push(r.value);
        else console.error("[stripe-webhook] QR generation failed:", r.reason);
      }

      console.info(
        `[stripe-webhook] Generated ${qrCodes.length}/${fulfilledTickets.length} QR codes`
      );

      // Send branded confirmation email with QR codes
      try {
        const customerEmail = session.customer_email ?? session.customer_details?.email;
        if (!customerEmail) {
          console.warn(
            `[stripe-webhook] No buyer email available for session ${session.id}, skipping confirmation email`
          );
          return;
        }

        const { data: eventRow } = await supabase
          .from("events")
          .select("title, starts_at, venue_name")
          .eq("id", eventId)
          .maybeSingle();

        const { data: tierInfo } = await supabase
          .from("ticket_tiers")
          .select("name, price")
          .eq("id", tierId)
          .maybeSingle();

        if (eventRow) {
          const pricePaid = Number(tierInfo?.price ?? 0);
          const { sendTicketConfirmation } = await import("@/lib/email/actions");
          await sendTicketConfirmation({
            to: customerEmail,
            eventTitle: eventRow.title || "Event",
            eventDate: new Date(eventRow.starts_at).toLocaleDateString("en", {
              weekday: "long", month: "long", day: "numeric", year: "numeric",
            }),
            venueName: eventRow.venue_name || "TBA",
            tierName: tierInfo?.name || "General Admission",
            quantity,
            totalPrice: `$${(pricePaid * quantity).toFixed(2)}`,
            ticketLink: `${BASE_URL}/ticket/${fulfilledTickets[0]?.id || ""}`,
            qrCodes: qrCodes.length > 0 ? qrCodes : undefined,
            ticketTokens: fulfilledTickets.map((t) => t.id),
          });
          console.info("[stripe-webhook] Confirmation email sent with QR codes");

          // Post-purchase hooks
          try {
            const { runPostPurchaseHooks } = await import("@/app/actions/post-purchase-hooks");
            await runPostPurchaseHooks({
              eventId,
              buyerEmail: customerEmail,
              ticketToken: fulfilledTickets[0]?.id || "",
            });
          } catch { /* non-critical */ }
        }
      } catch (emailErr) {
        console.error("[stripe-webhook] Email send failed (non-blocking):", emailErr);
      }
    },
  };
}

/**
 * Handle payment_intent.succeeded — fulfill tickets from embedded/direct PaymentIntents.
 * Skips if the PI originated from a Checkout Session (handled above) or if the PI
 * metadata doesn't include eventId/tierId/quantity.
 */
async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  stripeEventId: string
) {
  const metadata = paymentIntent.metadata;

  if (!metadata?.eventId || !metadata?.tierId || !metadata?.quantity) {
    // Not a ticket purchase PaymentIntent
    return;
  }

  // If this PaymentIntent originated from a Checkout Session, skip entirely.
  const checkoutSessionId = metadata.checkoutSessionId ?? null;
  if (checkoutSessionId) {
    console.info(
      `[stripe-webhook] PI ${paymentIntent.id} originated from checkout session ${checkoutSessionId}, skipping (handled by checkout.session.completed)`
    );
    return;
  }

  const eventId = metadata.eventId;
  const tierId = metadata.tierId;
  const quantity = parseInt(metadata.quantity, 10);
  if (isNaN(quantity) || quantity < 1) {
    console.error("[stripe-webhook] Invalid quantity in PI metadata:", metadata.quantity);
    return;
  }

  // SECURITY: Verify payment amount matches expected amount from metadata
  const expectedCents = parseInt(metadata.totalAmountCents || metadata.baseAmountCents || "0", 10);
  if (expectedCents > 0 && paymentIntent.amount !== expectedCents) {
    console.error(
      `[stripe-webhook] AMOUNT MISMATCH: PI ${paymentIntent.id} charged ${paymentIntent.amount} cents but expected ${expectedCents} cents`
    );
    return;
  }

  const buyerEmail = metadata.buyerEmail || paymentIntent.receipt_email;
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
  const currency = (
    metadata.chargeCurrency || metadata.baseCurrency || paymentIntent.currency || "cad"
  ).toLowerCase();

  const supabase = createAdminClient();

  // Look up the order by payment intent ID
  const order = await getOrderByPaymentIntent(supabase, paymentIntent.id);

  if (!order) {
    console.error(
      `[stripe-webhook] No order found for PI ${paymentIntent.id} — cannot fulfill tickets`
    );
    return;
  }

  // IDEMPOTENCY CHECK: if order is already paid, skip
  if (order.status === "paid") {
    console.info(
      `[stripe-webhook] Idempotency: order ${order.id} already paid for PI ${paymentIntent.id}, skipping`
    );
    return;
  }

  // Mark order as paid
  const { error: orderUpdateErr } = await supabase
    .from("orders")
    .update({ status: "paid" })
    .eq("id", order.id);
  if (orderUpdateErr) {
    console.error("[stripe-webhook] Failed to update order status:", orderUpdateErr);
    throw orderUpdateErr;
  }

  // Log to payment_events
  void logStripePaymentEvent(supabase, {
    stripeEventId,
    stripePaymentIntentId: paymentIntent.id,
    eventType: "payment_intent.succeeded",
    eventId,
    orderId: order.id,
    amountDollars: paymentIntent.amount / 100,
    currency,
    customerEmail: buyerEmail ?? null,
    status: "paid",
    metadata: { flow: "payment_intent" },
  });

  // Get order lines
  const { data: orderLines } = await supabase
    .from("order_lines")
    .select("id, tier_id, quantity")
    .eq("order_id", order.id);
  const orderLineIds = (orderLines ?? []).map((ol) => ol.id);

  let fulfilledTickets: { id: string }[] = [];
  let wasNewlyCreated = true;

  // Try to update pending tickets to paid first
  if (orderLineIds.length > 0) {
    const { data: updatedTickets, error: updateError } = await supabase
      .from("tickets")
      .update({ status: "paid" })
      .in("order_line_id", orderLineIds)
      .eq("status", "pending")
      .select("id");

    if (!updateError && updatedTickets && updatedTickets.length > 0) {
      fulfilledTickets = updatedTickets;
      console.info(
        `[stripe-webhook] Updated ${updatedTickets.length} pending ticket(s) to paid for PI ${paymentIntent.id}`
      );
    } else if (updateError) {
      console.warn("[stripe-webhook] Failed to update pending tickets for PI, falling back:", updateError);
    }
  }

  // Check for already-paid tickets (idempotency after the order status check)
  if (fulfilledTickets.length === 0 && orderLineIds.length > 0) {
    const { data: existingPaid } = await supabase
      .from("tickets")
      .select("id")
      .in("order_line_id", orderLineIds)
      .in("status", ["paid", "checked_in"]);

    if (existingPaid && existingPaid.length > 0) {
      fulfilledTickets = existingPaid;
      wasNewlyCreated = false;
      console.info(
        `[stripe-webhook] Tickets already paid for PI ${paymentIntent.id} — skipping creation`
      );
    }
  }

  // Fallback: use the atomic RPC if no tickets found
  if (fulfilledTickets.length === 0) {
    const targetOrderLine = orderLines?.[0];
    if (targetOrderLine && order.party_id) {
      try {
        const { data: atomicResult, error: atomicError } = await supabase.rpc(
          "fulfill_tickets_atomic",
          {
            p_event_id: eventId,
            p_holder_party_id: order.party_id,
            p_order_line_id: targetOrderLine.id,
            p_quantity: quantity,
            p_tier_id: tierId,
          }
        );
        if (atomicError) throw atomicError;
        fulfilledTickets = (atomicResult ?? []) as { id: string }[];
        wasNewlyCreated = true;
        console.info(
          `[stripe-webhook] Atomic fulfillment: ${fulfilledTickets.length} ticket(s) for PI ${paymentIntent.id}`
        );
      } catch (atomicErr) {
        console.error("[stripe-webhook] Atomic fulfillment failed:", atomicErr);
        throw atomicErr;
      }
    }
  }

  console.info(
    `[stripe-webhook] ${wasNewlyCreated ? "Created" : "Found existing"} ${fulfilledTickets.length} ticket(s) for PI ${paymentIntent.id}`
  );

  // Log ticket_events for newly created/activated tickets
  if (wasNewlyCreated && fulfilledTickets.length > 0) {
    const ticketEventRows = fulfilledTickets.map((t) => ({
      ticket_id: t.id,
      event_type: "purchased" as const,
      party_id: order.party_id ?? null,
      metadata: { payment_intent_id: paymentIntent.id, order_id: order.id },
    }));
    await supabase.from("ticket_events").insert(ticketEventRows);
  }

  // Return background work to run AFTER the response is sent to Stripe
  return {
    backgroundWork: async () => {
      // Analytics tracking — only if tickets were newly created
      if (wasNewlyCreated) {
        try {
          const { trackTicketSold } = await import("@/lib/analytics");
          trackTicketSold(tierId, quantity);
        } catch (err) {
          console.error("[stripe-webhook] Analytics tracking failed (non-blocking):", err);
        }
      }

      if (fulfilledTickets.length === 0) return;

      // Generate QR codes FIRST, then include in email
      const piQrCodes: string[] = [];
      const qrResults = await Promise.allSettled(
        fulfilledTickets.map(async (ticket) => {
          const qrDataUrl = await QRCode.toDataURL(
            `${BASE_URL}/ticket/${ticket.id}`,
            { width: 400, margin: 2, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "H" }
          );
          await supabase.from("tickets").update({ qr_code: qrDataUrl }).eq("id", ticket.id);
          return qrDataUrl;
        })
      );
      for (const r of qrResults) {
        if (r.status === "fulfilled") piQrCodes.push(r.value);
        else console.error("[stripe-webhook] QR failed:", r.reason);
      }

      // Send confirmation email with QR codes
      try {
        if (buyerEmail) {
          const { data: eventRow } = await supabase
            .from("events")
            .select("title, starts_at, venue_name")
            .eq("id", eventId)
            .maybeSingle();

          const { data: tierInfo } = await supabase
            .from("ticket_tiers")
            .select("name, price")
            .eq("id", tierId)
            .maybeSingle();

          if (eventRow) {
            const pricePaid = Number(tierInfo?.price ?? 0);
            const { sendTicketConfirmation } = await import("@/lib/email/actions");
            await sendTicketConfirmation({
              to: buyerEmail,
              eventTitle: eventRow.title || "Event",
              eventDate: new Date(eventRow.starts_at).toLocaleDateString("en", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              }),
              venueName: eventRow.venue_name || "TBA",
              tierName: tierInfo?.name || "General Admission",
              quantity,
              totalPrice: `$${(pricePaid * quantity).toFixed(2)}`,
              ticketLink: `${BASE_URL}/ticket/${fulfilledTickets[0]?.id || ""}`,
              qrCodes: piQrCodes.length > 0 ? piQrCodes : undefined,
              ticketTokens: fulfilledTickets.map((t) => t.id),
            });
          }
        }
        // Post-purchase hooks
        if (buyerEmail) {
          try {
            const { runPostPurchaseHooks } = await import("@/app/actions/post-purchase-hooks");
            await runPostPurchaseHooks({
              eventId,
              buyerEmail,
              ticketToken: fulfilledTickets[0]?.id || "",
            });
          } catch { /* non-critical */ }
        }
      } catch (emailErr) {
        console.error("[stripe-webhook] Email failed (non-blocking):", emailErr);
      }
    },
  };
}
