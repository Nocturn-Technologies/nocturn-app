import type { Metadata } from "next";
import { getTicketByToken, generateTicketQRCode } from "@/app/actions/tickets";
import { notFound } from "next/navigation";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Your Ticket — Nocturn",
  robots: "noindex",
};

interface TicketPageProps {
  params: Promise<{ token: string }>;
}

export default async function TicketPage({ params }: TicketPageProps) {
  const { token } = await params;

  const { ticket, error } = await getTicketByToken(token);

  if (error || !ticket) {
    notFound();
  }

  // If QR code hasn't been generated yet, generate it now (fallback)
  let qrCode = ticket.qr_code;
  if (!qrCode) {
    const { qrCode: generated } = await generateTicketQRCode(token);
    qrCode = generated;
  }

  // Extract nested relations
  const event = ticket.events as unknown as {
    id: string;
    title: string;
    slug: string;
    starts_at: string;
    ends_at: string | null;
    doors_at: string | null;
    venues: { name: string; address: string; city: string } | null;
  } | null;

  const tier = ticket.ticket_tiers as unknown as {
    name: string;
    price: number;
  } | null;

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

  const purchaseDate = new Date(ticket.created_at).toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  const isCheckedIn = !!ticket.checked_in_at;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link href="/" className="text-nocturn font-heading font-bold text-xl">
            Nocturn
          </Link>
          <span className="text-xs text-muted-foreground">Digital Ticket</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Ticket Card */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Event Header */}
          <div className="bg-nocturn px-6 py-5">
            <h1 className="text-xl font-bold font-heading text-white">
              {event?.title ?? "Event"}
            </h1>
            {tier && (
              <p className="text-white/80 text-sm mt-1">{tier.name}</p>
            )}
          </div>

          {/* QR Code Section */}
          <div className="px-6 py-8 flex flex-col items-center">
            {isCheckedIn ? (
              <div className="w-[240px] h-[240px] sm:w-[280px] sm:h-[280px] rounded-xl bg-muted flex flex-col items-center justify-center space-y-3">
                <div className="text-4xl">&#x2705;</div>
                <p className="text-sm font-medium text-muted-foreground">
                  Already checked in
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(ticket.checked_in_at!).toLocaleString("en-US")}
                </p>
              </div>
            ) : qrCode ? (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCode}
                  alt="Ticket QR Code"
                  width={280}
                  height={280}
                  className="w-[240px] h-[240px] sm:w-[280px] sm:h-[280px]"
                />
              </div>
            ) : (
              <div className="w-[240px] h-[240px] sm:w-[280px] sm:h-[280px] rounded-xl bg-muted flex items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  QR code unavailable
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4 text-center">
              Present this QR code at the door for entry
            </p>
          </div>

          {/* Dashed separator */}
          <div className="relative px-6">
            <div className="border-t border-dashed border-border" />
            <div className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-background" />
            <div className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-background" />
          </div>

          {/* Event Details */}
          <div className="px-6 py-6 space-y-4">
            {eventDate && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-nocturn/10 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-4 h-4 text-nocturn"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {eventDate}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {doorsTime ? `Doors ${doorsTime} · ` : ""}
                    {eventTime ? `Starts ${eventTime}` : ""}
                  </p>
                </div>
              </div>
            )}

            {event?.venues && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-nocturn/10 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-4 h-4 text-nocturn"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {event.venues.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {event.venues.address}, {event.venues.city}
                  </p>
                </div>
              </div>
            )}

            {/* Ticket Details Row */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Tier
                </p>
                <p className="text-sm font-medium text-foreground">
                  {tier?.name ?? "General"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Price
                </p>
                <p className="text-sm font-medium text-foreground">
                  {Number(ticket.price_paid) === 0
                    ? "Free"
                    : `$${Number(ticket.price_paid).toFixed(2)}`}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Purchased
                </p>
                <p className="text-sm font-medium text-foreground">
                  {purchaseDate}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Status
                </p>
                <p className="text-sm font-medium text-foreground capitalize">
                  {ticket.status}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Ticket Token (small reference) */}
        <p className="text-center text-xs text-muted-foreground break-all">
          Ticket: {ticket.ticket_token}
        </p>

        {/* Footer */}
        <div className="text-center pt-2">
          <Link
            href="/"
            className="text-sm text-nocturn hover:text-nocturn-light transition-colors"
          >
            nocturn.app
          </Link>
        </div>
      </main>
    </div>
  );
}
