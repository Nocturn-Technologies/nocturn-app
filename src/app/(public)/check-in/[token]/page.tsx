import type { Metadata } from "next";
import { getTicketByToken } from "@/app/actions/tickets";

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PublicCheckInButton } from "./check-in-button";
import { isValidUUID } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Check In — Nocturn",
  robots: "noindex",
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PublicCheckInPage({ params }: Props) {
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

  const event = typedTicket.events;
  const tier = typedTicket.ticket_tiers;

  const isCheckedIn = typedTicket.status === "checked_in";
  const isPaid = typedTicket.status === "paid";
  const isEventCancelled = event?.status === "cancelled";
  const isPastEvent = event?.starts_at
    ? new Date(event.starts_at).getTime() < Date.now()
    : false;

  const checkedInTime = typedTicket.checked_in_at
    ? new Date(typedTicket.checked_in_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const checkedInDate = typedTicket.checked_in_at
    ? new Date(typedTicket.checked_in_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

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

  // Check if the current user is an authenticated admin (collective member)
  // If so, redirect to the scanner page
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let canCheckIn = false;
  if (user && event) {
    const { data: membershipsRaw } = await supabase
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null);
    const memberships = membershipsRaw as { collective_id: string }[] | null;

    if (memberships && memberships.length > 0) {
      const collectiveIds = memberships.map((m) => m.collective_id);
      const { data: evRaw } = await supabase
        .from("events")
        .select("collective_id")
        .eq("id", event.id)
        .is("deleted_at", null)
        .maybeSingle();
      const ev = evRaw as { collective_id: string } | null;

      if (ev && collectiveIds.includes(ev.collective_id)) {
        canCheckIn = true;
      }
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-nocturn font-heading font-bold text-xl"
          >
            Nocturn
          </Link>
          <span className="text-xs text-muted-foreground">Check-In</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Cancelled event banner */}
        {isEventCancelled && (
          <div className="rounded-xl border-2 border-yellow-500/30 bg-yellow-500/10 px-5 py-4 text-center">
            <p className="text-sm font-semibold text-yellow-400">This event has been cancelled.</p>
          </div>
        )}

        {/* Past event banner */}
        {isPastEvent && !isEventCancelled && (
          <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/10 px-5 py-4 text-center">
            <p className="text-sm font-semibold text-amber-400">This event has already passed.</p>
          </div>
        )}

        {/* Ticket Summary Card */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className={`px-6 py-5 ${isCheckedIn ? "bg-amber-600" : isPaid ? "bg-green-600" : "bg-red-600"}`}>
            <h1 className="text-xl font-bold font-heading text-white">
              {event?.title ?? "Event"}
            </h1>
            {tier && (
              <p className="text-white/80 text-sm mt-1">{tier.name}</p>
            )}
          </div>

          <div className="px-6 py-6 space-y-4">
            {/* Status */}
            <div className="flex items-center justify-center">
              {isCheckedIn ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
                    <svg
                      className="h-8 w-8 text-amber-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold text-amber-500">
                    Already Checked In
                  </p>
                  {checkedInTime && (
                    <p className="text-sm text-muted-foreground">
                      Checked in at {checkedInTime}{checkedInDate ? ` on ${checkedInDate}` : ""}
                    </p>
                  )}
                </div>
              ) : isPaid ? (
                <div className="flex flex-col items-center gap-3 py-4 w-full">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                    <svg
                      className="h-8 w-8 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z"
                      />
                    </svg>
                  </div>
                  <p className="text-base font-medium text-green-500">Ready to Check In</p>
                  {canCheckIn && !isEventCancelled ? (
                    <PublicCheckInButton
                      ticketToken={token}
                      eventId={event?.id ?? ""}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">
                      Present this QR code at the door for entry
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                    <svg
                      className="h-8 w-8 text-red-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </div>
                  <p className="text-base font-medium text-red-500">
                    Ticket Not Valid
                  </p>
                  <p className="text-sm text-muted-foreground capitalize">
                    Status: {typedTicket.status === "refunded" ? "Refunded" : typedTicket.status === "cancelled" ? "Cancelled" : typedTicket.status}
                  </p>
                </div>
              )}
            </div>

            {/* Event Details */}
            {eventDate && (
              <div className="flex items-start gap-3 border-t border-border pt-4">
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
                      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">{eventDate}</p>
                  {eventTime && (
                    <p className="text-xs text-muted-foreground">
                      Starts {eventTime}
                    </p>
                  )}
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
                      d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">{event.venues.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.venues.address}, {event.venues.city}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Admin link — go to scanner */}
        {canCheckIn && event && (
          <Link
            href={`/dashboard/events/${event.id}/check-in`}
            className="block w-full rounded-xl border border-nocturn/30 bg-nocturn/5 p-4 text-center text-sm font-medium text-nocturn hover:bg-nocturn/10 transition-colors"
          >
            Open Scanner Dashboard
          </Link>
        )}

        {/* Ticket reference */}
        <p className="text-center text-xs text-muted-foreground">
          Ticket: ...{token.slice(-8)}
        </p>

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
