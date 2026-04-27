import * as React from "react";
import Layout, { DetailRow } from "./_layout";

export interface LineupInviteProps {
  artistFirstName: string;
  collectiveName: string;
  eventTitle: string;
  eventDate: string;
  venueName: string | null;
  setTime: string | null;
  feeDisplay: string | null;
  acceptLink: string;
}

export default function LineupInvite({
  artistFirstName,
  collectiveName,
  eventTitle,
  eventDate,
  venueName,
  setTime,
  feeDisplay,
  acceptLink,
}: LineupInviteProps) {
  const greeting = artistFirstName || "there";

  const details: DetailRow[] = [{ label: "Date", value: eventDate }];
  if (venueName) details.push({ label: "Venue", value: venueName });
  if (setTime) details.push({ label: "Set time", value: setTime });
  if (feeDisplay) details.push({ label: "Fee", value: feeDisplay });

  return (
    <Layout
      preheader={`${collectiveName} added you to ${eventTitle} on ${eventDate}.`}
      eyebrow="Booking request"
      headline={`${greeting} — you're booked for ${eventTitle}.`}
      collectiveName={collectiveName}
      intro={
        <>
          <b style={{ color: "#FAFAFA" }}>{collectiveName}</b> added you to the
          lineup. Accept on Nocturn to confirm your set time, see your advance,
          and coordinate with the crew.
        </>
      }
      details={details}
      cta={{ label: "Review & confirm  →", href: acceptLink }}
    >
      <p
        style={{
          color: "#71717A",
          fontSize: "13px",
          margin: "16px 0 0",
        }}
      >
        Not expecting this? You can ignore the email — nothing changes on your
        end.
      </p>
    </Layout>
  );
}
