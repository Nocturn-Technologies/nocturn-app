/**
 * Stripe Webhook Handler
 *
 * Handled events (configure in Stripe Dashboard → Webhooks):
 *
 * Platform webhook endpoint (STRIPE_WEBHOOK_SECRET):
 *   - checkout.session.completed    — Fulfill tickets from Checkout Sessions
 *   - payment_intent.succeeded      — Fulfill tickets from embedded/direct PaymentIntents
 *   - payment_intent.payment_failed — Delete pending tickets to release capacity
 *   - charge.refunded               — Mark paid/checked-in tickets as refunded
 *   - charge.failed                  — Clean up pending tickets on charge failure
 *   - charge.dispute.created         — Mark tickets as disputed
 *   - charge.dispute.closed          — Restore tickets if dispute won
 *
 * Connect webhook endpoint (STRIPE_CONNECT_WEBHOOK_SECRET) — events scoped
 * to a connected account, delivered separately by Stripe:
 *   - account.updated                — Onboarding state changed (read-only log)
 *   - transfer.created / transfer.failed / transfer.reversed — transfer lifecycle
 *   - payout.paid / payout.failed   — funds hit (or failed to hit) operator's bank
 *
 * Both endpoints POST to this same route; we try both signatures in turn
 * and branch on event.type.
 *
 * NOTE: Webhook dedup relies on ticket-level idempotency checks (paid ticket counts
 * per PI/session). A dedicated webhook_events table for event.id dedup would be more
 * robust but is not yet implemented. The current approach is sufficient for ticket
 * events; non-ticket events (disputes, refunds) are naturally idempotent.
 *
 * TODO: Add a cron job (e.g., Vercel cron every 15 min) to clean up expired pending
 * tickets older than 30 minutes. For now, the capacity queries in the public event
 * page and checkout routes only count pending tickets created within the last 30 min,
 * so expired ones are effectively ignored. A cleanup cron would just remove the rows:
 *   DELETE FROM tickets WHERE status = 'pending' AND created_at < now() - interval '30 minutes';
 */
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  getStripe,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_CONNECT_WEBHOOK_SECRET,
} from "@/lib/stripe";
import Stripe from "stripe";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/config";
import { logPaymentEvent } from "@/lib/payment-events";
import { isZeroDecimal } from "@/lib/currency";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reverse a settlement payout when a ticket is refunded after the operator
 * has already been paid out. Pulls the refunded ticket value back from the
 * connected account's Stripe balance into the platform balance.
 *
 * Currency model: transfers and reversals are in the EVENT currency (the
 * currency tickets were charged in). We read the original payout row for
 * the transfer to find its currency, and reverse in that same currency
 * with the sum of refunded ticket `price_paid` values.
 *
 * Behavior:
 *   - Looks up the settlement for the event.
 *   - If the settlement is NOT paid_out: no-op (refunds auto-deduct from the
 *     next settlement's gross revenue, so nothing to do).
 *   - If paid_out: calls transfers.createReversal in the transfer's own
 *     currency. Idempotency key ties to the refund id so Stripe de-dups
 *     on webhook retries.
 *   - Inserts a negative-amount payouts row (status=completed, metadata.kind=
 *     'reversal') so operators see the pull-back in their payout history.
 *
 * Silent on failure — best-effort background reconciliation; worst case
 * Shawn reverses manually from the Stripe dashboard.
 */
async function reverseTransferForRefund(
  supabase: SupabaseClient,
  opts: {
    eventId: string;
    refundedAmountDollars: number; // sum of refunded ticket price_paid, in event currency
    refundId: string;
    chargeId: string;
  }
) {
  const { eventId, refundedAmountDollars, refundId, chargeId } = opts;
  if (refundedAmountDollars <= 0) return;

  // Find the settlement and the associated payouts row so we can read the
  // original transfer's currency. The payouts row is our source of truth
  // for what currency the transfer was sent in (same as the event
  // currency, but resilient to later schema changes).
  const { data: settlement } = await supabase
    .from("settlements")
    .select("id, status, collective_id, metadata")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!settlement || settlement.status !== "paid_out") {
    // Either no settlement yet (refund pre-settlement — deducted from
    // gross math) or still draft/approved (refund deducted from gross
    // before transfer). Nothing to reverse.
    return;
  }

  const settlementMeta = (settlement.metadata ?? {}) as Record<string, unknown>;
  const transferId =
    typeof settlementMeta.stripe_transfer_id === "string"
      ? settlementMeta.stripe_transfer_id
      : null;

  if (!transferId) {
    console.warn(
      `[stripe-webhook] Settlement ${settlement.id} is paid_out but has no stripe_transfer_id in metadata — can't auto-reverse refund ${refundId}. Manual reconciliation needed.`
    );
    return;
  }

  // Read the original payout row for its currency. The payout's currency
  // is what the transfer was denominated in.
  const { data: originalPayout } = await supabase
    .from("payouts")
    .select("currency")
    .eq("stripe_transfer_id", transferId)
    .maybeSingle();

  const transferCurrency = (originalPayout?.currency || "usd").toLowerCase();

  // Convert dollar amount to Stripe's smallest-unit integer for the
  // transfer's currency (cents for 2-decimal, whole unit for zero-decimal).
  const desiredReversalStripe = isZeroDecimal(transferCurrency)
    ? Math.round(refundedAmountDollars)
    : Math.round(refundedAmountDollars * 100);

  if (desiredReversalStripe <= 0) return;

  // Clamp to the transfer's remaining reversible amount. Stripe rejects
  // reversals that exceed transfer.amount - transfer.amount_reversed
  // (already-reversed amounts can't be reversed again). This matters when
  // multiple refunds stack on one transfer, or a refund's value exceeds
  // what was transferred (e.g. chargeback on top of refund). Retrieve the
  // current transfer state and cap accordingly.
  let reversalAmountStripe: number;
  try {
    const currentTransfer = await getStripe().transfers.retrieve(transferId);
    const remaining =
      (currentTransfer.amount ?? 0) - (currentTransfer.amount_reversed ?? 0);
    if (remaining <= 0) {
      console.warn(
        `[stripe-webhook] Transfer ${transferId} already fully reversed (amount=${currentTransfer.amount}, reversed=${currentTransfer.amount_reversed}). Skipping reversal for refund ${refundId}.`
      );
      return;
    }
    reversalAmountStripe = Math.min(desiredReversalStripe, remaining);
    if (reversalAmountStripe < desiredReversalStripe) {
      console.warn(
        `[stripe-webhook] Reversal clamped from ${desiredReversalStripe} to ${reversalAmountStripe} (transfer ${transferId} has only ${remaining} left). Residual ${desiredReversalStripe - reversalAmountStripe} needs manual reconciliation.`
      );
    }
  } catch (retrieveErr) {
    console.error(
      `[stripe-webhook] Failed to retrieve transfer ${transferId} for clamping:`,
      retrieveErr
    );
    // Proceed with the uncapped amount — Stripe will reject if over the
    // limit, which we catch below.
    reversalAmountStripe = desiredReversalStripe;
  }

  // Stripe reversal — idempotency key (transfer + refund) de-dups webhook
  // retries.
  try {
    const reversal = await getStripe().transfers.createReversal(
      transferId,
      {
        amount: reversalAmountStripe,
        metadata: {
          refund_charge_id: chargeId,
          event_id: eventId,
          settlement_id: settlement.id,
          reason: "ticket_refund",
        },
        description: `Ticket refund reversal (charge ${chargeId})`,
      },
      {
        idempotencyKey: `reversal_${transferId}_${refundId}`,
      }
    );

    // Negative-amount payouts row for audit trail. Amount reflects the
    // ACTUAL reversed value (post-clamping), not the requested one, so
    // the sum of payouts rows nets to what the collective actually kept.
    const actualReversedDollars = isZeroDecimal(transferCurrency)
      ? reversalAmountStripe
      : reversalAmountStripe / 100;
    await supabase.from("payouts").insert({
      collective_id: settlement.collective_id,
      settlement_id: settlement.id,
      // kind='reversal' keeps this row outside the
      // payouts_one_active_per_settlement unique index (which scopes to
      // kind='payout'), so it can coexist with the original payout row.
      kind: "reversal",
      amount: -actualReversedDollars,
      currency: transferCurrency,
      status: "completed",
      stripe_transfer_id: reversal.id,
      initiated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      metadata: {
        source_transfer_id: transferId,
        refund_charge_id: chargeId,
        reason: "ticket_refund",
        requested_amount_dollars: refundedAmountDollars,
        clamped: actualReversedDollars < refundedAmountDollars,
      },
    });

    console.info(
      `[stripe-webhook] Auto-reversed ${actualReversedDollars.toFixed(2)} ${transferCurrency.toUpperCase()} from transfer ${transferId} for refund on charge ${chargeId} (reversal ${reversal.id})`
    );
  } catch (err) {
    // Common cause: connected account's Stripe balance is below the
    // reversal amount because they already paid out to their bank. Stripe
    // allows balance to go negative — subsequent payouts absorb the debt.
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(
      `[stripe-webhook] Transfer reversal failed for transfer ${transferId}, refund ${refundId}: ${msg}`
    );
  }
}

export async function POST(request: NextRequest) {
  // TODO(audit): add replay-window check on event timestamp (reject events older than 5min) as defense-in-depth alongside signature verification
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
    // register. Alert via Sentry so the misconfig surfaces instead of
    // silently dropping Connect events (or platform events).
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
  // have been signed with the Connect secret. If they verified with the
  // platform secret, either (a) Shawn set up the platform endpoint to
  // receive Connect events too (valid but unusual), or (b) the Connect
  // endpoint has the wrong URL. Log a warning to catch misconfig early.
  if (event.account && matchedSecretKey === "platform") {
    console.warn(
      `[stripe-webhook] Connect-scoped event ${event.type} (${event.id}) verified via PLATFORM secret. If you intended to separate endpoints, check your Stripe Dashboard webhook config.`
    );
  }

  // Dedup via webhook_events table — INSERT-first, rely on unique PK.
  // Handles Stripe retries + our own at-least-once processing so a replayed
  // event doesn't re-fulfill tickets, re-decrement promo counters, or
  // re-notify the waitlist. The table is service-role-only; no RLS exposure.
  // Code 23505 = unique_violation. Any other error we log and continue
  // (dedup is defense in depth — body-level idempotency still protects).
  try {
    const { error: dedupErr } = await createAdminClient()
      .from("webhook_events")
      .insert({ id: event.id, source: "stripe" });
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
          event.data.object as Stripe.Checkout.Session
        );
        if (result?.backgroundWork) {
          after(result.backgroundWork);
        }
        break;
      }
      case "payment_intent.succeeded": {
        const result = await handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent
        );
        if (result?.backgroundWork) {
          after(result.backgroundWork);
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const failureReason =
          pi.last_payment_error?.message ?? "unknown";
        console.warn(
          `[stripe-webhook] Payment failed for PI ${pi.id}: ${failureReason}`
        );
        // Delete pending tickets to release reserved capacity (Gap 9 + 25)
        const supabase = createAdminClient();
        const { data: failedTickets, error: failErr } = await supabase
          .from("tickets")
          .delete()
          .eq("stripe_payment_intent_id", pi.id)
          .eq("status", "pending")
          .select("id");
        if (failErr) {
          console.error("[stripe-webhook] Failed to delete pending tickets:", failErr);
        } else if (failedTickets && failedTickets.length > 0) {
          console.info(
            `[stripe-webhook] Deleted ${failedTickets.length} pending ticket(s) to release capacity for PI ${pi.id}`
          );
        }

        // Release promo code claim (Gap 22): promo uses were claimed atomically
        // before payment, so we must decrement on failure to free the slot.
        const piPromoId = pi.metadata?.promoId;
        const piPromoQuantity = parseInt(pi.metadata?.promoClaimedQuantity || "0", 10);
        // TODO: make atomic with DB function (e.g. decrement_promo_uses RPC)
        // Current pattern has a race condition: read-then-write can cause
        // incorrect values under concurrent webhook processing.
        if (piPromoId && piPromoQuantity > 0) {
          const { data: currentPromo } = await supabase
            .from("promo_codes")
            .select("current_uses")
            .eq("id", piPromoId)
            .maybeSingle();

          if (currentPromo) {
            const newUses = Math.max((currentPromo.current_uses ?? 0) - piPromoQuantity, 0);
            await supabase
              .from("promo_codes")
              .update({ current_uses: newUses })
              .eq("id", piPromoId);

            // Defensive check: re-read and verify current_uses >= 0
            const { data: verifyPromo } = await supabase
              .from("promo_codes")
              .select("current_uses")
              .eq("id", piPromoId)
              .maybeSingle();
            if (verifyPromo && (verifyPromo.current_uses ?? 0) < 0) {
              console.warn(`[stripe-webhook] Promo ${piPromoId} went negative (${verifyPromo.current_uses}), resetting to 0`);
              await supabase
                .from("promo_codes")
                .update({ current_uses: 0 })
                .eq("id", piPromoId);
            }

            console.info(
              `[stripe-webhook] Released ${piPromoQuantity} promo claim(s) for code ${piPromoId} (PI ${pi.id})`
            );
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
        if (refundPiId) {
          const isFullRefund = charge.refunded === true; // Stripe sets this only on FULL refund
          console.info(`[stripe-webhook] Charge ${isFullRefund ? "fully" : "partially"} refunded for PI ${refundPiId}`);
          const supabase = createAdminClient();
          if (isFullRefund) {
            // Full refund — mark all tickets, release their promo slots, and
            // promote the next entry on each event's waitlist. This handler
            // runs for Stripe-dashboard-initiated refunds (where our
            // `refundTicket` server action never fires), so all the side
            // effects that action would trigger have to happen here too —
            // otherwise promo codes lock at `max_uses` forever and waitlisted
            // fans never get the "we saved you a ticket" email.
            const { data: refundedTickets, error: refundErr } = await supabase
              .from("tickets")
              .update({ status: "refunded" })
              .eq("stripe_payment_intent_id", refundPiId)
              .in("status", ["paid", "checked_in"])
              .select("id, event_id, ticket_tier_id, promo_code_id");
            if (refundErr) {
              console.error("[stripe-webhook] Failed to update tickets to refunded:", refundErr);
            } else if (refundedTickets && refundedTickets.length > 0) {
              console.info(`[stripe-webhook] Marked ${refundedTickets.length} ticket(s) as refunded for PI ${refundPiId}`);

              // Auto-reversal: if the settlement for these tickets' event has
              // already been paid out, pull the refunded amount back from the
              // connected account's Stripe balance. We need the actual USD
              // price_paid on each refunded ticket — re-query so we can bucket
              // by event (a PI's tickets are always same event, but we're
              // defensive) and sum accurately.
              const { data: refundedWithPrices } = await supabase
                .from("tickets")
                .select("event_id, price_paid")
                .eq("stripe_payment_intent_id", refundPiId)
                .eq("status", "refunded");

              // Sum refunded ticket `price_paid` per event. price_paid is
              // in the ticket's charge currency (event currency) — same
              // currency the transfer was in, so no conversion needed.
              const byEventDollars = new Map<string, number>();
              for (const t of refundedWithPrices ?? []) {
                if (!t.event_id) continue;
                const dollars = Number(t.price_paid) || 0;
                byEventDollars.set(
                  t.event_id,
                  (byEventDollars.get(t.event_id) ?? 0) + dollars
                );
              }
              for (const [eventId, refundedAmountDollars] of byEventDollars.entries()) {
                await reverseTransferForRefund(supabase, {
                  eventId,
                  refundedAmountDollars,
                  refundId: charge.id,
                  chargeId: charge.id,
                });
              }

              // Count how many tickets were released per promo_code_id, then
              // decrement. Grouping avoids N round-trips for a PI with many
              // tickets sharing one promo. Also bucket by (event_id, tier_id)
              // so we can call notifyNextOnWaitlist once per tier slot freed.
              const byPromo = new Map<string, number>();
              const byEventTier = new Map<string, { eventId: string; tierId: string; count: number }>();
              for (const t of refundedTickets) {
                if (t.promo_code_id) byPromo.set(t.promo_code_id, (byPromo.get(t.promo_code_id) ?? 0) + 1);
                if (t.event_id && t.ticket_tier_id) {
                  const key = `${t.event_id}::${t.ticket_tier_id}`;
                  const existing = byEventTier.get(key);
                  if (existing) existing.count += 1;
                  else byEventTier.set(key, { eventId: t.event_id, tierId: t.ticket_tier_id, count: 1 });
                }
              }
              for (const [promoId, count] of byPromo.entries()) {
                const { data: promoRow } = await supabase
                  .from("promo_codes")
                  .select("current_uses")
                  .eq("id", promoId)
                  .maybeSingle();
                if (promoRow) {
                  await supabase
                    .from("promo_codes")
                    .update({ current_uses: Math.max((promoRow.current_uses ?? 0) - count, 0) })
                    .eq("id", promoId);
                }
              }

              // Promote waitlist per tier — best-effort, don't block webhook ack.
              const { notifyNextOnWaitlist } = await import("@/app/actions/ticket-waitlist");
              for (const { eventId, tierId, count } of byEventTier.values()) {
                try {
                  await notifyNextOnWaitlist(eventId, tierId, count);
                } catch (err) {
                  console.error("[stripe-webhook] waitlist notify failed (non-fatal):", err);
                }
              }
            }
          } else {
            // Partial refund — only flip ticket status when the refund amount
            // matches an EXACT subset of ticket prices (newest-first scan).
            //
            // The previous greedy implementation had a fraud vector:
            // - PI with tickets [$30, $20], partial refund $25
            //   → old code skipped $30 (doesn't fit in $25), refunded the $20
            //   → Stripe sent the buyer $25, but ticket ledger says one $20
            //   ticket refunded. Buyer keeps a "paid" QR for the $30 and $5 is
            //   in limbo. Door staff + P&L both misbehave.
            // - PI with tickets [$20, $20], partial refund $15 → zero matched
            //   but buyer got $15 anyway.
            //
            // Correct behavior: leave status untouched when the amount doesn't
            // cleanly map to a ticket subset. Operator reconciles manually via
            // the refunds page. Stripe dashboard remains the source of truth
            // for the money movement; ticket status shouldn't lie.
            const refundAmount = charge.amount_refunded ?? 0;
            const { data: allTickets } = await supabase
              .from("tickets")
              .select("id, price_paid")
              .eq("stripe_payment_intent_id", refundPiId)
              .in("status", ["paid", "checked_in"])
              .order("created_at", { ascending: false });
            if (allTickets && allTickets.length > 0) {
              // Newest-first running sum — exit on exact hit or overshoot.
              let running = 0;
              const candidate: string[] = [];
              for (const t of allTickets) {
                const ticketCents = Math.round(Number(t.price_paid ?? 0) * 100);
                if (ticketCents === 0) continue;
                running += ticketCents;
                candidate.push(t.id);
                if (running >= refundAmount) break;
              }
              if (running === refundAmount && candidate.length > 0) {
                const { error: partialErr } = await supabase
                  .from("tickets")
                  .update({ status: "refunded" })
                  .in("id", candidate);
                if (partialErr) {
                  console.error("[stripe-webhook] Partial refund update failed:", partialErr);
                } else {
                  console.info(`[stripe-webhook] Partially refunded ${candidate.length}/${allTickets.length} ticket(s) for PI ${refundPiId}`);

                  // Auto-reversal for the partial subset. We know the exact
                  // candidate ticket ids, so pull their prices + events and
                  // sum per event. refundAmount above is the buyer's refund
                  // in the charge currency; `running` is the USD-cent sum
                  // we just matched — use `running` for reversal so we
                  // reverse the USD-equivalent that was transferred.
                  const { data: partialWithMeta } = await supabase
                    .from("tickets")
                    .select("event_id, price_paid")
                    .in("id", candidate);
                  const partialByEvent = new Map<string, number>();
                  for (const t of partialWithMeta ?? []) {
                    if (!t.event_id) continue;
                    const dollars = Number(t.price_paid) || 0;
                    partialByEvent.set(
                      t.event_id,
                      (partialByEvent.get(t.event_id) ?? 0) + dollars
                    );
                  }
                  for (const [eventId, refundedAmountDollars] of partialByEvent.entries()) {
                    await reverseTransferForRefund(supabase, {
                      eventId,
                      refundedAmountDollars,
                      refundId: charge.id,
                      chargeId: charge.id,
                    });
                  }
                }
              } else {
                // No clean subset sum to the refund amount. Don't guess.
                // Log loudly so an admin can reconcile.
                console.warn(
                  `[stripe-webhook] Partial refund ${refundAmount}¢ for PI ${refundPiId} does not match any exact ticket-subset sum (${allTickets.length} tickets, tried newest-first). Leaving ticket status untouched — manual reconciliation needed.`,
                );
              }
            }
          }
        } else {
          console.warn("[stripe-webhook] charge.refunded event has no payment_intent ID, skipping");
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
          // Clean up pending tickets (same as payment_intent.payment_failed)
          const supabase = createAdminClient();
          const { data: failedTickets } = await supabase
            .from("tickets")
            .delete()
            .eq("stripe_payment_intent_id", failedPiId)
            .eq("status", "pending")
            .select("id");
          if (failedTickets && failedTickets.length > 0) {
            console.info(`[stripe-webhook] Deleted ${failedTickets.length} pending ticket(s) for charge failure on PI ${failedPiId}`);
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
          // Use "cancelled" status (no "disputed" enum value) but store dispute info in metadata
          // Fetch existing tickets to preserve their metadata (avoid overwrite)
          const { data: ticketsToDispute } = await supabase
            .from("tickets")
            .select("id, metadata")
            .eq("stripe_payment_intent_id", disputePiId)
            .in("status", ["paid", "checked_in"]);

          const disputedTicketIds: string[] = [];
          let disputeErr: { message: string } | null = null;
          if (ticketsToDispute && ticketsToDispute.length > 0) {
            for (const ticket of ticketsToDispute) {
              const existingMetadata = (ticket.metadata && typeof ticket.metadata === "object") ? ticket.metadata as Record<string, unknown> : {};
              const { error: updateErr } = await supabase
                .from("tickets")
                .update({
                  status: "cancelled",
                  metadata: { ...existingMetadata, disputed: true, dispute_reason: disputeReason, dispute_id: dispute.id },
                })
                .eq("id", ticket.id);
              if (updateErr) {
                disputeErr = updateErr;
                console.error(`[stripe-webhook] Failed to update ticket ${ticket.id} for dispute:`, updateErr);
              } else {
                disputedTicketIds.push(ticket.id);
              }
            }
          }
          const disputedTickets = disputedTicketIds.map(id => ({ id }));
          if (disputeErr) {
            console.error("[stripe-webhook] Failed to update tickets for dispute:", disputeErr);
          } else if (disputedTickets && disputedTickets.length > 0) {
            console.info(
              `[stripe-webhook] Marked ${disputedTickets.length} ticket(s) as cancelled (dispute) for PI ${disputePiId}`
            );
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
          // Restore cancelled tickets that were marked from a dispute (have disputed=true in metadata)
          // Fetch existing tickets to preserve their metadata (avoid overwrite)
          const { data: ticketsToRestore } = await supabase
            .from("tickets")
            .select("id, metadata")
            .eq("stripe_payment_intent_id", closedPiId)
            .eq("status", "cancelled")
            .filter("metadata->>disputed", "eq", "true");

          const restoredTicketIds: string[] = [];
          let restoreErr: { message: string } | null = null;
          if (ticketsToRestore && ticketsToRestore.length > 0) {
            for (const ticket of ticketsToRestore) {
              const existingMetadata = (ticket.metadata && typeof ticket.metadata === "object") ? ticket.metadata as Record<string, unknown> : {};
              const { error: updateErr } = await supabase
                .from("tickets")
                .update({
                  status: "paid",
                  metadata: { ...existingMetadata, disputed: false, dispute_resolved: true },
                })
                .eq("id", ticket.id);
              if (updateErr) {
                restoreErr = updateErr;
                console.error(`[stripe-webhook] Failed to restore ticket ${ticket.id}:`, updateErr);
              } else {
                restoredTicketIds.push(ticket.id);
              }
            }
          }
          const restoredTickets = restoredTicketIds.map(id => ({ id }));
          if (restoreErr) {
            console.error("[stripe-webhook] Failed to restore disputed tickets:", restoreErr);
          } else if (restoredTickets && restoredTickets.length > 0) {
            console.info(`[stripe-webhook] Restored ${restoredTickets.length} ticket(s) from dispute for PI ${closedPiId}`);
          }
        } else if (closedPiId) {
          console.info(`[stripe-webhook] Dispute closed (${closedDispute.status}) for PI ${closedPiId}`);
        }
        break;
      }
      // ──────────────── Connect events ────────────────
      // These arrive from the Connect webhook endpoint. The event envelope
      // includes `account: "acct_..."` identifying the connected account;
      // we look up our collective by that id to correlate.
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        console.info(
          `[stripe-webhook] account.updated: ${account.id} charges=${account.charges_enabled} payouts=${account.payouts_enabled} details_submitted=${account.details_submitted}`
        );
        if (!account.id) break;

        const supabase = createAdminClient();

        // Read previous denormalized status so we can detect TRANSITIONS
        // (payouts_enabled flipping from true → false) rather than just
        // the current state. Without this, we'd email the operator on
        // every webhook firing (Stripe sends many for account changes).
        const { data: prevCollective } = await supabase
          .from("collectives")
          .select("id, name, stripe_payouts_enabled, stripe_charges_enabled")
          .eq("stripe_account_id", account.id)
          .is("deleted_at", null)
          .maybeSingle();

        if (!prevCollective) {
          // No collective bound to this account. Happens if the account
          // was deauthorized; ignore.
          break;
        }

        const newChargesEnabled = account.charges_enabled ?? false;
        const newPayoutsEnabled = account.payouts_enabled ?? false;
        const newDetailsSubmitted = account.details_submitted ?? false;
        const requirements = account.requirements?.currently_due ?? [];
        const disabledReason = account.requirements?.disabled_reason ?? null;

        // Update denormalized columns. List views + the PayoutsCard can
        // read from the DB instead of hitting Stripe on every mount.
        const { error: updErr } = await supabase
          .from("collectives")
          .update({
            stripe_charges_enabled: newChargesEnabled,
            stripe_payouts_enabled: newPayoutsEnabled,
            stripe_details_submitted: newDetailsSubmitted,
            stripe_requirements_currently_due: requirements,
            stripe_disabled_reason: disabledReason,
            stripe_status_updated_at: new Date().toISOString(),
          })
          .eq("id", prevCollective.id);
        if (updErr) {
          console.error(
            "[stripe-webhook] Failed to denormalize account status:",
            updErr.message
          );
        }

        // Alert on the specific TRANSITION from enabled → disabled.
        const payoutsJustDisabled =
          prevCollective.stripe_payouts_enabled === true &&
          newPayoutsEnabled === false;

        if (payoutsJustDisabled) {
          const { data: admins } = await supabase
            .from("collective_members")
            .select("user_id, users(email, full_name)")
            .eq("collective_id", prevCollective.id)
            .in("role", ["owner", "admin"])
            .is("deleted_at", null);

          const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/dashboard/settings`;
          const reasonText = (disabledReason ?? "requirements not met").replace(/_/g, " ");
          const missingList = requirements.slice(0, 10);

          try {
            const { sendEmail } = await import("@/lib/email/send");
            for (const admin of admins ?? []) {
              const userRow = admin.users as unknown as {
                email: string | null;
                full_name: string | null;
              } | null;
              if (!userRow?.email) continue;
              await sendEmail({
                to: userRow.email,
                subject: `Stripe has paused payouts for ${prevCollective.name}`,
                html: `
                  <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#09090B;color:#FAFAFA">
                    <h1 style="font-size:20px;margin:0 0 16px">Stripe has paused your payouts</h1>
                    <p style="color:#B4B4B8;line-height:1.5">Hi${userRow.full_name ? " " + userRow.full_name.split(" ")[0] : ""},</p>
                    <p style="color:#B4B4B8;line-height:1.5">Stripe has temporarily disabled payouts for <strong>${prevCollective.name}</strong>. Reason: <em>${reasonText}</em>.</p>
                    ${missingList.length > 0 ? `<p style="color:#B4B4B8;line-height:1.5">To restore payouts, Stripe needs:</p><ul style="color:#B4B4B8;line-height:1.5">${missingList.map(r => `<li>${r.replace(/_/g, " ")}</li>`).join("")}</ul>` : ""}
                    <p style="margin:24px 0"><a href="${dashboardUrl}" style="background:#7B2FF7;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open Settings</a></p>
                    <p style="color:#7A7A80;font-size:12px">— Nocturn</p>
                  </div>
                `,
              });
            }
          } catch (emailErr) {
            console.error(
              "[stripe-webhook] Failed to send payouts-disabled email:",
              emailErr
            );
          }
        }
        break;
      }
      case "account.application.deauthorized": {
        // Fires if the operator revokes Nocturn's access (rare for
        // Express, where Nocturn owns the account, but can happen via
        // Stripe support). The deauthorized-account id comes on the
        // event envelope's `account` field, NOT on data.object (which is
        // the Application). Clear stripe_account_id so future Pay Out
        // attempts fail loudly with "set up Stripe Connect" instead of
        // sending transfers to a dead account.
        const deauthorizedAccountId = event.account;
        if (deauthorizedAccountId) {
          const supabase = createAdminClient();
          const { error: unlinkErr } = await supabase
            .from("collectives")
            .update({ stripe_account_id: null })
            .eq("stripe_account_id", deauthorizedAccountId);
          if (unlinkErr) {
            console.error(
              `[stripe-webhook] Failed to unlink deauthorized account ${deauthorizedAccountId}:`,
              unlinkErr.message
            );
          } else {
            console.warn(
              `[stripe-webhook] Cleared stripe_account_id for deauthorized account ${deauthorizedAccountId}`
            );
          }
        }
        break;
      }
      case "transfer.created": {
        const transfer = event.data.object as Stripe.Transfer;
        const supabase = createAdminClient();
        const { error: tUpdErr } = await supabase
          .from("payouts")
          .update({
            status: "processing",
            stripe_transfer_id: transfer.id,
            initiated_at: new Date(transfer.created * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_transfer_id", transfer.id);
        if (tUpdErr) {
          // Likely because markSettlementPaid already set status=processing
          // AND stripe_transfer_id before this event landed (race) — try by
          // metadata.settlement_id as a fallback.
          const settlementId = transfer.metadata?.settlement_id;
          if (settlementId) {
            await supabase
              .from("payouts")
              .update({
                status: "processing",
                stripe_transfer_id: transfer.id,
                initiated_at: new Date(transfer.created * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("settlement_id", settlementId)
              .is("stripe_transfer_id", null);
          }
        }
        console.info(
          `[stripe-webhook] transfer.created ${transfer.id} -> ${transfer.destination}`
        );
        break;
      }
      case "transfer.reversed": {
        // Distinguish PARTIAL (typically our own auto-reversal for a
        // refund) from FULL reversal. A partial reversal should NOT regress
        // the settlement to "approved" — that would cause the operator to
        // re-click Pay Out and double-pay. Only a full reversal (the whole
        // transfer was pulled back) indicates the payout failed and needs
        // retry.
        //
        // Stripe emits this event on the original Transfer object with an
        // updated `amount_reversed`. Partial → amount_reversed < amount.
        // Full → amount_reversed === amount.
        const transfer = event.data.object as Stripe.Transfer;
        const isFullReversal =
          (transfer.amount_reversed ?? 0) >= (transfer.amount ?? 0);
        const supabase = createAdminClient();

        if (!isFullReversal) {
          // Partial — the auto-reversal flow already inserted a negative
          // payouts row separately. Nothing to do here.
          console.info(
            `[stripe-webhook] Transfer ${transfer.id} partially reversed ${transfer.amount_reversed}/${transfer.amount} — no settlement regression`
          );
          break;
        }

        // Full reversal. Mark the original payout row as failed and bump
        // the settlement back to approved so the operator can retry. This
        // path fires when Shawn (or a Stripe admin) manually reverses the
        // whole transfer — not from our auto-reversal code.
        await supabase
          .from("payouts")
          .update({
            status: "failed",
            failed_at: new Date().toISOString(),
            failure_reason: "Transfer fully reversed",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_transfer_id", transfer.id)
          .in("status", ["pending", "processing", "completed"]);

        const { data: payoutRow } = await supabase
          .from("payouts")
          .select("settlement_id")
          .eq("stripe_transfer_id", transfer.id)
          .maybeSingle();
        if (payoutRow?.settlement_id) {
          await supabase
            .from("settlements")
            .update({
              status: "approved",
              updated_at: new Date().toISOString(),
            })
            .eq("id", payoutRow.settlement_id)
            .eq("status", "paid_out");
        }
        console.warn(
          `[stripe-webhook] Transfer ${transfer.id} FULLY reversed — settlement regressed to approved`
        );
        break;
      }
      case "payout.paid": {
        // Connect `payout.*` events are scoped to the connected account
        // (fire when funds hit the operator's bank). A single Stripe
        // payout can bundle multiple transfers, so we list the payout's
        // balance_transactions (scoped to the connected account) and
        // match each `type: "transfer"` entry back to one of OUR
        // payouts rows by stripe_transfer_id. This is precise — a payout
        // that only includes 2 of a collective's 3 processing transfers
        // will only flip those 2 to completed, not all 3.
        const payout = event.data.object as Stripe.Payout;
        const accountId = event.account;
        if (!accountId) {
          console.warn(
            `[stripe-webhook] payout.paid event without account id, skipping`
          );
          break;
        }
        const supabase = createAdminClient();
        const { data: collective } = await supabase
          .from("collectives")
          .select("id")
          .eq("stripe_account_id", accountId)
          .maybeSingle();
        if (!collective) {
          console.warn(
            `[stripe-webhook] payout.paid — no collective for account ${accountId}`
          );
          break;
        }

        const completedAtIso = new Date(
          payout.arrival_date * 1000
        ).toISOString();

        // List balance transactions that composed this payout. Scoped to
        // the connected account via stripeAccount option. Each transaction
        // of type "transfer" represents an incoming transfer from the
        // platform — its `source` is the transfer id (matches our
        // payouts.stripe_transfer_id).
        try {
          const stripe = getStripe();
          const transferIdsInPayout: string[] = [];

          // Paginate defensively — most payouts have a handful of
          // transactions but Stripe returns up to 100 per page.
          let hasMore = true;
          let startingAfter: string | undefined = undefined;
          while (hasMore) {
            const txPage: Stripe.ApiList<Stripe.BalanceTransaction> =
              await stripe.balanceTransactions.list(
                {
                  payout: payout.id,
                  limit: 100,
                  starting_after: startingAfter,
                },
                { stripeAccount: accountId }
              );
            for (const tx of txPage.data) {
              if (tx.type === "transfer" && typeof tx.source === "string") {
                transferIdsInPayout.push(tx.source);
              }
            }
            hasMore = txPage.has_more;
            startingAfter = txPage.data.length
              ? txPage.data[txPage.data.length - 1].id
              : undefined;
            if (!startingAfter) break;
          }

          if (transferIdsInPayout.length === 0) {
            console.info(
              `[stripe-webhook] payout.paid ${payout.id} contained no transfer-typed balance transactions — nothing to reconcile`
            );
            break;
          }

          const { data: updatedRows, error: updErr } = await supabase
            .from("payouts")
            .update({
              status: "completed",
              stripe_payout_id: payout.id,
              completed_at: completedAtIso,
              updated_at: new Date().toISOString(),
            })
            .in("stripe_transfer_id", transferIdsInPayout)
            .eq("collective_id", collective.id)
            .eq("status", "processing")
            .select("id");

          if (updErr) {
            console.error(
              `[stripe-webhook] payout.paid update failed:`,
              updErr.message
            );
          } else {
            console.info(
              `[stripe-webhook] payout.paid ${payout.id} for collective ${collective.id}: reconciled ${updatedRows?.length ?? 0}/${transferIdsInPayout.length} transfers`
            );
          }
        } catch (listErr) {
          // If balanceTransactions.list fails (rate limit, transient),
          // fall back to the imprecise mass-update so the operator still
          // sees payouts flip to completed rather than getting stuck in
          // "processing" forever. Log so we notice.
          console.error(
            `[stripe-webhook] Failed to list balance_transactions for payout ${payout.id}, falling back to mass-update:`,
            listErr
          );
          await supabase
            .from("payouts")
            .update({
              status: "completed",
              stripe_payout_id: payout.id,
              completed_at: completedAtIso,
              updated_at: new Date().toISOString(),
            })
            .eq("collective_id", collective.id)
            .eq("status", "processing");
        }
        break;
      }
      case "payout.failed": {
        const payout = event.data.object as Stripe.Payout;
        const accountId = event.account;
        if (!accountId) break;
        const supabase = createAdminClient();
        const { data: collective } = await supabase
          .from("collectives")
          .select("id")
          .eq("stripe_account_id", accountId)
          .maybeSingle();
        if (!collective) break;
        await supabase
          .from("payouts")
          .update({
            status: "failed",
            stripe_payout_id: payout.id,
            failed_at: new Date().toISOString(),
            failure_reason:
              payout.failure_message ?? payout.failure_code ?? "Payout failed",
            updated_at: new Date().toISOString(),
          })
          .eq("collective_id", collective.id)
          .eq("status", "processing");
        console.warn(
          `[stripe-webhook] payout.failed ${payout.id} for collective ${collective.id}: ${payout.failure_message ?? payout.failure_code}`
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
      /\b(53[0-9]{3}|57[A-Z0-9]{3}|08[0-9]{3})\b/.test(errMsg) || // Postgres connection/resource error codes (53xxx, 57xxx, 08xxx)
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

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
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

  // Ticket currency = what the buyer was charged in = the event currency.
  // Checkout stores this in metadata.chargeCurrency. Legacy tickets created
  // before this change default to USD.
  const ticketCurrency = (
    (metadata.chargeCurrency || session.currency || "usd") as string
  ).toLowerCase();

  const supabase = createAdminClient();

  // IDEMPOTENCY CHECK: Prevent duplicate ticket creation on webhook retry
  // Check for already-fulfilled (paid) tickets — not pending ones which we'll update
  let existingPaidCount = 0;
  if (paymentIntentId) {
    const { count } = await supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("stripe_payment_intent_id", paymentIntentId)
      .in("status", ["paid", "checked_in"]);
    existingPaidCount = count ?? 0;
  }
  if (existingPaidCount === 0) {
    const { count } = await supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .filter("metadata->>checkout_session_id", "eq", session.id)
      .in("status", ["paid", "checked_in"]);
    existingPaidCount = count ?? 0;
  }

  if (existingPaidCount && existingPaidCount > 0) {
    console.info(
      `[stripe-webhook] Idempotency: paid tickets already exist for session ${session.id}` +
      (paymentIntentId ? ` / PI ${paymentIntentId}` : "") +
      `, skipping duplicate creation`
    );
    return;
  }

  // Log payment_succeeded now that we know this is a new fulfillment
  void logPaymentEvent({
    event_type: "payment_succeeded",
    payment_intent_id: paymentIntentId,
    event_id: eventId,
    tier_id: tierId,
    quantity,
    amount_cents: session.amount_total ?? null,
    currency: session.currency ?? "usd",
    buyer_email: session.customer_email ?? session.customer_details?.email ?? null,
    metadata: { checkout_session_id: session.id, flow: "checkout_session" },
  });

  // Look up the tier to get the price
  const { data: tier, error: tierError } = await supabase
    .from("ticket_tiers")
    .select("price")
    .eq("id", tierId)
    .maybeSingle();

  if (tierError || !tier) {
    console.error("[stripe-webhook] CRITICAL: Ticket tier not found, tierId:", tierId, "for session:", session.id, "error:", tierError);
    void logPaymentEvent({
      event_type: "fulfillment_failed",
      payment_intent_id: paymentIntentId,
      event_id: eventId,
      tier_id: tierId,
      quantity,
      amount_cents: session.amount_total ?? null,
      currency: session.currency ?? "usd",
      buyer_email: session.customer_email ?? session.customer_details?.email ?? null,
      error_message: `Tier not found: ${tierId}`,
      metadata: { checkout_session_id: session.id },
    });
    return; // Don't throw — Stripe won't retry, and we've logged for investigation
  }

  // Calculate actual price paid, accounting for discounts
  // The checkout route stores ticketPriceCents (discounted unit price in cents) and
  // discountCents (per-ticket discount in cents) in session metadata
  let pricePaid: number;
  if (metadata.ticketPriceCents) {
    // Use the exact discounted price from checkout (convert cents to dollars)
    pricePaid = parseFloat((Number(metadata.ticketPriceCents) / 100).toFixed(2));
  } else if (metadata.discountCents) {
    // Fallback: subtract discount from tier price
    pricePaid = parseFloat(Math.max(Number(tier.price) - Number(metadata.discountCents) / 100, 0).toFixed(2));
  } else {
    // No discount — full price
    pricePaid = Number(tier.price);
  }

  // NOTE: Capacity was already reserved at checkout creation (checkout/route.ts or
  // create-payment-intent/route.ts). We skip re-reserving here to prevent double-decrement.
  // The idempotency check above already prevents duplicate ticket creation on retries.

  // Build ticket records — referrerToken is a user UUID (from ?ref= link)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let referrerToken = metadata.referrerToken && uuidRegex.test(metadata.referrerToken) ? metadata.referrerToken : null;
  // Validate referrer user actually exists (prevents FK constraint violation)
  if (referrerToken) {
    const { data: referrerUser } = await supabase.from("users").select("id").eq("id", referrerToken).maybeSingle();
    if (!referrerUser) referrerToken = null;
  }
  const buyerPhone = metadata.buyerPhone || null;
  const tickets = Array.from({ length: quantity }, () => ({
    event_id: eventId,
    ticket_tier_id: tierId,
    user_id: null, // Guest purchase — no user linked
    status: "paid" as const,
    price_paid: pricePaid,
    currency: ticketCurrency,
    stripe_payment_intent_id: paymentIntentId,
    ticket_token: randomUUID(),
    referred_by: referrerToken,
    metadata: {
      checkout_session_id: session.id,
      customer_email: session.customer_email ?? session.customer_details?.email,
      ...(buyerPhone && { customer_phone: buyerPhone }),
      ...(referrerToken && { referrer_token: referrerToken }),
      ...(session.metadata?.promoId && { promo_id: session.metadata.promoId, promo_code: session.metadata.promoCode }),
      ...(session.metadata?.discountCents && { discount_cents: session.metadata.discountCents }),
    },
  }));

  // Try to update pending tickets (created at checkout) to "paid" first.
  // If pending tickets exist from checkout creation, update them instead of inserting new ones.
  let insertedTickets: { id: string; ticket_token: string }[] | null = null;
  const uuidValidate = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let pendingTicketIds: string[] = [];
  if (metadata.pendingTicketIds) {
    try {
      const parsed = JSON.parse(metadata.pendingTicketIds);
      if (Array.isArray(parsed)) {
        pendingTicketIds = parsed.filter((id: unknown) => typeof id === "string" && uuidValidate.test(id));
      }
    } catch (parseErr) {
      console.error("[stripe-webhook] Failed to parse pendingTicketIds for session", session.id, ":", parseErr);
      // Non-retryable — data corruption, not transient. Continue without pending ticket IDs.
    }
  }

  if (pendingTicketIds.length > 0) {
    const { data: updatedTickets, error: updateError } = await supabase
      .from("tickets")
      .update({
        status: "paid",
        price_paid: pricePaid,
        currency: ticketCurrency,
        stripe_payment_intent_id: paymentIntentId,
        metadata: {
          checkout_session_id: session.id,
          customer_email: session.customer_email ?? session.customer_details?.email,
          ...(buyerPhone && { customer_phone: buyerPhone }),
          ...(referrerToken && { referrer_token: referrerToken }),
          ...(session.metadata?.promoId && { promo_id: session.metadata.promoId, promo_code: session.metadata.promoCode }),
          ...(session.metadata?.discountCents && { discount_cents: session.metadata.discountCents }),
        },
      })
      .in("id", pendingTicketIds)
      .eq("status", "pending")
      .select("id, ticket_token");

    if (!updateError && updatedTickets && updatedTickets.length > 0) {
      insertedTickets = updatedTickets;
      console.info(
        `[stripe-webhook] Updated ${updatedTickets.length} pending ticket(s) to paid for session ${session.id}`
      );
    } else {
      if (updateError) console.warn("[stripe-webhook] Failed to update pending tickets, falling back to insert:", updateError);
    }
  }

  // Fallback: insert new tickets if no pending tickets were updated
  if (!insertedTickets || insertedTickets.length === 0) {
    // Use atomic RPC with advisory lock to prevent race with client fulfillment
    try {
      const { data: atomicResult, error: atomicError } = await supabase.rpc("fulfill_tickets_atomic", {
        p_payment_intent_id: paymentIntentId ?? `session_${session.id}`,
        p_event_id: eventId,
        p_tier_id: tierId,
        p_quantity: quantity,
        p_price_paid: pricePaid,
        p_currency: ticketCurrency,
        p_buyer_email: session.customer_email ?? session.customer_details?.email ?? undefined,
        p_referrer_token: referrerToken ?? undefined,
        p_metadata: {
          checkout_session_id: session.id,
          customer_email: session.customer_email ?? session.customer_details?.email,
          ...(buyerPhone && { customer_phone: buyerPhone }),
          ...(referrerToken && { referrer_token: referrerToken }),
          ...(session.metadata?.promoId && { promo_id: session.metadata.promoId, promo_code: session.metadata.promoCode }),
          ...(session.metadata?.discountCents && { discount_cents: session.metadata.discountCents }),
        },
      });
      if (atomicError) throw atomicError;
      insertedTickets = atomicResult as unknown as { id: string; ticket_token: string }[];
      console.info(`[stripe-webhook] Atomic fulfillment: ${insertedTickets?.length ?? 0} ticket(s) for session ${session.id}`);
    } catch (atomicErr) {
      // Fallback: plain insert (pre-migration compatibility)
      console.warn("[stripe-webhook] Atomic RPC failed, falling back to plain insert:", atomicErr);
      const { data: newTickets, error: insertError } = await supabase
        .from("tickets")
        .insert(tickets)
        .select("id, ticket_token");

      if (insertError) {
        if (insertError.code === "23505") {
          console.info(`[stripe-webhook] Tickets already exist for session ${session.id} (unique constraint), skipping`);
          if (paymentIntentId) {
            const { data: existing } = await supabase
              .from("tickets")
              .select("id, ticket_token")
              .eq("event_id", eventId)
              .eq("stripe_payment_intent_id", paymentIntentId);
            insertedTickets = existing;
          }
        } else {
          console.error("[stripe-webhook] Failed to insert tickets:", insertError);
          throw insertError;
        }
      } else {
        insertedTickets = newTickets;
        console.info(`[stripe-webhook] Created ${quantity} ticket(s) for event ${eventId}, session ${session.id}`);
      }
    }
  }

  // Contact upsert — best-effort fan sync
  try {
    const contactEmail = (session.customer_email ?? session.customer_details?.email ?? "").toLowerCase().trim();
    if (contactEmail) {
      const { data: eventForContact } = await supabase
        .from("events")
        .select("collective_id")
        .eq("id", eventId)
        .is("deleted_at", null)
        .maybeSingle();
      if (eventForContact?.collective_id) {
        const fullNameValue = (metadata.customerName || metadata.buyerName || session.customer_details?.name) ?? null;
        const { error: insertContactErr } = await supabase.from("contacts").insert({
          collective_id: eventForContact.collective_id,
          contact_type: "fan",
          email: contactEmail,
          phone: buyerPhone,
          full_name: fullNameValue,
          source: "ticket",
          total_events: 1,
          total_spend: pricePaid * quantity,
          last_seen_at: new Date().toISOString(),
        });
        if (insertContactErr?.code === "23505") {
          // Existing contact — increment stats via raw SQL to avoid overwriting
          const { error: rpcErr } = await supabase.rpc("execute_sql" as never, {
            query: `UPDATE contacts SET total_events = COALESCE(total_events, 0) + 1, total_spend = COALESCE(total_spend, 0) + $1, last_seen_at = NOW(), updated_at = NOW() WHERE collective_id = $2 AND email = $3`,
            params: [pricePaid * quantity, eventForContact.collective_id, contactEmail],
          } as never);
          if (rpcErr) {
            // Fallback: simple update without increment
            await supabase.from("contacts")
              .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq("collective_id", eventForContact.collective_id)
              .eq("email", contactEmail);
          }
          // Backfill phone if missing — never clobber existing value
          if (buyerPhone) {
            await supabase.from("contacts")
              .update({ phone: buyerPhone })
              .eq("collective_id", eventForContact.collective_id)
              .eq("email", contactEmail)
              .is("phone", null);
          }
        }

      }
    }
  } catch (contactErr) {
    console.error("[stripe-webhook] Contact upsert failed (non-blocking):", contactErr);
  }

  // Promo code uses are now claimed atomically BEFORE payment (Gap 22 fix).
  // No need to claim here — the checkout/create-payment-intent routes handle it.
  // If payment fails, the payment_intent.payment_failed webhook decrements the counter.

  void logPaymentEvent({
    event_type: "tickets_fulfilled",
    payment_intent_id: paymentIntentId,
    event_id: eventId,
    tier_id: tierId,
    quantity,
    amount_cents: session.amount_total ?? null,
    currency: session.currency ?? "usd",
    buyer_email: session.customer_email ?? session.customer_details?.email ?? null,
    metadata: { checkout_session_id: session.id, flow: "checkout_session" },
  });

  // Return background work to run AFTER the response is sent to Stripe.
  // QR generation + email sending can take 10-30s and would cause Stripe timeouts.
  return {
    backgroundWork: async () => {
      // Track ticket purchase
      try {
        const { trackServerEvent } = await import("@/lib/track-server");
        await trackServerEvent("ticket_purchased", {
          eventId,
          quantity,
          revenue: pricePaid * quantity,
          sessionId: session.id,
        });
      } catch { /* non-critical */ }

      // Analytics tracking (contact row is written inline above in the contacts insert/RPC)
      try {
        const { trackTicketSold } = await import("@/lib/analytics");
        trackTicketSold(eventId, quantity, pricePaid * quantity);
      } catch { /* non-critical */ }

      // Dedup: skip if email was already sent by the client action
      if (insertedTickets && insertedTickets.length > 0) {
        const { data: emailCheck } = await supabase
          .from("tickets")
          .select("metadata")
          .eq("id", insertedTickets[0].id)
          .maybeSingle();
        if (emailCheck?.metadata && typeof emailCheck.metadata === "object" &&
            (emailCheck.metadata as Record<string, unknown>).confirmation_email_sent === true) {
          console.info("[stripe-webhook] Email already sent by client action, skipping");
          return; // Exit background work early
        }
      }

      // Generate QR codes for each ticket FIRST, then include in email
      const qrCodes: string[] = [];
      if (insertedTickets && insertedTickets.length > 0) {
        const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

        const qrResults = await Promise.allSettled(
          insertedTickets.map(async (ticket) => {
            const checkInUrl = `${BASE_URL}/check-in/${ticket.ticket_token}`;
            const qrDataUrl = await QRCode.toDataURL(checkInUrl, {
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
          `[stripe-webhook] Generated ${qrCodes.length}/${insertedTickets.length} QR codes`
        );
      }

      // Send branded confirmation email with QR codes
      try {
        const customerEmail = session.customer_email ?? session.customer_details?.email;
        if (!customerEmail) {
          console.warn(
            `[stripe-webhook] No buyer email available for session ${session.id}, skipping confirmation email`
          );
        }
        if (customerEmail) {
          const { data: event } = await supabase
            .from("events")
            .select("title, starts_at, venues(name)")
            .eq("id", eventId)
            .is("deleted_at", null)
            .maybeSingle();

          const { data: tierInfo } = await supabase
            .from("ticket_tiers")
            .select("name")
            .eq("id", tierId)
            .maybeSingle();

          if (event) {
            const venue = event.venues as unknown as { name: string } | null;
            const { sendTicketConfirmation } = await import("@/lib/email/actions");
            await sendTicketConfirmation({
              to: customerEmail,
              eventTitle: event.title || "Event",
              eventDate: new Date(event.starts_at).toLocaleDateString("en", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              }),
              venueName: venue?.name || "TBA",
              tierName: tierInfo?.name || "General Admission",
              quantity,
              totalPrice: `$${(pricePaid * quantity).toFixed(2)}`,
              ticketLink: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/ticket/${insertedTickets?.[0]?.ticket_token || ""}`,
              qrCodes: qrCodes.length > 0 ? qrCodes : undefined,
              ticketTokens: insertedTickets?.map((t) => t.ticket_token) || [],
            });
            console.info("[stripe-webhook] Confirmation email sent with QR codes");

            // Post-purchase hooks: referral nudge + milestone check
            try {
              const { runPostPurchaseHooks } = await import("@/app/actions/post-purchase-hooks");
              await runPostPurchaseHooks({
                eventId,
                buyerEmail: customerEmail!,
                ticketToken: insertedTickets?.[0]?.ticket_token || "",
              });
            } catch { /* non-critical */ }
          }
        }
      } catch (emailErr) {
        console.error("[stripe-webhook] Email send failed (non-blocking):", emailErr);
      }
    },
  };
}

// Handle embedded checkout (PaymentIntent) — same ticket creation logic
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const metadata = paymentIntent.metadata;

  if (!metadata?.eventId || !metadata?.tierId || !metadata?.quantity) {
    // Not a ticket purchase PaymentIntent (could be from Checkout Session which is handled above)
    return;
  }

  // If this PaymentIntent originated from a Checkout Session, skip entirely.
  // The checkout.session.completed handler already created tickets and stored
  // checkout_session_id in ticket metadata. Processing here would be a duplicate.
  const checkoutSessionId = metadata.checkoutSessionId ?? null;
  if (checkoutSessionId) {
    console.info(
      `[stripe-webhook] PI ${paymentIntent.id} originated from checkout session ${checkoutSessionId}, skipping (handled by checkout.session.completed)`
    );
    return;
  }

  // The idempotency check below (lines ~651-665) will catch any duplicate tickets
  // created by the checkout.session.completed handler, so no additional Stripe API
  // call is needed here. The previous latest_charge retrieval was fragile and redundant.

  const eventId = metadata.eventId;
  const tierId = metadata.tierId;
  const quantity = parseInt(metadata.quantity, 10);
  if (isNaN(quantity) || quantity < 1) {
    console.error("[stripe-webhook] Invalid quantity in PI metadata:", metadata.quantity);
    return;
  }

  // SECURITY: Verify payment amount matches expected amount from metadata
  // Prevents fulfillment on amount mismatches (currency glitches, replay attacks)
  const expectedCents = parseInt(metadata.totalAmountCents || metadata.baseAmountCents || "0", 10);
  if (expectedCents > 0 && paymentIntent.amount !== expectedCents) {
    console.error(
      `[stripe-webhook] AMOUNT MISMATCH: PI ${paymentIntent.id} charged ${paymentIntent.amount} cents but expected ${expectedCents} cents`
    );
    void logPaymentEvent({
      event_type: "fulfillment_failed",
      payment_intent_id: paymentIntent.id,
      event_id: eventId,
      tier_id: tierId,
      quantity,
      amount_cents: paymentIntent.amount,
      currency: paymentIntent.currency,
      buyer_email: metadata.buyerEmail ?? null,
      metadata: { error: `Amount mismatch: got ${paymentIntent.amount}, expected ${expectedCents}` },
    });
    return;
  }

  const buyerEmail = metadata.buyerEmail || paymentIntent.receipt_email;
  const buyerPhone = metadata.buyerPhone || null;
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

  const supabase = createAdminClient();

  // IDEMPOTENCY CHECK: Prevent duplicate ticket creation.
  // Only check for paid/checked_in tickets — pending ones will be updated to paid.
  const { count: existingPaidCount } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .in("status", ["paid", "checked_in"]);

  if (existingPaidCount && existingPaidCount > 0) {
    console.info(
      `[stripe-webhook] Idempotency: paid tickets already exist for PI ${paymentIntent.id}, skipping duplicate creation`
    );
    return;
  }

  // Log payment_succeeded now that we know this is a new fulfillment
  void logPaymentEvent({
    event_type: "payment_succeeded",
    payment_intent_id: paymentIntent.id,
    event_id: eventId,
    tier_id: tierId,
    quantity,
    amount_cents: paymentIntent.amount,
    currency: paymentIntent.currency,
    buyer_email: buyerEmail ?? null,
    metadata: { flow: "payment_intent" },
  });

  const { data: tier } = await supabase
    .from("ticket_tiers")
    .select("price")
    .eq("id", tierId)
    .maybeSingle();

  if (!tier) {
    console.error("[stripe-webhook] CRITICAL: Ticket tier not found, tierId:", tierId, "for PI:", paymentIntent.id);
    void logPaymentEvent({
      event_type: "fulfillment_failed",
      payment_intent_id: paymentIntent.id,
      event_id: eventId,
      tier_id: tierId,
      quantity,
      amount_cents: paymentIntent.amount,
      currency: paymentIntent.currency,
      buyer_email: buyerEmail ?? null,
      error_message: `Tier not found: ${tierId}`,
      metadata: { flow: "payment_intent" },
    });
    return; // Don't throw — Stripe won't retry, and we've logged for investigation
  }

  // Calculate actual price paid, accounting for discounts
  let pricePaid: number;
  if (metadata.ticketPriceCents) {
    pricePaid = parseFloat((Number(metadata.ticketPriceCents) / 100).toFixed(2));
  } else if (metadata.discountCents) {
    pricePaid = parseFloat(Math.max(Number(tier.price) - Number(metadata.discountCents) / 100, 0).toFixed(2));
  } else {
    pricePaid = Number(tier.price);
  }

  // NOTE: Capacity was already reserved at checkout creation (create-payment-intent/route.ts).
  // We skip re-reserving here to prevent double-decrement.
  // The idempotency check above already prevents duplicate ticket creation on retries.

  const uuidRegex2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let referrerToken = metadata.referrerToken && uuidRegex2.test(metadata.referrerToken) ? metadata.referrerToken : null;
  if (referrerToken) {
    const { data: referrerUser } = await supabase.from("users").select("id").eq("id", referrerToken).maybeSingle();
    if (!referrerUser) referrerToken = null;
  }
  // Ticket currency = the PaymentIntent's charge currency = the event
  // currency. Legacy tickets created before the multi-currency pivot
  // stored baseCurrency (always USD); fall back for those.
  const ticketCurrency = (
    metadata.chargeCurrency ||
    metadata.baseCurrency ||
    paymentIntent.currency ||
    "usd"
  ).toLowerCase();

  const ticketMetadata = {
    payment_intent_id: paymentIntent.id,
    customer_email: buyerEmail,
    ...(buyerPhone && { customer_phone: buyerPhone }),
    fulfilled_by: "webhook",
    ...(metadata.chargeCurrency && metadata.chargeCurrency !== "usd" && {
      charge_currency: metadata.chargeCurrency,
      fx_rate: metadata.fxRate,
      buyer_country: metadata.buyerCountry,
    }),
    ...(referrerToken && { referrer_token: referrerToken }),
  };

  // Try to update pending tickets (created at checkout) to "paid" first.
  let insertedTickets: { id: string; ticket_token: string }[] | null = null;
  let wasNewlyCreated = true;
  let pendingTicketIds: string[] = [];
  if (metadata.pendingTicketIds) {
    try {
      const parsed = JSON.parse(metadata.pendingTicketIds);
      if (Array.isArray(parsed)) {
        pendingTicketIds = parsed.filter((id: unknown) => typeof id === "string" && uuidRegex2.test(id));
      }
    } catch (parseErr) {
      console.error("[stripe-webhook] Failed to parse pendingTicketIds for PI", paymentIntent.id, ":", parseErr);
      // Non-retryable — data corruption, not transient. Continue without pending ticket IDs.
    }
  }

  if (pendingTicketIds.length > 0) {
    const { data: updatedTickets, error: updateError } = await supabase
      .from("tickets")
      .update({
        status: "paid",
        price_paid: pricePaid,
        currency: ticketCurrency,
        stripe_payment_intent_id: paymentIntent.id,
        referred_by: referrerToken,
        metadata: ticketMetadata,
      })
      .in("id", pendingTicketIds)
      .eq("status", "pending")
      .select("id, ticket_token");

    if (!updateError && updatedTickets && updatedTickets.length > 0) {
      insertedTickets = updatedTickets;
      console.info(
        `[stripe-webhook] Updated ${updatedTickets.length} pending ticket(s) to paid for PI ${paymentIntent.id}`
      );
    } else {
      if (updateError) console.warn("[stripe-webhook] Failed to update pending tickets for PI, falling back:", updateError);
    }
  }

  // Fallback: Use atomic fulfillment RPC or plain insert if no pending tickets were updated.
  if (!insertedTickets || insertedTickets.length === 0) {
    try {
      const { data: atomicResult, error: atomicError } = await supabase.rpc("fulfill_tickets_atomic", {
        p_payment_intent_id: paymentIntent.id,
        p_event_id: eventId,
        p_tier_id: tierId,
        p_quantity: quantity,
        p_price_paid: pricePaid,
        p_currency: ticketCurrency,
        p_buyer_email: buyerEmail ?? undefined,
        p_referrer_token: referrerToken ?? undefined,
        p_metadata: ticketMetadata,
      });

      if (atomicError) throw atomicError;
      insertedTickets = atomicResult as unknown as { id: string; ticket_token: string }[];

      if (insertedTickets && insertedTickets.length > 0) {
        wasNewlyCreated = true; // We passed the idempotency check above, so these are new
      }
    } catch {
      // Fallback: plain insert (for pre-migration compatibility)
      const tickets = Array.from({ length: quantity }, () => ({
        event_id: eventId,
        ticket_tier_id: tierId,
        user_id: null,
        status: "paid" as const,
        price_paid: pricePaid,
        currency: ticketCurrency,
        stripe_payment_intent_id: paymentIntent.id,
        ticket_token: randomUUID(),
        referred_by: referrerToken,
        metadata: ticketMetadata,
      }));

      const { data, error: insertError } = await supabase
        .from("tickets")
        .insert(tickets)
        .select("id, ticket_token");

      if (insertError) {
        // If unique constraint violation, tickets already exist (created by client action)
        if (insertError.code === "23505") {
          console.info(`[stripe-webhook] Tickets already exist for PI ${paymentIntent.id} (unique constraint), skipping`);
          wasNewlyCreated = false;
          const { data: existing } = await supabase
            .from("tickets")
            .select("id, ticket_token")
            .eq("stripe_payment_intent_id", paymentIntent.id);
          insertedTickets = existing;
        } else {
          console.error("[stripe-webhook] Failed to insert tickets:", insertError);
          throw insertError;
        }
      } else {
        insertedTickets = data;
      }
    }
  }

  console.info(`[stripe-webhook] ${wasNewlyCreated ? "Created" : "Found existing"} ${quantity} ticket(s) for PI ${paymentIntent.id}`);

  // Contact upsert — best-effort fan sync
  if (wasNewlyCreated) {
    try {
      const contactEmail = (buyerEmail ?? "").toLowerCase().trim();
      if (contactEmail) {
        const { data: eventForContact } = await supabase
          .from("events")
          .select("collective_id")
          .eq("id", eventId)
          .is("deleted_at", null)
          .maybeSingle();
        if (eventForContact?.collective_id) {
          const fullNameValue = (metadata.buyerName || metadata.customerName) ?? null;
          const { error: insertContactErr } = await supabase.from("contacts").insert({
            collective_id: eventForContact.collective_id,
            contact_type: "fan",
            email: contactEmail,
            phone: buyerPhone,
            full_name: fullNameValue,
            source: "ticket",
            total_events: 1,
            total_spend: pricePaid * quantity,
            last_seen_at: new Date().toISOString(),
          });
          if (insertContactErr?.code === "23505") {
            // Existing contact — increment stats via raw SQL to avoid overwriting
            const { error: rpcErr2 } = await supabase.rpc("execute_sql" as never, {
              query: `UPDATE contacts SET total_events = COALESCE(total_events, 0) + 1, total_spend = COALESCE(total_spend, 0) + $1, last_seen_at = NOW(), updated_at = NOW() WHERE collective_id = $2 AND email = $3`,
              params: [pricePaid * quantity, eventForContact.collective_id, contactEmail],
            } as never);
            if (rpcErr2) {
              // Fallback: simple update without increment
              await supabase.from("contacts")
                .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq("collective_id", eventForContact.collective_id)
                .eq("email", contactEmail);
            }
            // Backfill phone if missing — never clobber existing
            if (buyerPhone) {
              await supabase.from("contacts")
                .update({ phone: buyerPhone })
                .eq("collective_id", eventForContact.collective_id)
                .eq("email", contactEmail)
                .is("phone", null);
            }
          }

        }
      }
    } catch (contactErr) {
      console.error("[stripe-webhook] Contact upsert failed (non-blocking):", contactErr);
    }
  }

  // Only log fulfillment and claim promo if tickets were NEWLY created.
  // If they pre-existed (client action beat the webhook), skip to avoid double-counting.
  if (wasNewlyCreated) {
    void logPaymentEvent({
      event_type: "tickets_fulfilled",
      payment_intent_id: paymentIntent.id,
      event_id: eventId,
      tier_id: tierId,
      quantity,
      amount_cents: paymentIntent.amount,
      currency: paymentIntent.currency,
      buyer_email: buyerEmail ?? null,
      metadata: { flow: "payment_intent" },
    });

    // Promo code uses are now claimed atomically BEFORE payment (Gap 22 fix).
    // No need to claim here — the create-payment-intent route handles it.
    // If payment fails, the payment_intent.payment_failed webhook decrements the counter.
    if (false && metadata.promoId) {
      // Kept for reference — this block is intentionally disabled (Gap 22)
    }
  } else {
    console.info(`[stripe-webhook] Tickets pre-existed for PI ${paymentIntent.id}, skipping promo/analytics`);
  }

  // Return background work to run AFTER the response is sent to Stripe
  return {
    backgroundWork: async () => {
      // Analytics tracking — only if tickets were newly created
      // (Contact row is written inline above in the contacts insert/RPC path.)
      if (wasNewlyCreated) {
        try {
          const { trackTicketSold } = await import("@/lib/analytics");
          trackTicketSold(eventId, quantity, pricePaid * quantity);
        } catch (err) {
          console.error("[stripe-webhook] Analytics tracking failed (non-blocking):", err);
        }
      }

      // Dedup: skip if email was already sent by the client action
      if (insertedTickets && insertedTickets.length > 0) {
        const { data: emailCheck } = await supabase
          .from("tickets")
          .select("metadata")
          .eq("id", insertedTickets[0].id)
          .maybeSingle();
        if (emailCheck?.metadata && typeof emailCheck.metadata === "object" &&
            (emailCheck.metadata as Record<string, unknown>).confirmation_email_sent === true) {
          console.info("[stripe-webhook] Email already sent by client action, skipping");
          return; // Exit background work early
        }
      }

      // Generate QR codes FIRST, then include in email
      const piQrCodes: string[] = [];
      if (insertedTickets && insertedTickets.length > 0) {
        const qrResults = await Promise.allSettled(
          insertedTickets.map(async (ticket) => {
            const qrDataUrl = await QRCode.toDataURL(
              `${BASE_URL}/check-in/${ticket.ticket_token}`,
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
      }

      // Send confirmation email with QR codes
      try {
        if (buyerEmail) {
          const { data: event } = await supabase
            .from("events")
            .select("title, starts_at, venues(name)")
            .eq("id", eventId)
            .is("deleted_at", null)
            .maybeSingle();

          const { data: tierInfo } = await supabase
            .from("ticket_tiers")
            .select("name")
            .eq("id", tierId)
            .maybeSingle();

          if (event) {
            const venue = event.venues as unknown as { name: string } | null;
            const { sendTicketConfirmation } = await import("@/lib/email/actions");
            await sendTicketConfirmation({
              to: buyerEmail,
              eventTitle: event.title || "Event",
              eventDate: new Date(event.starts_at).toLocaleDateString("en", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              }),
              venueName: venue?.name || "TBA",
              tierName: tierInfo?.name || "General Admission",
              quantity,
              totalPrice: `$${(pricePaid * quantity).toFixed(2)}`,
              ticketLink: `${BASE_URL}/ticket/${insertedTickets?.[0]?.ticket_token || ""}`,
              qrCodes: piQrCodes.length > 0 ? piQrCodes : undefined,
              ticketTokens: insertedTickets?.map((t) => t.ticket_token) || [],
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
              ticketToken: insertedTickets?.[0]?.ticket_token || "",
            });
          } catch { /* non-critical */ }
        }
      } catch (emailErr) {
        console.error("[stripe-webhook] Email failed (non-blocking):", emailErr);
      }
    },
  };
}
