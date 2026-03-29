"use server";

import QRCode from "qrcode";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

/**
 * Generate a QR code data URL for a ticket and persist it.
 * The QR encodes the check-in URL: {APP_URL}/check-in/{ticket_token}
 */
export async function generateTicketQRCode(ticketToken: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", qrCode: null };

  const admin = createAdminClient();

  // Verify the ticket exists
  const { data: ticket, error: fetchError } = await admin
    .from("tickets")
    .select("id, qr_code, user_id, event_id")
    .eq("ticket_token", ticketToken)
    .maybeSingle();

  if (fetchError || !ticket) {
    return { error: "Ticket not found", qrCode: null };
  }

  // Verify caller owns the ticket or is a collective member (check-in staff)
  if (ticket.user_id !== user.id) {
    const { data: event } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", ticket.event_id)
      .maybeSingle();
    const { count } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event?.collective_id ?? "")
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!count) return { error: "Not authorized", qrCode: null };
  }

  // If QR code already exists, return it
  if (ticket.qr_code) {
    return { error: null, qrCode: ticket.qr_code };
  }

  const checkInUrl = `${BASE_URL}/check-in/${ticketToken}`;

  // Generate QR code as data URL (PNG)
  const qrDataUrl = await QRCode.toDataURL(checkInUrl, {
    width: 400,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
    errorCorrectionLevel: "H",
  });

  // Persist the QR code to the ticket record
  const { error: updateError } = await admin
    .from("tickets")
    .update({ qr_code: qrDataUrl })
    .eq("id", ticket.id);

  if (updateError) {
    console.error("[tickets] Failed to save QR code:", updateError);
    return { error: "Failed to save QR code", qrCode: null };
  }

  return { error: null, qrCode: qrDataUrl };
}

/**
 * Bulk-generate QR codes for an array of ticket tokens.
 * Used by the Stripe webhook after ticket creation.
 */
export async function generateQRCodesForTokens(tokens: string[]) {
  const results = await Promise.allSettled(
    tokens.map((token) => generateTicketQRCode(token))
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(
      `[tickets] ${failures.length}/${tokens.length} QR code generations failed`
    );
  }

  return results;
}

/**
 * Fetch a ticket with its event and tier details by token.
 */
export async function getTicketByToken(ticketToken: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", ticket: null };

  const admin = createAdminClient();

  const { data: ticket, error } = await admin
    .from("tickets")
    .select(
      `
      id,
      ticket_token,
      user_id,
      status,
      price_paid,
      currency,
      qr_code,
      checked_in_at,
      metadata,
      created_at,
      events:event_id (
        id,
        title,
        slug,
        starts_at,
        ends_at,
        doors_at,
        venues:venue_id (
          name,
          address,
          city
        )
      ),
      ticket_tiers:ticket_tier_id (
        name,
        price
      )
    `
    )
    .eq("ticket_token", ticketToken)
    .maybeSingle();

  if (error || !ticket) {
    return { error: "Ticket not found", ticket: null };
  }

  // Verify the caller owns this ticket
  if (ticket.user_id && ticket.user_id !== user.id) {
    return { error: "Not authorized to view this ticket", ticket: null };
  }

  return { error: null, ticket };
}

/**
 * Look up tickets by Stripe checkout session ID.
 */
export async function getTicketsBySessionId(sessionOrPaymentId: string) {
  // This is called from the public success page — buyer may not be logged in.
  // The session/payment ID itself acts as proof of purchase (only the buyer has it).
  if (!sessionOrPaymentId || sessionOrPaymentId.length < 10) {
    return { error: "Invalid session ID", tickets: null };
  }

  const admin = createAdminClient();

  // Try checkout_session_id first (Stripe Checkout Sessions flow)
  const { data: sessionTickets } = await admin
    .from("tickets")
    .select("ticket_token, status, created_at")
    .filter("metadata->>checkout_session_id", "eq", sessionOrPaymentId);

  if (sessionTickets && sessionTickets.length > 0) {
    return { error: null, tickets: sessionTickets };
  }

  // Try payment_intent_id in metadata (embedded PaymentElement flow)
  const { data: piMetaTickets } = await admin
    .from("tickets")
    .select("ticket_token, status, created_at")
    .filter("metadata->>payment_intent_id", "eq", sessionOrPaymentId);

  if (piMetaTickets && piMetaTickets.length > 0) {
    return { error: null, tickets: piMetaTickets };
  }

  // Try stripe_payment_intent_id column directly
  const { data: piTickets } = await admin
    .from("tickets")
    .select("ticket_token, status, created_at")
    .eq("stripe_payment_intent_id", sessionOrPaymentId);

  if (piTickets && piTickets.length > 0) {
    return { error: null, tickets: piTickets };
  }

  return { error: null, tickets: [] };
}
