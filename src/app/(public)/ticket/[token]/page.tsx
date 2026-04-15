import type { Metadata } from "next";
import { getTicketByToken, generateTicketQRCode } from "@/app/actions/tickets";
import { notFound } from "next/navigation";
import Link from "next/link";
import { FlippableTicket } from "@/components/ticket/flippable-ticket";
import { isValidUUID } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your Ticket — Nocturn",
  robots: "noindex",
};

interface TicketPageProps {
  params: Promise<{ token: string }>;
}

export default async function TicketPage({ params }: TicketPageProps) {
  const { token } = await params;

  if (!isValidUUID(token)) {
    notFound();
  }

  const { ticket, error } = await getTicketByToken(token);

  if (error || !ticket) {
    notFound();
  }

  const typedTicket = ticket as unknown as {
    id: string;
    ticket_token: string;
    status: string;
    price_paid: number | null;
    currency: string | null;
    qr_code: string | null;
    checked_in_at: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    events: {
      id: string;
      title: string;
      slug: string;
      status: string;
      starts_at: string;
      ends_at: string | null;
      doors_at: string | null;
      venues: { name: string; address: string; city: string } | null;
    } | null;
    ticket_tiers: { name: string; price: number } | null;
  };

  // Determine if ticket is invalid (refunded, disputed, failed)
  const invalidStatuses = ["refunded", "disputed", "failed"];
  const isTicketInvalid = invalidStatuses.includes(typedTicket.status);
  const invalidLabel =
    typedTicket.status === "refunded" ? "This ticket has been refunded and is no longer valid" :
    typedTicket.status === "disputed" ? "This ticket is disputed and is no longer valid" :
    typedTicket.status === "failed" ? "This ticket has been cancelled and is no longer valid" :
    null;

  // Check if event is cancelled
  const isEventCancelled = typedTicket.events?.status === "cancelled";

  // If QR code hasn't been generated yet, generate it now (fallback)
  let qrCode = typedTicket.qr_code;
  if (!qrCode) {
    const { qrCode: generated } = await generateTicketQRCode(token);
    qrCode = generated;
  }

  // Extract nested relations
  const event = typedTicket.events;
  const tier = typedTicket.ticket_tiers;

  const eventDate = event?.starts_at
    ? new Date(event.starts_at).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const eventTime = event?.starts_at
    ? new Date(event.starts_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const doorsTime = event?.doors_at
    ? new Date(event.doors_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const purchaseDate = new Date(typedTicket.created_at).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  );

  const isCheckedIn = !!typedTicket.checked_in_at;

  return (
    <div className="min-h-dvh bg-[#09090B] overflow-x-hidden">
      {/* Ambient gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-nocturn/[0.06] rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-nocturn/[0.04] rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.06] px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link href="/" className="text-nocturn font-heading font-bold text-lg min-h-[44px] inline-flex items-center">
            nocturn.
          </Link>
          <span className="text-[11px] text-white/50 uppercase tracking-[0.15em] font-semibold">
            Digital Ticket
          </span>
        </div>
      </header>

      <main className="relative z-10 max-w-lg mx-auto px-4 py-8">
        {/* Invalid ticket banner */}
        {isTicketInvalid && invalidLabel && (
          <div className="mb-4 rounded-xl border-2 border-red-500/30 bg-red-500/10 px-5 py-4 text-center">
            <p className="text-sm font-semibold text-red-400">{invalidLabel}</p>
          </div>
        )}

        {/* Cancelled event banner */}
        {isEventCancelled && (
          <div className="mb-4 rounded-xl border-2 border-yellow-500/30 bg-yellow-500/10 px-5 py-4 text-center">
            <p className="text-sm font-semibold text-yellow-400">This event has been cancelled.</p>
          </div>
        )}

        <FlippableTicket
          eventTitle={event?.title ?? "Event"}
          eventDate={eventDate}
          eventTime={eventTime}
          doorsTime={doorsTime}
          venueName={event?.venues?.name ?? null}
          venueAddress={event?.venues?.address ?? null}
          venueCity={event?.venues?.city ?? null}
          tierName={tier?.name ?? "General Admission"}
          pricePaid={Number(typedTicket.price_paid)}
          attendeeName={
            String(typedTicket.metadata?.customer_name || typedTicket.metadata?.buyer_name || "") ||
            (typedTicket.metadata?.customer_email
              ? String(typedTicket.metadata.customer_email).split("@")[0]
              : null)
          }
          attendeeEmail={String(typedTicket.metadata?.customer_email || "") || "Guest"}
          purchaseDate={purchaseDate}
          status={typedTicket.status}
          isCheckedIn={isCheckedIn}
          checkedInAt={typedTicket.checked_in_at ?? null}
          qrCode={isTicketInvalid ? null : (qrCode ?? null)}
          ticketToken={typedTicket.ticket_token}
        />
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6">
        <Link href="/" className="text-[11px] text-white/40 hover:text-white/60 transition-colors min-h-[44px] inline-flex items-center">
          Powered by Nocturn
        </Link>
      </footer>
    </div>
  );
}
