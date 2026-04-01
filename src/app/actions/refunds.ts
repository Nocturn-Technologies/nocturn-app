"use server";
import { revalidatePath } from "next/cache";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";

/**
 * Refund a ticket — marks as refunded in DB and issues Stripe refund.
 * Only works for paid tickets with a stripe_payment_intent_id.
 * Free tickets are just cancelled (no Stripe refund needed).
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

    // Get ticket with event info for ownership check
    const { data: ticket, error: ticketError } = await sb
      .from("tickets")
      .select("id, event_id, ticket_tier_id, status, price_paid, stripe_payment_intent_id, metadata, events(collective_id, metadata)")
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
    const { data: membership } = await sb
      .from("collective_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("collective_id", event.collective_id)
      .in("role", ["admin", "promoter"])
      .is("deleted_at", null)
      .maybeSingle();

    if (!membership) return { error: "Only active admins and promoters can issue refunds" };

    // Can only refund paid or checked_in tickets
    if (!["paid", "checked_in"].includes(ticket.status)) {
      return { error: `Cannot refund a ticket with status "${ticket.status}"` };
    }

    const pricePaid = Number(ticket.price_paid) || 0;

    // SECURITY: Atomically claim the ticket for refund FIRST, then issue Stripe refund.
    // This prevents double-refund race conditions where two concurrent requests
    // both pass the status check and both issue Stripe refunds.
    const { error: updateError, count: updateCount } = await sb
      .from("tickets")
      .update({
        status: "refunded",
        metadata: {
          ...(ticket.metadata as Record<string, unknown>),
          refunded_at: new Date().toISOString(),
          refunded_by: user.id,
          refund_amount: pricePaid,
        },
      })
      .eq("id", ticketId)
      .in("status", ["paid", "checked_in"]);

    if (updateError) {
      return { error: "Failed to update ticket status" };
    }

    if (updateCount === 0) {
      return { error: "Ticket was already refunded or status changed. No action taken." };
    }

    // Issue Stripe refund AFTER atomic status claim (safe from double-refund)
    if (ticket.stripe_payment_intent_id && pricePaid > 0) {
      try {
        const stripe = getStripe();
        await stripe.refunds.create({
          payment_intent: ticket.stripe_payment_intent_id,
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
            metadata: {
              ...(ticket.metadata as Record<string, unknown>),
              refund_failed_at: new Date().toISOString(),
              refund_error: "Stripe refund failed",
            },
          })
          .eq("id", ticketId)
          .eq("status", "refunded");
        return { error: "Refund failed — please try again or contact support" };
      }
    }

    // Notify next person on waitlist (non-blocking)
    try {
      const tierId = ticket.ticket_tier_id;
      if (tierId) {
        const { notifyNextOnWaitlist } = await import("@/app/actions/ticket-waitlist");
        await notifyNextOnWaitlist(ticket.event_id, tierId);
      }
    } catch {
      // Waitlist notification failure is non-blocking
    }

    // Track refund
    try {
      const { trackServerEvent } = await import("@/lib/track-server");
      await trackServerEvent("ticket_refunded", {
        ticketId,
        eventId: ticket.event_id,
        amount: pricePaid,
      });
    } catch {}

    // Analytics tracking
    try {
      const { trackTicketRefunded } = await import("@/lib/analytics");
      trackTicketRefunded(ticket.event_id, 1, pricePaid);
    } catch { /* non-critical */ }

    // Send refund notification email
    try {
      const meta = ticket.metadata as Record<string, unknown>;
      const buyerEmail = (meta?.customer_email as string) || (meta?.buyer_email as string);
      if (buyerEmail) {
        const { sendEmail } = await import("@/lib/email/send");
        const { data: eventData } = await sb
          .from("events")
          .select("title")
          .eq("id", ticket.event_id)
          .maybeSingle();

        function escapeHtml(s: string) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }

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
    } catch {
      // Email failure is non-blocking
    }

    revalidatePath("/dashboard/events"); return { error: null, refundedAmount: pricePaid };
  } catch (err) {
    console.error("[refundTicket]", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Get refundable tickets for an event.
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
      .select("id, price_paid, status, metadata, created_at, ticket_tiers(name)")
      .eq("event_id", eventId)
      .in("status", ["paid", "checked_in"])
      .order("created_at", { ascending: false });

    if (ticketsError) return { error: "Failed to load tickets", tickets: [] };

    return {
      error: null,
      tickets: (tickets ?? []).map((t) => {
        const meta = t.metadata as Record<string, unknown>;
        const tier = t.ticket_tiers as unknown as { name: string } | null;
        return {
          id: t.id,
          email: (meta?.customer_email as string) || (meta?.buyer_email as string) || "Unknown",
          tierName: tier?.name || "General",
          pricePaid: Number(t.price_paid),
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
      .select("id, price_paid, status, metadata, created_at, updated_at, ticket_tiers(name)")
      .eq("event_id", eventId)
      .eq("status", "refunded")
      .order("updated_at", { ascending: false });

    if (ticketsError) return { error: "Failed to load refund history", tickets: [] };

    return {
      error: null,
      tickets: (tickets ?? []).map((t) => {
        const meta = t.metadata as Record<string, unknown>;
        const tier = t.ticket_tiers as unknown as { name: string } | null;
        return {
          id: t.id,
          email: (meta?.customer_email as string) || (meta?.buyer_email as string) || "Unknown",
          tierName: tier?.name || "General",
          amountRefunded: Number(meta?.refund_amount ?? t.price_paid ?? 0),
          refundedAt: (meta?.refunded_at as string) || t.updated_at || t.created_at,
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

    // Get current event metadata
    const { data: event, error: eventError } = await sb
      .from("events")
      .select("metadata, collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) return { error: "Failed to look up event" };
    if (!event) return { error: "Event not found" };

    // Verify admin/promoter
    const { data: membership } = await sb
      .from("collective_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("collective_id", event.collective_id)
      .in("role", ["admin", "promoter"])
      .is("deleted_at", null)
      .maybeSingle();

    if (!membership) return { error: "Only admins and promoters can change refund policy" };

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
