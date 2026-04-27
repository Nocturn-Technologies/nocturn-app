import * as React from "react";
import Layout, { DetailRow } from "./_layout";

export interface RsvpConfirmationProps {
  eventTitle: string;
  collectiveName: string;
  startsAt: string;
  venueName: string | null;
  venueCity: string | null;
  status: "yes" | "maybe" | "no";
  eventUrl: string;
  firstName: string | null;
}

function formatDate(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("en", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      time: d.toLocaleTimeString("en", {
        hour: "numeric",
        minute: "2-digit",
      }),
    };
  } catch {
    return { date: "", time: "" };
  }
}

export default function RsvpConfirmation({
  eventTitle,
  collectiveName,
  startsAt,
  venueName,
  venueCity,
  status,
  eventUrl,
  firstName,
}: RsvpConfirmationProps) {
  const { date, time } = formatDate(startsAt);
  const venueLine = venueName
    ? `${venueName}${venueCity ? `, ${venueCity}` : ""}`
    : "Venue details coming soon";

  const isYes = status === "yes";
  const headline = isYes
    ? `You're going to ${eventTitle}.`
    : `We've got you marked as maybe.`;
  const intro = isYes ? (
    <>
      {firstName ? `${firstName} — ` : ""}
      <b style={{ color: "#FAFAFA" }}>{collectiveName}</b> has you confirmed.
      Your name's at the door.
    </>
  ) : (
    <>
      {firstName ? `${firstName} — ` : ""}
      <b style={{ color: "#FAFAFA" }}>{collectiveName}</b> will keep a spot
      warm. Update your RSVP any time using the button below.
    </>
  );

  const details: DetailRow[] = [
    { label: "When", value: time ? `${date} · ${time}` : date },
    { label: "Where", value: venueLine },
    { label: "Hosted by", value: collectiveName },
  ];

  return (
    <Layout
      preheader={
        isYes
          ? `${date}${time ? ` · ${time}` : ""} · ${venueLine}. No QR — your name is at the door.`
          : `Update your RSVP any time. We'll keep a spot warm.`
      }
      eyebrow={isYes ? "On the list" : "Marked as maybe"}
      eyebrowVariant={isYes ? "green" : "default"}
      headline={headline}
      collectiveName={collectiveName}
      intro={intro}
      details={details}
      cta={{
        label: isYes ? "View event & manage RSVP  →" : "Update my RSVP  →",
        href: eventUrl,
      }}
    >
      <p
        style={{
          color: "#A1A1AA",
          fontSize: "13px",
          margin: "16px 0 0",
          lineHeight: 1.5,
        }}
      >
        Plans changed? Tap the button — your existing RSVP loads and you can
        switch between{" "}
        <b style={{ color: "#FAFAFA" }}>Going</b>,{" "}
        <b style={{ color: "#FAFAFA" }}>Maybe</b>, or{" "}
        <b style={{ color: "#FAFAFA" }}>Can&apos;t go</b> in one tap. No login
        required.
      </p>
    </Layout>
  );
}
