"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Refund a ticket — marks as refunded in DB and issues Stripe refund.
 * Only works for paid tickets with a stripe_payment_intent_id.
 * Free tickets are just cancelled (no Stripe refund needed).
 */
export async function refundTicket(ticketId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const sb = admin();

  // Get ticket with event info for ownership check
  const { data: ticket } = await sb
    .from("tickets")
    .select("id, event_id, status, price_paid, stripe_payment_intent_id, metadata, events(collective_id)")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) return { error: "Ticket not found" };

  // Verify user is admin/promoter of the collective
  const event = ticket.events as unknown as { collective_id: string };
  const { data: membership } = await sb
    .from("collective_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("collective_id", event.collective_id)
    .in("role", ["admin", "promoter"])
    .maybeSingle();

  if (!membership) return { error: "Only admins and promoters can issue refunds" };

  // Can only refund paid or checked_in tickets
  if (!["paid", "checked_in"].includes(ticket.status)) {
    return { error: `Cannot refund a ticket with status "${ticket.status}"` };
  }

  const pricePaid = Number(ticket.price_paid) || 0;

  // Issue Stripe refund if there was a payment
  if (ticket.stripe_payment_intent_id && pricePaid > 0) {
    try {
      const stripe = getStripe();
      await stripe.refunds.create({
        payment_intent: ticket.stripe_payment_intent_id,
        // Refund the ticket price portion only (service fee is non-refundable)
        amount: Math.round(pricePaid * 100),
        reason: "requested_by_customer",
      });
    } catch (stripeErr) {
      const msg = stripeErr instanceof Error ? stripeErr.message : "Stripe refund failed";
      console.error("[refund] Stripe error:", msg);
      return { error: `Refund failed: ${msg}` };
    }
  }

  // Update ticket status
  const { error: updateError } = await sb
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
    .eq("id", ticketId);

  if (updateError) {
    return { error: `Ticket status update failed: ${updateError.message}` };
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

      await sendEmail({
        to: buyerEmail,
        subject: `Refund confirmed — ${eventData?.title || "Event"}`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #09090B; color: #FAFAFA;">
            <p style="color: #7B2FF7; font-size: 14px; font-weight: 600;">🌙 nocturn.</p>
            <h2 style="margin: 16px 0 8px;">Your refund has been processed</h2>
            <p style="color: #A1A1AA; line-height: 1.6;">
              Your ticket for <strong style="color: #FAFAFA;">${eventData?.title || "the event"}</strong> has been refunded.
              ${pricePaid > 0 ? `<strong style="color: #FAFAFA;">$${pricePaid.toFixed(2)}</strong> will be returned to your original payment method within 5-10 business days.` : ""}
            </p>
            <p style="color: #71717A; font-size: 12px; margin-top: 24px;">Questions? Contact <a href="mailto:shawn@trynocturn.com" style="color: #7B2FF7;">shawn@trynocturn.com</a></p>
          </div>
        `,
      });
    }
  } catch {
    // Email failure is non-blocking
  }

  return { error: null, refundedAmount: pricePaid };
}

/**
 * Get refundable tickets for an event.
 */
export async function getRefundableTickets(eventId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", tickets: [] };

  const sb = admin();

  const { data: tickets } = await sb
    .from("tickets")
    .select("id, price_paid, status, metadata, created_at, ticket_tiers(name)")
    .eq("event_id", eventId)
    .in("status", ["paid", "checked_in"])
    .order("created_at", { ascending: false });

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
}
