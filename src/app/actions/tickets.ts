"use server";

import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

const BASE_URL = "https://nocturn-app-navy.vercel.app";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Generate a QR code data URL for a ticket and persist it.
 * The QR encodes the check-in URL: https://nocturn-app-navy.vercel.app/check-in/{ticket_token}
 */
export async function generateTicketQRCode(ticketToken: string) {
  const supabase = createAdminClient();

  // Verify the ticket exists
  const { data: ticket, error: fetchError } = await supabase
    .from("tickets")
    .select("id, qr_code")
    .eq("ticket_token", ticketToken)
    .single();

  if (fetchError || !ticket) {
    return { error: "Ticket not found", qrCode: null };
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
  const { error: updateError } = await supabase
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
  const supabase = createAdminClient();

  const { data: ticket, error } = await supabase
    .from("tickets")
    .select(
      `
      id,
      ticket_token,
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
    .single();

  if (error || !ticket) {
    return { error: "Ticket not found", ticket: null };
  }

  return { error: null, ticket };
}

/**
 * Look up tickets by Stripe checkout session ID.
 */
export async function getTicketsBySessionId(sessionId: string) {
  const supabase = createAdminClient();

  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("ticket_token, status, created_at")
    .filter("metadata->>checkout_session_id", "eq", sessionId);

  if (error) {
    return { error: "Failed to look up tickets", tickets: null };
  }

  return { error: null, tickets };
}
