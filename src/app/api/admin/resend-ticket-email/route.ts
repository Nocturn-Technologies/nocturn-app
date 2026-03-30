import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/config";
import { sendTicketConfirmation } from "@/lib/email/actions";
import QRCode from "qrcode";

export async function POST(request: NextRequest) {
  const { token, ticketId } = await request.json();

  if (token !== "K9nAElnEXyf60-UV98VcpCmJs-IbgwgxqfBcvBic6gg") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: ticket, error } = await admin
    .from("tickets")
    .select(`
      id, ticket_token, price_paid, metadata,
      events:event_id (title, starts_at, venues:venue_id (name)),
      ticket_tiers:ticket_tier_id (name)
    `)
    .eq("id", ticketId)
    .maybeSingle();

  if (error || !ticket) {
    return NextResponse.json({ error: "Ticket not found", detail: error }, { status: 404 });
  }

  const email = (ticket.metadata as Record<string, unknown>)?.customer_email as string;
  if (!email) {
    return NextResponse.json({ error: "No customer email on ticket" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
  const event = ticket.events as unknown as { title: string; starts_at: string; venues: { name: string } | null } | null;
  const tier = ticket.ticket_tiers as unknown as { name: string } | null;

  const checkInUrl = `${appUrl}/check-in/${ticket.ticket_token}`;
  const qrDataUrl = await QRCode.toDataURL(checkInUrl, {
    width: 400, margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });

  const result = await sendTicketConfirmation({
    to: email,
    eventTitle: event?.title || "Event",
    eventDate: new Date(event?.starts_at || "").toLocaleDateString("en", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    }),
    venueName: event?.venues?.name || "TBA",
    tierName: tier?.name || "General Admission",
    quantity: 1,
    totalPrice: `$${Number(ticket.price_paid).toFixed(2)}`,
    ticketLink: `${appUrl}/ticket/${ticket.ticket_token}`,
    qrCodes: [qrDataUrl],
    ticketTokens: [ticket.ticket_token],
  });

  return NextResponse.json({ success: true, emailResult: result });
}
