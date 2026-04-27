import * as React from "react";
import Layout, { DetailRow } from "./_layout";

export interface DayOfHypeProps {
  eventTitle: string;
  venueName: string;
  doorsTime: string;
  showTime: string;
  dressCode: string | null;
  ticketLink: string;
}

export default function DayOfHype({
  eventTitle,
  venueName,
  doorsTime,
  showTime,
  dressCode,
  ticketLink,
}: DayOfHypeProps) {
  const details: DetailRow[] = [
    { label: "Where", value: venueName },
    { label: "Doors", value: doorsTime },
    { label: "Show", value: showTime },
  ];
  if (dressCode) details.push({ label: "Dress", value: dressCode });

  return (
    <Layout
      preheader={`Doors at ${doorsTime}. Your QR is on your ticket — screenshot it now in case service is spotty.`}
      eyebrow="Tonight"
      headline="Tonight is the night."
      intro={
        <>
          <b style={{ color: "#FAFAFA" }}>{eventTitle}</b> is happening today.
          Tap below to pull up your QR — we recommend screenshotting it now in
          case service is patchy at the door.
        </>
      }
      details={details}
      cta={{ label: "View your ticket  →", href: ticketLink }}
      footerVariant="promotional"
    />
  );
}
