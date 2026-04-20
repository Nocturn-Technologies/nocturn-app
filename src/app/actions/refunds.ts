"use server";
import { revalidatePath } from "next/cache";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";

/**
 * Refund a ticket — marks as refunded in DB and issues Stripe refund.
 * Only works for valid/checked_in tickets linked to an order with a stripe_payment_intent_id.
 * Free tickets are just voided (no Stripe refund needed).
 *
 * New schema: price lives on order_lines.unit_price, Stripe PI on orders.stripe_payment_intent_id.
 * After refunding: inserts a ticket_events record, updates order_lines.refunded_quantity,
 * and updates orders.status to 'refunded' or 'partially_refunded'.
 */
export async function refundTicket(ticketId: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!ticketId?.trim()) return { error: "Ticket ID is required" };

    // Rate limit: 20 refunds per minute per user
    const { success: rlOk } = await rateLimitStrict(`refund:${user.id}`, 20, 60_000);
    if (!rlOk) return { error: "Too many refund requests. Please wait a moment." };

    const sb = createAdminClient();

    // Get ticket with event info and order data for price/PI lookup
    const { data: ticket, error: ticketError } = await sb
      .from("tickets")
      .select(`
        id,
        event_id,
        tier_id,
        status,
        holder_party_id,
        qr_code,
        order_line_id,
        events:event_id (collective_id, metadata),
        order_lines:order_line_id (
          id,
          unit_price,
          quantity,
          refunded_quantity,
          order_id,
          orders:order_id (
            id,
            stripe_payment_intent_id,
            status,
            metadata,
            promo_code_id
          )
        )
      `)
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketError) return { error: "Failed to look up ticket" };
    if (!ticket) return { error: "Ticket not found" };

    // Idempotency check — prevent double refunds
    if (ticket.status === "refunded") {
      return { error: "This ticket has already been refunded." };
    }

    // Check if refunds are enabled for this event
    const event = ticket.events as unknown as { collective_id: string; metadata: Record<string, unknown> | null };
    const eventMeta = event.metadata || {};
    if (eventMeta.refunds_enabled === false) {
      return { error: "Refunds are disabled for this event. The organizer has set a no-refund policy." };
    }

    // Admin-only. Previously admin+promoter, but refunds move real money —
    // a compromised promoter account could drain revenue before an admin
    // notices. Aligns with toggleRefundPolicy's admin-only gate.
    const { data: membership } = await sb
      .from("collective_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("collective_id", event.collective_id)
      .eq("role", "admin")
      .is("deleted_at", null)
      .maybeSingle();

    if (!membership) return { error: "Only active admins can issue refunds" };

    // Can only refund valid or checked_in tickets
    if (!["valid", "checked_in"].includes(ticket.status)) {
      return { error: `Cannot refund a ticket with status "${ticket.status}"` };
    }

    // Resolve price and Stripe PI from the linked order
    const orderLine = ticket.order_lines as unknown as {
      id: string;
      unit_price: number;
      quantity: number;
      refunded_quantity: number;
      order_id: string;
      orders: {
        id: string;
        stripe_payment_intent_id: string | null;
        status: string;
        metadata: Record<string, unknown> | null;
        promo_code_id: string | null;
      } | null;
    } | null;

    const order = orderLine?.orders ?? null;
    const pricePaid = Number(orderLine?.unit_price ?? 0);
    const stripePaymentIntentId = order?.stripe_payment_intent_id ?? null;
    const orderLineId = orderLine?.id ?? null;
    const orderId = order?.id ?? null;
    const promoCodeId = order?.promo_code_id ?? null;

    // SECURITY: Atomically claim the ticket for refund FIRST, then issue Stripe refund.
    // This prevents double-refund race conditions where two concurrent requests
    // both pass the status check and both issue Stripe refunds.
    const { error: updateError, count: updateCount } = await sb
      .from("tickets")
      .update({
        status: "refunded",
      })
      .eq("id", ticketId)
      .in("status", ["valid", "checked_in"]);

    if (updateError) {
      return { error: "Failed to update ticket status" };
    }

    if (updateCount === 0) {
      return { error: "Ticket was already refunded or status changed. No action taken." };
    }

    // Insert ticket_events audit record for the refund
    void sb
      .from("ticket_events")
      .insert({
        ticket_id: ticketId,
        event_type: "refunded",
        party_id: null,
        metadata: {
          refunded_at: new Date().toISOString(),
          refunded_by_user_id: user.id,
          refund_amount: pricePaid,
          stripe_payment_intent_id: stripePaymentIntentId,
        },
      })
      .then(() => {}, (e: unknown) => console.error("[refundTicket] ticket_events insert failed (non-blocking):", e));

    // Update order_lines.refunded_quantity
    if (orderLineId) {
      const currentRefunded = orderLine?.refunded_quantity ?? 0;
      void sb
        .from("order_lines")
        .update({ refunded_quantity: currentRefunded + 1 })
        .eq("id", orderLineId)
        .then(() => {}, (e: unknown) => console.error("[refundTicket] order_lines update failed (non-blocking):", e));
    }

    // Update orders.status based on whether all tickets in all lines are refunded.
    // Re-fetch after the order_lines update above to get current values.
    if (orderId) {
      try {
        const { data: allLines } = await sb
          .from("order_lines")
          .select("quantity, refunded_quantity")
          .eq("order_id", orderId);

        if (allLines) {
          const totalQty = allLines.reduce((sum, ol) => sum + ol.quantity, 0);
          const totalRefunded = allLines.reduce((sum, ol) => sum + (ol.refunded_quantity ?? 0), 0);
          const newOrderStatus: "refunded" | "partially_refunded" =
            totalRefunded >= totalQty ? "refunded" : "partially_refunded";
          await sb
            .from("orders")
            .update({ status: newOrderStatus })
            .eq("id", orderId);
        }
      } catch (orderStatusErr) {
        console.error("[refundTicket] Failed to update order status (non-blocking):", orderStatusErr);
      }
    }

    // Issue Stripe refund AFTER atomic status claim (safe from double-refund)
    if (stripePaymentIntentId && pricePaid > 0) {
      try {
        const stripe = getStripe();
        await stripe.refunds.create({
          payment_intent: stripePaymentIntentId,
          // Refund the ticket price portion only (service fee is non-refundable)
          amount: Math.round(pricePaid * 100),
          reason: "requested_by_customer",
        }, {
          idempotencyKey: `refund_${ticketId}`,
        });
      } catch (stripeErr) {
        // Stripe refund failed AFTER we already marked as refunded — revert status
        console.error("[refundTicket] Stripe error, reverting ticket status:", stripeErr);
        await sb
          .from("tickets")
          .update({
            status: ticket.status, // Revert to original status
          })
          .eq("id", ticketId)
          .eq("status", "refunded");
        return { error: "Refund failed — please try again or contact support" };
      }
    }

    // Release the promo slot (if any).
    // current_uses tracking is handled via DB trigger / RPC in this schema.
    // Log the promo release in order metadata for auditing.
    if (promoCodeId && orderId) {
      const { data: currentOrder } = await sb
        .from("orders")
        .select("metadata")
        .eq("id", orderId)
        .maybeSingle();
      if (currentOrder) {
        await sb
          .from("orders")
          .update({
            metadata: {
              ...((currentOrder.metadata as Record<string, unknown>) ?? {}),
              promo_released_at: new Date().toISOString(),
            },
          })
          .eq("id", orderId)
          .then(() => {}, () => { /* non-blocking */ });
      }
    }

    // Notify next person on waitlist (non-blocking)
    try {
      const tierId = ticket.tier_id;
      if (tierId) {
        const { notifyNextOnWaitlist } = await import("@/app/actions/ticket-waitlist");
        await notifyNextOnWaitlist(ticket.event_id, tierId);
      }
    } catch (waitlistErr) {
      console.error("[refundTicket] Waitlist notification failed:", waitlistErr);
    }

    // Track refund
    try {
      const { trackServerEvent } = await import("@/lib/track-server");
      await trackServerEvent("ticket_refunded", {
        ticketId,
        eventId: ticket.event_id,
        amount: pricePaid,
      });
    } catch (trackErr) {
      console.error("[refundTicket] Tracking failed:", trackErr);
    }

    // Analytics tracking
    try {
      const { trackTicketRefunded } = await import("@/lib/analytics");
      if (ticket.tier_id) trackTicketRefunded(ticket.tier_id, 1);
    } catch (analyticsErr) {
      console.error("[refundTicket] Analytics tracking failed:", analyticsErr);
    }

    // Send refund notification email
    try {
      const orderMeta = order?.metadata ?? {};
      const buyerEmail = (orderMeta?.customer_email as string) || (orderMeta?.buyer_email as string);
      if (buyerEmail) {
        const { sendEmail } = await import("@/lib/email/send");
        const { data: eventData } = await sb
          .from("events")
          .select("title")
          .eq("id", ticket.event_id)
          .maybeSingle();

        const { escapeHtml } = await import("@/lib/html");

        const safeSubjectTitle = (eventData?.title || "Event").replace(/[\r\n\x00-\x1f]/g, "");
        await sendEmail({
          to: buyerEmail,
          subject: `Refund confirmed — ${safeSubjectTitle}`,
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #09090B; color: #FAFAFA;">
              <p style="color: #7B2FF7; font-size: 14px; font-weight: 600;">🌙 nocturn.</p>
              <h2 style="margin: 16px 0 8px;">Your refund has been processed</h2>
              <p style="color: #A1A1AA; line-height: 1.6;">
                Your ticket for <strong style="color: #FAFAFA;">${escapeHtml(eventData?.title || "the event")}</strong> has been refunded.
                ${pricePaid > 0 ? `<strong style="color: #FAFAFA;">$${pricePaid.toFixed(2)}</strong> will be returned to your original payment method within 5-10 business days.` : ""}
              </p>
              <p style="color: #71717A; font-size: 12px; margin-top: 24px;">Questions? Contact <a href="mailto:shawn@trynocturn.com" style="color: #7B2FF7;">shawn@trynocturn.com</a><br/><span style="font-size: 11px;">This is a transactional email about your purchase. No action needed to unsubscribe.</span></p>
            </div>
          `,
        });
      }
    } catch (emailErr) {
      console.error("[refundTicket] Email notification failed:", emailErr);
    }

    revalidatePath("/dashboard/events"); return { error: null, refundedAmount: pricePaid };
  } catch (err) {
    console.error("[refundTicket]", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Get refundable tickets for an event.
 * In the new schema, price lives on order_lines.unit_price.
 * Buyer email lives in orders.metadata.
 */
export async function getRefundableTickets(eventId: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", tickets: [] };

    if (!eventId?.trim()) return { error: "Event ID is required", tickets: [] };

    const sb = createAdminClient();

    // Verify user is a member of the event's collective
    const { data: event, error: eventError } = await sb
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) return { error: "Failed to look up event", tickets: [] };
    if (!event) return { error: "Event not found", tickets: [] };

    const { count } = await sb
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (!count || count === 0) return { error: "You don't have access to this event", tickets: [] };

    const { data: tickets, error: ticketsError } = await sb
      .from("tickets")
      .select(`
        id,
        status,
        created_at,
        tier_id,
        ticket_tiers:tier_id (name),
        order_lines:order_line_id (
          id,
          unit_price,
          orders:order_id (
            id,
            metadata
          )
        )
      `)
      .eq("event_id", eventId)
      .in("status", ["valid", "checked_in"])
      .order("created_at", { ascending: false });

    if (ticketsError) return { error: "Failed to load tickets", tickets: [] };

    return {
      error: null,
      tickets: (tickets ?? []).map((t) => {
        const tier = t.ticket_tiers as unknown as { name: string } | null;
        const orderLine = t.order_lines as unknown as {
          id: string;
          unit_price: number;
          orders: { id: string; metadata: Record<string, unknown> | null } | null;
        } | null;
        const orderMeta = orderLine?.orders?.metadata ?? {};
        return {
          id: t.id,
          email: (orderMeta?.customer_email as string) || (orderMeta?.buyer_email as string) || "Unknown",
          tierName: tier?.name || "General",
          pricePaid: Number(orderLine?.unit_price ?? 0),
          status: t.status,
          purchasedAt: t.created_at,
        };
      }),
    };
  } catch (err) {
    console.error("[getRefundableTickets]", err);
    return { error: "Something went wrong", tickets: [] };
  }
}

/**
 * Get refunded tickets for an event (refund history).
 * Refund details sourced from ticket_events audit log.
 */
export async function getRefundedTickets(eventId: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", tickets: [] };

    if (!eventId?.trim()) return { error: "Event ID is required", tickets: [] };

    const sb = createAdminClient();

    // Verify user is a member of the event's collective
    const { data: event, error: eventError } = await sb
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) return { error: "Failed to look up event", tickets: [] };
    if (!event) return { error: "Event not found", tickets: [] };

    const { count } = await sb
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (!count || count === 0) return { error: "You don't have access to this event", tickets: [] };

    const { data: tickets, error: ticketsError } = await sb
      .from("tickets")
      .select(`
        id,
        status,
        created_at,
        tier_id,
        ticket_tiers:tier_id (name),
        order_lines:order_line_id (
          id,
          unit_price,
          orders:order_id (
            id,
            metadata
          )
        ),
        ticket_events (
          event_type,
          occurred_at,
          metadata
        )
      `)
      .eq("event_id", eventId)
      .eq("status", "refunded")
      .order("created_at", { ascending: false });

    if (ticketsError) return { error: "Failed to load refund history", tickets: [] };

    return {
      error: null,
      tickets: (tickets ?? []).map((t) => {
        const tier = t.ticket_tiers as unknown as { name: string } | null;
        const orderLine = t.order_lines as unknown as {
          id: string;
          unit_price: number;
          orders: { id: string; metadata: Record<string, unknown> | null } | null;
        } | null;
        const orderMeta = orderLine?.orders?.metadata ?? {};

        // Find the refund event for timing and amount
        const ticketEvents = (t.ticket_events as unknown as Array<{
          event_type: string;
          occurred_at: string;
          metadata: Record<string, unknown> | null;
        }>) ?? [];
        const refundEvent = ticketEvents.find((te) => te.event_type === "refunded");
        const refundMeta = refundEvent?.metadata ?? {};

        return {
          id: t.id,
          email: (orderMeta?.customer_email as string) || (orderMeta?.buyer_email as string) || "Unknown",
          tierName: tier?.name || "General",
          amountRefunded: Number((refundMeta?.refund_amount as number | null) ?? orderLine?.unit_price ?? 0),
          refundedAt: refundEvent?.occurred_at || t.created_at,
        };
      }),
    };
  } catch (err) {
    console.error("[getRefundedTickets]", err);
    return { error: "Something went wrong", tickets: [] };
  }
}

/**
 * Toggle refund policy for an event (on/off).
 * Stored in events.metadata.refunds_enabled
 */
export async function toggleRefundPolicy(eventId: string, enabled: boolean) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!eventId?.trim()) return { error: "Event ID is required" };

    const sb = createAdminClient();

    // Get current event metadata + status. Status check prevents
    // operators from flipping refund policy on an already-completed /
    // archived event — those rows feed settlement calculations, and
    // retroactive policy changes silently shift P&L on closed books.
    const { data: event, error: eventError } = await sb
      .from("events")
      .select("metadata, collective_id, status")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) return { error: "Failed to look up event" };
    if (!event) return { error: "Event not found" };

    if (event.status !== "draft" && event.status !== "published") {
      return { error: "Refund policy can only be changed while the event is draft or published." };
    }

    // Verify admin only — promoters can issue individual refunds (admin/promoter
    // role on refundTicket) but policy-level changes are a finance owner
    // decision, not a promoter one.
    const { data: membership } = await sb
      .from("collective_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("collective_id", event.collective_id)
      .eq("role", "admin")
      .is("deleted_at", null)
      .maybeSingle();

    if (!membership) return { error: "Only admins can change refund policy" };

    const currentMeta = (event.metadata as Record<string, unknown>) || {};
    const { error } = await sb
      .from("events")
      .update({
        metadata: { ...currentMeta, refunds_enabled: enabled },
      })
      .eq("id", eventId);

    if (error) return { error: "Failed to update refund policy" };
    return { error: null, enabled };
  } catch (err) {
    console.error("[toggleRefundPolicy]", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Get refund policy status for an event.
 */
export async function getRefundPolicy(eventId: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { enabled: true };

    if (!eventId?.trim()) return { enabled: true };

    const sb = createAdminClient();

    const { data: event } = await sb
      .from("events")
      .select("metadata, collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (!event) return { enabled: true }; // Default to enabled

    // Verify user is a member of this collective
    const { count } = await sb
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (!count || count === 0) return { enabled: true };

    const meta = (event.metadata as Record<string, unknown>) || {};
    return { enabled: meta.refunds_enabled !== false }; // Default true unless explicitly disabled
  } catch (err) {
    console.error("[getRefundPolicy]", err);
    return { enabled: true };
  }
}
